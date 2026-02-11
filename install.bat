@echo off
REM MiniCPM-o WebRTC Demo — Windows entry point
REM Finds Python >= 3.9 and delegates to setup_runner.py

where python >nul 2>&1
if errorlevel 1 goto :nopython

python -c "import sys; exit(0 if sys.version_info >= (3,9) else 1)" 2>nul
if errorlevel 1 goto :nopython

echo Using Python:
python --version
python "%~dp0setup_runner.py" %*
exit /b %errorlevel%

:nopython
echo.
echo ERROR: Python ^>= 3.9 not found.
echo.
echo Install from: https://www.python.org/downloads/
echo Make sure to check "Add Python to PATH" during installation.
exit /b 1
