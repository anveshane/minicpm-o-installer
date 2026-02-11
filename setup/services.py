"""Start / stop / status for all 4 services.

Process management via subprocess.Popen.
Port checks via socket.connect_ex.
State persisted to a JSON file for cross-invocation PID tracking.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from .config import Config


def _log(msg: str) -> None:
    print(f"  [services] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Port / health utilities
# ---------------------------------------------------------------------------

def is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def wait_for_port(port: int, name: str, timeout: int = 30) -> bool:
    """Block until a port is listening or timeout (seconds)."""
    _log(f"Waiting for {name} on port {port} ...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not is_port_free(port):
            _log(f"{name} is ready on port {port}.")
            return True
        time.sleep(1)
    _log(f"WARNING: {name} did not start on port {port} within {timeout}s.")
    return False


def health_check(url: str, timeout: int = 5) -> bool:
    """HTTP GET health check."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "minicpm-installer"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def get_local_ip() -> str:
    """Get the machine's local IP address."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def _is_pid_alive(pid: int) -> bool:
    """Check if a process with the given PID is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


# ---------------------------------------------------------------------------
# SSL certificate generation
# ---------------------------------------------------------------------------

def _generate_ssl_cert(cert_dir: Path, ip: str) -> None:
    """Generate a self-signed SSL cert for WebRTC secure context."""
    cert_file = cert_dir / "server.crt"
    key_file = cert_dir / "server.key"
    if cert_file.exists() and key_file.exists():
        _log("SSL certificate already exists.")
        return

    _log(f"Generating self-signed SSL certificate for {ip} ...")
    cert_dir.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", str(key_file),
        "-out", str(cert_file),
        "-days", "365",
        "-subj", f"/CN={ip}",
        "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _log("SSL certificate generated.")


# ---------------------------------------------------------------------------
# Service Manager
# ---------------------------------------------------------------------------

