"""Download prebuilt binaries and models.

Uses stdlib urllib for binary downloads.
Uses huggingface_hub (after venv creation) for model downloads.
"""

from __future__ import annotations

import io
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from .config import Config
from .system_profile import SystemProfile

# ---------------------------------------------------------------------------
# Binary asset maps
# ---------------------------------------------------------------------------

LLAMA_BINARY_MAP: dict[tuple[str, str, str], str] = {
    # (os_name, arch, gpu_backend) -> release asset suffix
    ("Darwin", "arm64", "metal"):       "bin-macos-arm64",
    ("Darwin", "x86_64", "cpu"):        "bin-macos-x64",
    ("Linux", "x86_64", "cpu"):         "bin-ubuntu-x64",
    ("Linux", "x86_64", "vulkan"):      "bin-ubuntu-vulkan-x64",
    ("Linux", "x86_64", "cuda-12.4"):   "bin-ubuntu-cuda-12.4-x64",
    ("Windows", "x86_64", "cpu"):       "bin-win-cpu-x64",
    ("Windows", "x86_64", "cuda-12.4"): "bin-win-cuda-12.4-x64",
    ("Windows", "x86_64", "vulkan"):    "bin-win-vulkan-x64",
    ("Windows", "x86_64", "hip-radeon"): "bin-win-hip-radeon-x64",
}

LIVEKIT_MAP: dict[tuple[str, str], str | None] = {
    ("Darwin", "arm64"):   None,  # use Homebrew
    ("Darwin", "x86_64"):  None,
    ("Linux", "x86_64"):   "livekit_{ver}_linux_amd64.tar.gz",
    ("Linux", "arm64"):    "livekit_{ver}_linux_arm64.tar.gz",
    ("Windows", "x86_64"): "livekit_{ver}_windows_amd64.zip",
}

NODE_MAP: dict[tuple[str, str], str] = {
    ("Darwin", "arm64"):   "node-{ver}-darwin-arm64.tar.gz",
    ("Darwin", "x86_64"):  "node-{ver}-darwin-x64.tar.gz",
    ("Linux", "x86_64"):   "node-{ver}-linux-x64.tar.xz",
    ("Linux", "arm64"):    "node-{ver}-linux-arm64.tar.xz",
    ("Windows", "x86_64"): "node-{ver}-win-x64.zip",
}


# ---------------------------------------------------------------------------
# Download utilities
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    print(f"  [download] {msg}", flush=True)


