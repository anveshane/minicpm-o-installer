#!/usr/bin/env python3
"""MiniCPM-o WebRTC Demo — Cross-platform installer and launcher."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MiniCPM-o WebRTC Demo — installer and launcher",
    )
    sub = parser.add_subparsers(dest="command", help="Command to run")
    sub.add_parser("install", help="Download all dependencies")
    sub.add_parser("start", help="Install (if needed) and start all services")
    sub.add_parser("stop", help="Stop all services")
    sub.add_parser("status", help="Show service status")
    sub.add_parser("profile", help="Show system profile (GPU, RAM, recommended quant)")

    # Global override flags
    parser.add_argument("--quant", help="Override model quantization (e.g. Q4_K_M, Q8_0, F16)")
    parser.add_argument("--gpu", help="Override GPU backend (e.g. metal, cuda-12.4, vulkan, cpu)")
    parser.add_argument("--port-livekit", type=int, help="Override LiveKit port")
    parser.add_argument("--port-backend", type=int, help="Override backend port")
    parser.add_argument("--port-frontend", type=int, help="Override frontend port")
    parser.add_argument("--port-cpp", type=int, help="Override C++ server port")

    args = parser.parse_args()
    command = args.command or "start"

    base_dir = Path(__file__).resolve().parent

    # Add project root to sys.path so setup package is importable
    if str(base_dir) not in sys.path:
        sys.path.insert(0, str(base_dir))

    from setup.config import Config
    from setup.system_profile import detect_system

    # Build config from env vars
    cfg = Config.from_env(base_dir)

    # Apply CLI overrides
    if args.quant:
        cfg.llm_quant = args.quant
    if args.port_livekit:
        cfg.livekit_port = args.port_livekit
    if args.port_backend:
        cfg.backend_port = args.port_backend
    if args.port_frontend:
        cfg.frontend_port = args.port_frontend
    if args.port_cpp:
        cfg.cpp_server_port = args.port_cpp

    # --- Profile command ---
    if command == "profile":
        profile = detect_system()
        print(profile.to_json())
        return

    # --- Install / Start ---
    failures: list[str] = []
    if command in ("install", "start"):
        profile = detect_system()

        # Apply GPU override
        if args.gpu:
            profile.gpu_backend = args.gpu

        print(f"  System:  {profile.os_name} {profile.arch}")
        print(f"  GPU:     {profile.gpu_name} ({profile.gpu_backend})")
        print(f"  VRAM:    {profile.vram_mb} MB  |  RAM: {profile.ram_mb} MB")
        print(f"  Disk:    {profile.disk_free_mb} MB free")
        print(f"  Quant:   {cfg.llm_quant or profile.recommended_quant}")
        print()

        from setup.downloader import download_all
        failures = download_all(profile, cfg) or []

    if command == "start":
        if failures:
            critical = {"llama-server", "Python venv", "Models"}
            if critical & set(failures):
                print(f"\n  Cannot start: critical downloads failed ({', '.join(critical & set(failures))})")
                print("  Fix the errors above and re-run: install.sh install")
                sys.exit(1)
        from setup.services import ServiceManager
        mgr = ServiceManager(cfg)
        mgr.start_all()

    elif command == "stop":
        from setup.services import ServiceManager
        mgr = ServiceManager(cfg)
        mgr.stop_all()

    elif command == "status":
        from setup.services import ServiceManager
        mgr = ServiceManager(cfg)
        mgr.show_status()


if __name__ == "__main__":
    main()
