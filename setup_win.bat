REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
setlocal enabledelayedexpansion
REM Simple setup script - runs setup.ps1 as administrator
set SCRIPT_DIR=%~dp0

echo This script will install system level dependencies:
echo 1. Winget
echo 2. Python 3.12 (if lower or not already installed)
REM Check for distribution package powershell\setup.ps1
set SETUP_SCRIPT=%SCRIPT_DIR%scripts\win\setup.ps1
if exist "%SCRIPT_DIR%dist\" (
    for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
        set DIST_PACKAGE=%%i
    )
    if defined DIST_PACKAGE (
        if exist "%SCRIPT_DIR%dist\%DIST_PACKAGE%\powershell\setup.ps1" (
            set SETUP_SCRIPT=%SCRIPT_DIR%dist\%DIST_PACKAGE%\powershell\setup.ps1
            echo Using distribution package: %%i
        )
    )
)
echo Running setup.ps1 as administrator...
powershell -Command "Start-Process PowerShell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%SETUP_SCRIPT%\"' -Wait"

if %ERRORLEVEL% EQU 0 (
    echo Setup completed successfully. Please double click install.bat to install the application.
    timeout /t 2 /nobreak >nul
) else (
    echo Setup failed with error code %ERRORLEVEL%
    echo Press Enter to close this window...
    pause >nul
    exit /b %ERRORLEVEL%
)

