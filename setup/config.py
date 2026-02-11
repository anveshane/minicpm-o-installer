"""Installer configuration — all settings with env-var overrides."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


@dataclass
class Config:
    # --- Paths (derived from base_dir) ---
    base_dir: Path
    bin_dir: Path = field(init=False)
    model_dir: Path = field(init=False)
    venv_dir: Path = field(init=False)
    log_dir: Path = field(init=False)
    app_dir: Path = field(init=False)
    state_file: Path = field(init=False)

    # --- Release repos & versions ---
    llama_release_repo: str = "ganarajpr/llama.cpp-omni"
    llama_release_tag: str = "latest"
    livekit_version: str = "1.9.11"
    node_version: str = "v22.14.0"

    # --- Model ---
    hf_model_repo: str = "openbmb/MiniCPM-o-4_5-gguf"
    hf_endpoint: str = ""
    hf_token: str = ""
    llm_quant: str = ""  # auto-detected when empty

    # --- Ports ---
    livekit_port: int = 7880
    backend_port: int = 8021
    frontend_port: int = 8088
    cpp_server_port: int = 9060

    # --- Mirrors (China acceleration) ---
    github_proxy: str = ""
    node_mirror: str = ""
    npm_registry: str = ""

    # --- Runtime ---
    cpp_mode: str = "duplex"
    frontend_mode: str = "prod"
    gpu_devices: str = "0"

    # --- LiveKit credentials ---
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secretsecretsecretsecretsecretsecret"

    def __post_init__(self) -> None:
        self.bin_dir = self.base_dir / "bin"
        self.model_dir = self.base_dir / "models" / "openbmb" / "MiniCPM-o-4_5-gguf"
        self.venv_dir = self.base_dir / ".venv"
        self.log_dir = self.base_dir / "logs"
        self.app_dir = self.base_dir / "app"
        self.state_file = self.base_dir / ".services.json"

    @classmethod
    def from_env(cls, base_dir: Path) -> Config:
        """Build config from environment variables with sensible defaults."""
        return cls(
            base_dir=base_dir,
            llama_release_repo=_env("LLAMA_RELEASE_REPO", "ganarajpr/llama.cpp-omni"),
            llama_release_tag=_env("LLAMA_RELEASE_TAG", "latest"),
            livekit_version=_env("LIVEKIT_VERSION", "1.9.11"),
            node_version=_env("NODE_VERSION", "v22.14.0"),
            hf_model_repo=_env("HF_MODEL_REPO", "openbmb/MiniCPM-o-4_5-gguf"),
            hf_endpoint=_env("HF_ENDPOINT"),
            hf_token=_env("HF_TOKEN"),
            llm_quant=_env("LLM_QUANT"),
            livekit_port=_env_int("LIVEKIT_PORT", 7880),
            backend_port=_env_int("BACKEND_PORT", 8021),
            frontend_port=_env_int("FRONTEND_PORT", 8088),
            cpp_server_port=_env_int("CPP_SERVER_PORT", 9060),
            github_proxy=_env("GITHUB_PROXY"),
            node_mirror=_env("NODE_MIRROR"),
            npm_registry=_env("NPM_REGISTRY"),
            cpp_mode=_env("CPP_MODE", "duplex"),
            frontend_mode=_env("FRONTEND_MODE", "prod"),
            gpu_devices=_env("CUDA_VISIBLE_DEVICES", "0"),
            livekit_api_key=_env("LIVEKIT_API_KEY", "devkey"),
            livekit_api_secret=_env("LIVEKIT_API_SECRET", "secretsecretsecretsecretsecretsecret"),
        )

    @property
    def node_dir(self) -> Path:
        return self.bin_dir / "node"

    @property
    def llama_server_name(self) -> str:
        return "llama-server.exe" if sys.platform == "win32" else "llama-server"

    @property
    def livekit_server_name(self) -> str:
        return "livekit-server.exe" if sys.platform == "win32" else "livekit-server"

    def github_url(self, path: str) -> str:
        """Build a GitHub URL, optionally through a proxy."""
        base = self.github_proxy.rstrip("/") if self.github_proxy else "https://github.com"
        return f"{base}/{path}"

    def node_dist_url(self) -> str:
        """Node.js download base URL."""
        if self.node_mirror:
            return self.node_mirror.rstrip("/")
        return "https://nodejs.org/dist"