def _download(url: str, dest: Path, desc: str = "") -> None:
    """Download a URL to a local path, with simple progress."""
    label = desc or dest.name
    _log(f"Downloading {label} ...")
    _log(f"  URL: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "minicpm-o-installer/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = resp.headers.get("Content-Length")
        total = int(total) if total else None
        dest.parent.mkdir(parents=True, exist_ok=True)
        downloaded = 0
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    mb = downloaded / (1024 * 1024)
                    print(f"\r  [download] {label}: {mb:.1f} MB ({pct}%)", end="", flush=True)
        print(flush=True)
    _log(f"  Saved to {dest}")


def _extract_zip(archive: Path, dest_dir: Path) -> None:
    """Extract a zip archive into dest_dir."""
    _log(f"Extracting {archive.name} ...")
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(dest_dir)


def _extract_tar(archive: Path, dest_dir: Path) -> None:
    """Extract a tar.gz or tar.xz archive into dest_dir."""
    _log(f"Extracting {archive.name} ...")
    mode = "r:xz" if archive.name.endswith(".xz") else "r:gz"
    with tarfile.open(archive, mode) as tf:
        tf.extractall(dest_dir)


def _make_executable(path: Path) -> None:
    """chmod +x on Unix."""
    if sys.platform != "win32":
        path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _resolve_github_latest_tag(repo: str, proxy: str = "") -> str | None:
    """Get the latest release tag from GitHub API. Returns None if no releases exist."""
    base = proxy.rstrip("/") if proxy else "https://api.github.com"
    if proxy:
        url = f"https://api.github.com/repos/{repo}/releases/latest"
    else:
        url = f"{base}/repos/{repo}/releases/latest"
    req = urllib.request.Request(url, headers={
        "User-Agent": "minicpm-o-installer/1.0",
        "Accept": "application/vnd.github.v3+json",
    })
    import json
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return data["tag_name"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


# ---------------------------------------------------------------------------
# llama-server download
# ---------------------------------------------------------------------------

def download_llama_server(profile: SystemProfile, cfg: Config) -> None:
    """Download and extract the llama-server binary + libs."""
    bin_dir = cfg.bin_dir
    server_path = bin_dir / cfg.llama_server_name
    if server_path.exists():
        _log(f"llama-server already exists at {server_path}, skipping.")
        return

    key = (profile.os_name, profile.arch, profile.gpu_backend)
    suffix = LLAMA_BINARY_MAP.get(key)
    if not suffix:
        raise RuntimeError(
            f"No prebuilt llama-server binary for {key}. "
            f"Available: {list(LLAMA_BINARY_MAP.keys())}"
        )

    tag = cfg.llama_release_tag
    if tag == "latest":
        tag = _resolve_github_latest_tag(cfg.llama_release_repo, cfg.github_proxy)
        if tag is None:
            _log(f"WARNING: No releases found on {cfg.llama_release_repo}.")
            _log(f"  The CI build may still be in progress.")
            _log(f"  Check: https://github.com/{cfg.llama_release_repo}/actions")
            _log(f"  Skipping llama-server download — you can re-run install later.")
            return
        _log(f"Resolved latest llama release tag: {tag}")

    asset_name = f"llama-{tag}-{suffix}.zip"
    url = cfg.github_url(f"{cfg.llama_release_repo}/releases/download/{tag}/{asset_name}")

    with tempfile.TemporaryDirectory() as tmpdir:
        archive = Path(tmpdir) / asset_name
        _download(url, archive, "llama-server")
        bin_dir.mkdir(parents=True, exist_ok=True)
        _extract_zip(archive, Path(tmpdir) / "extracted")

        # Copy all binaries and libs from extracted directory to bin_dir
        extracted = Path(tmpdir) / "extracted"
        for item in extracted.rglob("*"):
            if item.is_file():
                dest = bin_dir / item.name
                shutil.copy2(item, dest)
                if item.suffix in ("", ".dylib", ".so") or item.name.startswith("llama-"):
                    _make_executable(dest)

    _log("llama-server installed.")


# ---------------------------------------------------------------------------
# livekit-server download
# ---------------------------------------------------------------------------

def download_livekit(profile: SystemProfile, cfg: Config) -> None:
    """Download livekit-server binary or install via Homebrew on macOS."""
    livekit_path = cfg.bin_dir / cfg.livekit_server_name
    if livekit_path.exists() or shutil.which("livekit-server"):
        _log("livekit-server already available, skipping.")
        return

    key = (profile.os_name, profile.arch)
    pattern = LIVEKIT_MAP.get(key)

    if pattern is None:
        # macOS — use Homebrew
        _log("Installing livekit-server via Homebrew ...")
        if not shutil.which("brew"):
            raise RuntimeError(
                "Homebrew is required to install livekit-server on macOS. "
                "Install from: https://brew.sh"
            )
        subprocess.check_call(["brew", "install", "livekit"])
        _log("livekit-server installed via Homebrew.")
        return

    asset_name = pattern.format(ver=cfg.livekit_version)
    url = cfg.github_url(f"livekit/livekit/releases/download/v{cfg.livekit_version}/{asset_name}")

    with tempfile.TemporaryDirectory() as tmpdir:
        archive = Path(tmpdir) / asset_name
        _download(url, archive, "livekit-server")
        cfg.bin_dir.mkdir(parents=True, exist_ok=True)

        if asset_name.endswith(".zip"):
            _extract_zip(archive, Path(tmpdir) / "extracted")
        else:
            _extract_tar(archive, Path(tmpdir) / "extracted")

        # Find and copy the livekit-server binary
        extracted = Path(tmpdir) / "extracted"
        for item in extracted.rglob("livekit-server*"):
            if item.is_file():
                dest = cfg.bin_dir / item.name
                shutil.copy2(item, dest)
                _make_executable(dest)
                break

    _log("livekit-server installed.")


# ---------------------------------------------------------------------------
# Node.js download
# ---------------------------------------------------------------------------

def download_node(profile: SystemProfile, cfg: Config) -> None:
    """Download a standalone Node.js if not already available."""
    node_dir = cfg.node_dir
    # Check if node already exists in bin/node or on PATH
    node_bin = node_dir / ("bin" if profile.os_name != "Windows" else "") / (
        "node.exe" if profile.os_name == "Windows" else "node"
    )
    if node_bin.exists() or shutil.which("node"):
        _log("Node.js already available, skipping.")
        return

    key = (profile.os_name, profile.arch)
    pattern = NODE_MAP.get(key)
    if not pattern:
        raise RuntimeError(f"No Node.js binary available for {key}")

    asset_name = pattern.format(ver=cfg.node_version)
    url = f"{cfg.node_dist_url()}/{cfg.node_version}/{asset_name}"

    with tempfile.TemporaryDirectory() as tmpdir:
        archive = Path(tmpdir) / asset_name
        _download(url, archive, "Node.js")
        node_dir.mkdir(parents=True, exist_ok=True)

        if asset_name.endswith(".zip"):
            _extract_zip(archive, Path(tmpdir) / "extracted")
        else:
            _extract_tar(archive, Path(tmpdir) / "extracted")

        # The archive extracts to a directory like node-v22.14.0-darwin-arm64/
        extracted = Path(tmpdir) / "extracted"
        subdirs = [d for d in extracted.iterdir() if d.is_dir()]
        if subdirs:
            # Move contents of the extracted subdir to node_dir
            src = subdirs[0]
            if node_dir.exists():
                shutil.rmtree(node_dir)
            shutil.copytree(src, node_dir)

    _log("Node.js installed.")


# ---------------------------------------------------------------------------
# Python venv + backend deps
# ---------------------------------------------------------------------------

def create_venv(cfg: Config) -> None:
    """Create a Python venv and install backend dependencies."""
    # Determine python and pip paths inside venv
    if sys.platform == "win32":
        venv_python = str(cfg.venv_dir / "Scripts" / "python.exe")
        pip = str(cfg.venv_dir / "Scripts" / "pip")
    else:
        venv_python = str(cfg.venv_dir / "bin" / "python")
        pip = str(cfg.venv_dir / "bin" / "pip")

    if not cfg.venv_dir.exists():
        _log("Creating Python virtual environment ...")
        subprocess.check_call([sys.executable, "-m", "venv", str(cfg.venv_dir)])

        _log("Upgrading pip ...")
        subprocess.check_call([venv_python, "-m", "pip", "install", "--upgrade", "pip"], stdout=subprocess.DEVNULL)

    # Check if huggingface_hub is already installed (marks a complete venv)
    try:
        subprocess.check_call(
            [venv_python, "-c", "import huggingface_hub"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        _log("Python venv already set up, skipping.")
        return
    except subprocess.CalledProcessError:
        pass  # Need to install deps

    # Install backend dependencies from pyproject.toml
    backend_dir = cfg.app_dir / "omini_backend_code" / "code"
    _log("Installing backend dependencies ...")
    subprocess.check_call([pip, "install", "-e", str(backend_dir)])

    # Install cpp_server dependencies
    cpp_reqs = cfg.app_dir / "cpp_server" / "requirements.txt"
    if cpp_reqs.exists():
        _log("Installing cpp_server dependencies ...")
        subprocess.check_call([pip, "install", "-r", str(cpp_reqs)])

    # Install huggingface_hub for model downloads
    _log("Installing huggingface_hub ...")
    subprocess.check_call([pip, "install", "huggingface_hub"])

    _log("Python venv ready.")


# ---------------------------------------------------------------------------
# Model download
# ---------------------------------------------------------------------------

def download_models(cfg: Config, quant: str) -> None:
    """Download model files via huggingface_hub."""
    model_dir = cfg.model_dir
    # Check if GGUF already exists
    if model_dir.exists() and any(model_dir.glob("*.gguf")):
        _log("Model GGUF already present, skipping.")
        return

    _log(f"Downloading model (quant={quant}) from {cfg.hf_model_repo} ...")

    # Use the venv's Python to run huggingface_hub
    if sys.platform == "win32":
        venv_python = str(cfg.venv_dir / "Scripts" / "python")
    else:
        venv_python = str(cfg.venv_dir / "bin" / "python")

    download_script = f"""
import sys
from huggingface_hub import snapshot_download

kwargs = dict(
    repo_id="{cfg.hf_model_repo}",
    local_dir=r"{model_dir}",
    allow_patterns=[
        "MiniCPM-o-4_5-{quant}.gguf",
        "vision/*", "audio/*", "tts/*", "token2wav-gguf/*", "*.md",
    ],
    local_dir_use_symlinks=False,
)

endpoint = "{cfg.hf_endpoint}"
if endpoint:
    kwargs["endpoint"] = endpoint

token = "{cfg.hf_token}"
if token:
    kwargs["token"] = token

snapshot_download(**kwargs)
print("Model download complete.")
"""
    subprocess.check_call([venv_python, "-c", download_script])
    _log("Models downloaded.")


# ---------------------------------------------------------------------------
# Install pnpm + build frontend
# ---------------------------------------------------------------------------

def build_frontend(profile: SystemProfile, cfg: Config) -> None:
    """Install frontend dependencies and build."""
    frontend_dir = cfg.app_dir / "o45-frontend"
    dist_dir = frontend_dir / "dist"
    if dist_dir.exists() and any(dist_dir.iterdir()):
        _log("Frontend already built, skipping.")
        return

    # Find node binary
    if profile.os_name == "Windows":
        node_bin = cfg.node_dir / "node.exe"
        npx_bin = cfg.node_dir / "npx.cmd"
    else:
        node_bin = cfg.node_dir / "bin" / "node"
        npx_bin = cfg.node_dir / "bin" / "npx"

    if not node_bin.exists():
        node_bin_path = shutil.which("node")
        npx_bin_path = shutil.which("npx")
        if not node_bin_path:
            raise RuntimeError("Node.js not found. Cannot build frontend.")
        node_bin = Path(node_bin_path)
        npx_bin = Path(npx_bin_path) if npx_bin_path else node_bin.parent / "npx"

    env = os.environ.copy()
    # Add node to PATH
    env["PATH"] = str(node_bin.parent) + os.pathsep + env.get("PATH", "")
    if cfg.npm_registry:
        env["npm_config_registry"] = cfg.npm_registry

    # Install pnpm via corepack or npm
    npm = node_bin.parent / ("npm.cmd" if profile.os_name == "Windows" else "npm")
    pnpm = None

    # Try corepack first
    try:
        corepack = node_bin.parent / ("corepack.cmd" if profile.os_name == "Windows" else "corepack")
        _log("Enabling pnpm via corepack ...")
        subprocess.check_call(
            [str(corepack), "enable"], env=env, cwd=str(frontend_dir),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        pnpm = shutil.which("pnpm", path=str(node_bin.parent)) or shutil.which("pnpm")
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    # Fallback: install pnpm via npm
    if not pnpm:
        _log("Corepack unavailable or outdated, installing pnpm via npm ...")
        subprocess.check_call([str(npm), "install", "-g", "pnpm"], env=env)
        pnpm = shutil.which("pnpm", path=str(node_bin.parent)) or shutil.which("pnpm")

    # Final fallback: use npx pnpm
    if not pnpm:
        npx = node_bin.parent / ("npx.cmd" if profile.os_name == "Windows" else "npx")
        if npx.exists():
            _log("Using npx to run pnpm ...")
            pnpm_cmd = [str(npx), "pnpm"]
        else:
            raise RuntimeError("pnpm not found after installation.")
    else:
        pnpm_cmd = [pnpm]

    _log("Installing frontend dependencies ...")
    subprocess.check_call(pnpm_cmd + ["install"], env=env, cwd=str(frontend_dir))

    _log("Building frontend ...")
    subprocess.check_call(pnpm_cmd + ["build"], env=env, cwd=str(frontend_dir))
    _log("Frontend built.")


# ---------------------------------------------------------------------------
# Main download_all orchestrator
# ---------------------------------------------------------------------------

def download_all(profile: SystemProfile, cfg: Config) -> None:
    """Download all dependencies: binaries, venv, models, frontend."""
    quant = cfg.llm_quant or profile.recommended_quant
    _log(f"=== Starting downloads (quant={quant}, backend={profile.gpu_backend}) ===")

    failures: list[str] = []

    def _try(name: str, fn, *args) -> None:
        try:
            fn(*args)
        except Exception as e:
            _log(f"ERROR: {name} failed: {e}")
            failures.append(name)

    # 1. llama-server (may not have releases yet)
    _try("llama-server", download_llama_server, profile, cfg)

    # 2. livekit-server
    _try("livekit-server", download_livekit, profile, cfg)

    # 3. Node.js
    _try("Node.js", download_node, profile, cfg)

    # 4. Python venv + deps
    _try("Python venv", create_venv, cfg)

    # 5. Models (requires venv for huggingface_hub)
    if "Python venv" not in failures:
        _try("Models", download_models, cfg, quant)
    else:
        _log("Skipping model download (venv creation failed).")
        failures.append("Models")

    # 6. Frontend build
    if "Node.js" not in failures:
        _try("Frontend build", build_frontend, profile, cfg)
    else:
        _log("Skipping frontend build (Node.js not available).")
        failures.append("Frontend build")

    if failures:
        _log(f"=== Downloads finished with errors: {', '.join(failures)} ===")
        _log("Re-run './install.sh install' to retry failed steps.")
    else:
        _log("=== All downloads complete ===")

    return failures
