@echo off
setlocal
title SelectShans FolderGuard Launcher
echo =======================================================
echo   SelectShans FolderGuard - Endpoint Protection
echo =======================================================
echo Starting SelectShans FolderGuard...
echo.

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.8+ to proceed.
    pause
    exit /b 1
)

:: Ensure dependencies from requirements.txt are installed silently
if exist requirements.txt (
    echo Checking endpoint dependencies...
    python -m pip install -q -r requirements.txt >nul 2>nul
)

:: Launch desktop GUI by default if available; fallback to CLI detector
if exist gui.py (
    echo Launching FolderGuard Desktop GUI...
    start "" python gui.py
) else (
    echo Launching FolderGuard CLI Agent...
    python detector.py
)

endlocal

