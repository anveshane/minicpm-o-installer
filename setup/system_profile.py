"""Detect OS, architecture, GPU, RAM, disk — recommend backend & quant.

Stdlib only — no pip dependencies. Can run standalone:
    python -m setup.system_profile
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass


@dataclass
class SystemProfile:
    os_name: str        # "Darwin", "Linux", "Windows"
    arch: str           # "arm64", "x86_64", "aarch64"
    gpu_backend: str    # "metal", "cuda-12.4", "vulkan", "hip-radeon", "cpu"
    gpu_name: str       # human-readable GPU name
    vram_mb: int        # 0 if unknown
    ram_mb: int
    disk_free_mb: int
    cpu_cores: int
    recommended_quant: str  # "F16", "Q8_0", "Q5_K_M", "Q4_K_M", "Q4_K_S"

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


# ---------------------------------------------------------------------------
# GPU detection helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], timeout: int = 10) -> str:
    """Run a command, return stdout or empty string on failure."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return ""


def _detect_gpu_macos() -> tuple[str, str, int]:
    """Return (gpu_name, vendor, vram_mb) on macOS."""
    out = _run(["system_profiler", "SPDisplaysDataType"])
    if not out:
        return ("Unknown", "apple", 0)

    gpu_name = "Apple GPU"
    vram_mb = 0

    # Extract chipset/model name
    for line in out.splitlines():
        stripped = line.strip()
        if stripped.startswith("Chipset Model:"):
            gpu_name = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Chip:"):
            gpu_name = stripped.split(":", 1)[1].strip()

    # On Apple Silicon the "VRAM" is unified memory — use total RAM
    if platform.machine() == "arm64":
        vram_mb = _get_ram_mb()

    return (gpu_name, "apple", vram_mb)


def _detect_gpu_nvidia() -> tuple[str, int, bool]:
    """Return (gpu_name, vram_mb, cuda_available) via nvidia-smi."""
    out = _run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    if not out:
        return ("", 0, False)
    parts = out.splitlines()[0].split(",")
    name = parts[0].strip() if len(parts) > 0 else "NVIDIA GPU"
    vram = 0
    if len(parts) > 1:
        try:
            vram = int(float(parts[1].strip()))
        except ValueError:
            pass
    # Check if CUDA toolkit is installed
    cuda = bool(_run(["nvcc", "--version"]))
    return (name, vram, cuda)


def _detect_gpu_amd_linux() -> tuple[str, int]:
    """Return (gpu_name, vram_mb) via rocm-smi on Linux."""
    out = _run(["rocm-smi", "--showproductname"])
    name = ""
    if out:
        for line in out.splitlines():
            if "GPU" in line or "Card" in line:
                name = line.strip()
                break
    vram_out = _run(["rocm-smi", "--showmeminfo", "vram"])
    vram = 0
    if vram_out:
        m = re.search(r"Total.*?:\s*(\d+)", vram_out)
        if m:
            # rocm-smi reports in bytes or MB depending on version
            val = int(m.group(1))
            vram = val if val < 1_000_000 else val // (1024 * 1024)
    return (name or "AMD GPU", vram)


def _detect_vulkan() -> bool:
    """Return True if Vulkan is available."""
    return bool(_run(["vulkaninfo", "--summary"]))


# ---------------------------------------------------------------------------
# RAM / disk helpers
# ---------------------------------------------------------------------------

def _get_ram_mb() -> int:
    """Return total system RAM in MB."""
    os_name = platform.system()
    if os_name == "Darwin":
        out = _run(["sysctl", "-n", "hw.memsize"])
        if out:
            try:
                return int(out) // (1024 * 1024)
            except ValueError:
                pass
    elif os_name == "Linux":
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return kb // 1024
        except (OSError, ValueError):
            pass
    elif os_name == "Windows":
        out = _run(["wmic", "ComputerSystem", "get", "TotalPhysicalMemory"])
        for line in out.splitlines():
            line = line.strip()
            if line.isdigit():
                return int(line) // (1024 * 1024)
    # Fallback via os.sysconf (Unix)
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return (pages * page_size) // (1024 * 1024)
    except (AttributeError, ValueError):
        return 0


