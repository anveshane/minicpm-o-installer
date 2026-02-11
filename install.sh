#!/usr/bin/env bash
# MiniCPM-o WebRTC Demo — macOS/Linux entry point
# Finds Python >= 3.9 and delegates to setup_runner.py
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find a suitable Python interpreter (>= 3.9)
PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10 python3 python; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c "import sys; print(sys.version_info >= (3,9))" 2>/dev/null || echo "False")
        if [ "$ver" = "True" ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "${PYTHON_CMD:-}" ]; then
    echo ""
    echo "ERROR: Python >= 3.9 not found."
    echo ""
    echo "Install Python:"
    echo "  macOS:  brew install python@3.11"
    echo "  Ubuntu: sudo apt install python3.11"
    echo "  Or:     https://www.python.org/downloads/"
    exit 1
fi

echo "Using Python: $PYTHON_CMD ($($PYTHON_CMD --version 2>&1))"
exec "$PYTHON_CMD" "$SCRIPT_DIR/setup_runner.py" "$@"