class ServiceManager:
    """Manages the lifecycle of all 4 services."""

    SERVICE_NAMES = ["livekit", "backend", "cpp_server", "frontend"]

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._procs: dict[str, subprocess.Popen] = {}
        self._state: dict[str, dict] = {}
        self._load_state()

    # --- State persistence ---

    def _load_state(self) -> None:
        if self.cfg.state_file.exists():
            try:
                self._state = json.loads(self.cfg.state_file.read_text())
            except (json.JSONDecodeError, OSError):
                self._state = {}

    def _save_state(self) -> None:
        self.cfg.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.cfg.state_file.write_text(json.dumps(self._state, indent=2))

    # --- Helpers ---

    def _venv_python(self) -> str:
        if sys.platform == "win32":
            return str(self.cfg.venv_dir / "Scripts" / "python")
        return str(self.cfg.venv_dir / "bin" / "python")

    def _find_node(self) -> str:
        """Find the node binary."""
        node_in_bin = self.cfg.node_dir / ("bin" if sys.platform != "win32" else "") / (
            "node.exe" if sys.platform == "win32" else "node"
        )
        if node_in_bin.exists():
            return str(node_in_bin)
        return shutil.which("node") or "node"

    def _find_livekit(self) -> str:
        """Find the livekit-server binary."""
        local = self.cfg.bin_dir / self.cfg.livekit_server_name
        if local.exists():
            return str(local)
        return shutil.which("livekit-server") or "livekit-server"

    def _find_pnpm(self) -> str:
        """Find pnpm binary."""
        node_bin_dir = self.cfg.node_dir / ("bin" if sys.platform != "win32" else "")
        pnpm = shutil.which("pnpm", path=str(node_bin_dir))
        if pnpm:
            return pnpm
        return shutil.which("pnpm") or "pnpm"

    def _build_env(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        """Build environment dict with node/bin paths prepended."""
        env = os.environ.copy()
        paths = []
        # Add our bin dir
        paths.append(str(self.cfg.bin_dir))
        # Add node bin dir
        node_bin = self.cfg.node_dir / ("bin" if sys.platform != "win32" else "")
        if node_bin.exists():
            paths.append(str(node_bin))
        # Add venv bin dir
        venv_bin = self.cfg.venv_dir / ("Scripts" if sys.platform == "win32" else "bin")
        if venv_bin.exists():
            paths.append(str(venv_bin))
        env["PATH"] = os.pathsep.join(paths) + os.pathsep + env.get("PATH", "")
        if extra:
            env.update(extra)
        return env

    def _open_log(self, name: str):
        self.cfg.log_dir.mkdir(parents=True, exist_ok=True)
        return open(self.cfg.log_dir / f"{name}.log", "w")

    def _start_process(self, name: str, cmd: list[str], port: int,
                       env: dict[str, str], cwd: str | Path,
                       wait_timeout: int = 30) -> None:
        """Start a process, wait for its port, save state."""
        if not is_port_free(port):
            _log(f"Port {port} is already in use for {name}.")
            return

        log_file = self._open_log(name)
        _log(f"Starting {name}: {' '.join(cmd[:3])}...")
        proc = subprocess.Popen(
            cmd, env=env, cwd=str(cwd),
            stdout=log_file, stderr=subprocess.STDOUT,
        )
        self._procs[name] = proc
        self._state[name] = {"pid": proc.pid, "port": port}
        self._save_state()

        wait_for_port(port, name, wait_timeout)

    # --- Individual service start ---

    def _start_livekit(self) -> None:
        cfg = self.cfg
        livekit_bin = self._find_livekit()
        livekit_config = cfg.app_dir / "livekit.yaml"

        # Update livekit.yaml with current IP
        ip = get_local_ip()
        if livekit_config.exists():
            content = livekit_config.read_text()
            import re
            content = re.sub(r'node_ip: ".*?"', f'node_ip: "{ip}"', content)
            content = re.sub(r'domain: ".*?"', f'domain: "{ip}"', content)
            # Update API keys
            content = re.sub(
                r'(keys:\s*\n\s*)\w+: \S+',
                f'\\g<1>{cfg.livekit_api_key}: {cfg.livekit_api_secret}',
                content,
            )
            livekit_config.write_text(content)

        cmd = [livekit_bin, "--config", str(livekit_config)]
        env = self._build_env()
        self._start_process("livekit", cmd, cfg.livekit_port, env, cfg.base_dir, 10)

    def _start_backend(self) -> None:
        cfg = self.cfg
        backend_dir = cfg.app_dir / "omini_backend_code" / "code"
        python = self._venv_python()

        env = self._build_env({
            "APP_ENV": "local",
            "LIVEKIT_URL": f"ws://localhost:{cfg.livekit_port}",
            "LIVEKIT_API_KEY": cfg.livekit_api_key,
            "LIVEKIT_API_SECRET": cfg.livekit_api_secret,
            "WORKERS": "1",
            "NUMBA_CACHE_DIR": "/tmp/numba_cache",
        })

        cmd = [python, "main.py"]
        self._start_process("backend", cmd, cfg.backend_port, env, backend_dir, 30)

    def _start_cpp_server(self) -> None:
        cfg = self.cfg
        python = self._venv_python()
        cpp_script = cfg.app_dir / "cpp_server" / "minicpmo_cpp_http_server.py"
        ref_audio = cfg.app_dir / "cpp_server" / "assets" / "default_ref_audio.wav"

        # The cpp_server needs to find llama-server in bin_dir
        mode_flag = "--duplex" if cfg.cpp_mode == "duplex" else "--simplex"

        env = self._build_env({
            "CUDA_VISIBLE_DEVICES": cfg.gpu_devices,
            "REGISTER_URL": f"http://127.0.0.1:{cfg.backend_port}",
            "REF_AUDIO": str(ref_audio),
        })

        cmd = [
            python, str(cpp_script),
            "--llamacpp-root", str(cfg.bin_dir),
            "--model-dir", str(cfg.model_dir),
            "--port", str(cfg.cpp_server_port),
            "--gpu-devices", cfg.gpu_devices,
            mode_flag,
        ]

        self._start_process("cpp_server", cmd, cfg.cpp_server_port, env, cfg.bin_dir, 300)

        # Register with backend
        self._register_cpp_service()

    def _register_cpp_service(self) -> None:
        """Register the C++ inference service with the backend."""
        cfg = self.cfg
        ip = get_local_ip()
        payload = json.dumps({
            "ip": ip,
            "port": cfg.cpp_server_port,
            "model_port": cfg.cpp_server_port,
            "model_type": cfg.cpp_mode,
            "session_type": "release",
            "service_name": "o45-cpp",
        }).encode()
        url = f"http://localhost:{cfg.backend_port}/api/inference/register"
        try:
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "minicpm-installer"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                if "service_id" in body:
                    _log("C++ inference service registered with backend.")
                else:
                    _log(f"WARNING: Registration response unexpected: {body[:200]}")
        except Exception as e:
            _log(f"WARNING: Failed to register C++ service: {e}")

    def _start_frontend(self) -> None:
        cfg = self.cfg
        frontend_dir = cfg.app_dir / "o45-frontend"

        # Generate SSL cert
        cert_dir = cfg.app_dir / ".certs"
        ip = get_local_ip()
        _generate_ssl_cert(cert_dir, ip)

        node_bin = self._find_node()
        serve_script = frontend_dir / "serve-prod.mjs"

        env = self._build_env({"VITE_CPP_MODE": cfg.cpp_mode})

        if cfg.frontend_mode == "prod":
            cmd = [
                node_bin, str(serve_script),
                "--port", str(cfg.frontend_port),
                "--backend", str(cfg.backend_port),
                "--livekit", str(cfg.livekit_port),
            ]
        else:
            pnpm = self._find_pnpm()
            cmd = [pnpm, "run", "dev:external"]

        self._start_process("frontend", cmd, cfg.frontend_port, env, frontend_dir, 30)

    # --- Public API ---

    def start_all(self) -> None:
        """Start all 4 services in order."""
        _log("========== Starting all services ==========")

        _log("[1/4] Starting LiveKit ...")
        self._start_livekit()

        _log("[2/4] Starting Backend (FastAPI) ...")
        self._start_backend()

        _log("[3/4] Starting C++ Inference (model loading may take 2-3 min) ...")
        self._start_cpp_server()

        _log("[4/4] Starting Frontend ...")
        self._start_frontend()

        ip = get_local_ip()
        print()
        print("=" * 55)
        print(f"  All services started!")
        print(f"  Open: https://{ip}:{self.cfg.frontend_port}")
        print(f"  (Accept the self-signed certificate warning)")
        print("=" * 55)

    def stop_all(self) -> None:
        """Stop all services."""
        _log("Stopping all services ...")
        for name in reversed(self.SERVICE_NAMES):
            self._stop_service(name)
        # Clean state
        self._state = {}
        self._save_state()
        _log("All services stopped.")

    def _stop_service(self, name: str) -> None:
        """Stop a single service by name."""
        # Try in-memory process handle first
        proc = self._procs.get(name)
        if proc and proc.poll() is None:
            _log(f"Stopping {name} (PID {proc.pid}) ...")
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            return

        # Fall back to saved PID
        info = self._state.get(name)
        if info and _is_pid_alive(info["pid"]):
            pid = info["pid"]
            _log(f"Stopping {name} (PID {pid}) ...")
            try:
                os.kill(pid, signal.SIGTERM)
                # Wait briefly
                for _ in range(10):
                    if not _is_pid_alive(pid):
                        break
                    time.sleep(1)
                else:
                    os.kill(pid, signal.SIGKILL)
            except (OSError, ProcessLookupError):
                pass

    def show_status(self) -> None:
        """Print status of all services."""
        print()
        print("  Service Status:")
        print("  " + "-" * 55)
        for name in self.SERVICE_NAMES:
            info = self._state.get(name, {})
            pid = info.get("pid", 0)
            port = info.get("port", 0)
            alive = _is_pid_alive(pid) if pid else False
            port_up = not is_port_free(port) if port else False
            status = "RUNNING" if alive and port_up else "STOPPED"
            symbol = "[+]" if status == "RUNNING" else "[-]"
            print(f"  {symbol} {name:15s}  PID={pid or '-':>6}  Port={port or '-':>5}  {status}")
        print("  " + "-" * 55)