def _get_disk_free_mb(path: str = ".") -> int:
    usage = shutil.disk_usage(path)
    return int(usage.free // (1024 * 1024))


# ---------------------------------------------------------------------------
# Backend & quant selection
# ---------------------------------------------------------------------------

def _select_gpu_backend(os_name: str, arch: str, gpu_vendor: str, cuda_available: bool) -> str:
    if os_name == "Darwin" and arch == "arm64":
        return "metal"
    if os_name == "Darwin":
        return "cpu"
    if gpu_vendor == "nvidia" and cuda_available:
        return "cuda-12.4"
    if gpu_vendor == "nvidia":
        return "vulkan" if _detect_vulkan() else "cpu"
    if gpu_vendor == "amd":
        if os_name == "Windows":
            return "hip-radeon"
        return "vulkan" if _detect_vulkan() else "cpu"
    return "cpu"


def _select_quant(vram_mb: int, ram_mb: int, gpu_backend: str, os_name: str, arch: str) -> str:
    # Supporting models (vision, audio, TTS, token2wav) are all F16 with no
    # quant variants available — they add ~4 GB on top of the main GGUF.
    SUPPORT_MODELS_MB = 4000  # vision ~1.1 + audio ~0.66 + tts ~1.17 + token2wav ~0.92

    if gpu_backend == "cpu":
        # Discrete: OS uses its own RAM, model loads into remaining RAM
        available = ram_mb
        overhead = SUPPORT_MODELS_MB + 4000  # 4 GB for OS + services
    elif os_name == "Darwin" and arch == "arm64":
        # Apple Silicon unified memory: OS, apps, GPU compositor, window
        # server, services ALL compete for the same pool. Realistically
        # only ~60% of total RAM is available for model loading.
        available = int(ram_mb * 0.60)
        overhead = SUPPORT_MODELS_MB
    else:
        # Discrete GPU: VRAM is dedicated to models
        available = vram_mb
        overhead = SUPPORT_MODELS_MB

    budget = available - overhead

    if budget >= 16500:
        return "F16"       # main ~16.4 GB
    if budget >= 9000:
        return "Q8_0"      # main ~8.7 GB
    if budget >= 6000:
        return "Q5_K_M"    # main ~5.9 GB
    if budget >= 5000:
        return "Q4_K_M"    # main ~5.0 GB
    return "Q4_K_S"        # main ~4.8 GB


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_system() -> SystemProfile:
    os_name = platform.system()
    arch = platform.machine()
    # Normalize arch
    if arch in ("AMD64", "x86_64"):
        arch = "x86_64"
    elif arch in ("arm64", "aarch64"):
        arch = "arm64"

    gpu_name = "Unknown"
    gpu_vendor = ""
    vram_mb = 0
    cuda_available = False

    if os_name == "Darwin":
        gpu_name, gpu_vendor, vram_mb = _detect_gpu_macos()
    else:
        # Try NVIDIA first
        nv_name, nv_vram, cuda_available = _detect_gpu_nvidia()
        if nv_name:
            gpu_name, gpu_vendor, vram_mb = nv_name, "nvidia", nv_vram
        elif os_name == "Linux":
            amd_name, amd_vram = _detect_gpu_amd_linux()
            if amd_vram > 0:
                gpu_name, gpu_vendor, vram_mb = amd_name, "amd", amd_vram

    ram_mb = _get_ram_mb()
    gpu_backend = _select_gpu_backend(os_name, arch, gpu_vendor, cuda_available)
    quant = _select_quant(vram_mb, ram_mb, gpu_backend, os_name, arch)

    return SystemProfile(
        os_name=os_name,
        arch=arch,
        gpu_backend=gpu_backend,
        gpu_name=gpu_name,
        vram_mb=vram_mb,
        ram_mb=ram_mb,
        disk_free_mb=_get_disk_free_mb(),
        cpu_cores=os.cpu_count() or 1,
        recommended_quant=quant,
    )


if __name__ == "__main__":
    profile = detect_system()
    print(profile.to_json())
