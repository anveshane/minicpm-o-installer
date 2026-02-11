# MiniCPM-o WebRTC Demo — Cross-Platform Installer

A single-command installer for the MiniCPM-o WebRTC Demo. Detects your hardware, downloads the right binaries, and starts all services.

## Requirements

- **Python >= 3.9** (the only prerequisite)
- **macOS** (Apple Silicon or Intel), **Linux** (x64), or **Windows** (x64)
- ~15 GB free disk space (binaries + models)

macOS additionally requires Homebrew (for livekit-server).

## Quick Start

```bash
# macOS / Linux
./install.sh

# Windows
install.bat

# Or directly with Python
python setup_runner.py start
```

This will:
1. Detect your OS, GPU, and available memory
2. Download prebuilt binaries (llama-server, livekit-server, Node.js)
3. Create a Python venv and install backend dependencies
4. Download the optimal model quantization for your hardware
5. Build the frontend
6. Start all 4 services
7. Print a URL to open in your browser

## Commands

```bash
./install.sh                  # Default: install + start
./install.sh install          # Download everything (don't start)
./install.sh start            # Install if needed, then start all services
./install.sh stop             # Stop all services
./install.sh status           # Show what's running
./install.sh profile          # Show detected hardware + recommended settings
```

## Override Options

```bash
# Force a specific quantization
./install.sh --quant Q8_0 start

# Force CPU mode (ignore GPU)
./install.sh --gpu cpu start

# Custom ports
./install.sh --port-frontend 3000 --port-backend 8080 start
```

## Environment Variables

All settings can be overridden via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_QUANT` | auto-detected | Model quantization (Q4_K_M, Q8_0, F16, etc.) |
| `CUDA_VISIBLE_DEVICES` | `0` | GPU device(s) to use |
| `HF_TOKEN` | | Hugging Face token (for gated models) |
| `HF_ENDPOINT` | | HF mirror endpoint |
| `GITHUB_PROXY` | | GitHub download proxy |
| `NODE_MIRROR` | | Node.js download mirror |
| `NPM_REGISTRY` | | npm registry mirror |
| `CPP_MODE` | `duplex` | `duplex` or `simplex` |
| `FRONTEND_MODE` | `prod` | `prod` or `dev` |
| `LIVEKIT_PORT` | `7880` | LiveKit server port |
| `BACKEND_PORT` | `8021` | Backend API port |
| `FRONTEND_PORT` | `8088` | Frontend HTTPS port |
| `CPP_SERVER_PORT` | `9060` | C++ inference port |

## Architecture

```
install.sh / install.bat      # Shell entry points (find Python, delegate)
  └── setup_runner.py          # CLI orchestrator
        ├── setup/config.py           # Configuration + env var overrides
        ├── setup/system_profile.py   # Hardware detection
        ├── setup/downloader.py       # Binary + model downloads
        └── setup/services.py         # Process lifecycle management
  app/                         # Application source code
    ├── cpp_server/            # C++ inference wrapper
    ├── omini_backend_code/    # FastAPI backend
    ├── o45-frontend/          # Vue frontend
    └── livekit.yaml           # LiveKit configuration
```

## Troubleshooting

- **"Port already in use"**: Run `./install.sh stop` first, or change ports via env vars
- **Model loading is slow**: The C++ server loads the model on first start (~2-3 min). Check `logs/cpp_server.log`
- **SSL certificate warning**: Expected — the installer generates a self-signed cert for local HTTPS (required by WebRTC)
- **Logs**: Check `logs/` directory for per-service log files
