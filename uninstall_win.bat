REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
REM Run uninstall.ps1 using PowerShell without administrator privileges
set SCRIPT_DIR=%~dp0

REM Check if we should run from distributed package or project root
set UNINSTALL_SCRIPT="%SCRIPT_DIR%scripts\win\uninstall.ps1"

REM Look for distribution package in dist folder
if exist "%SCRIPT_DIR%dist\" (
    REM Find the latest distribution package (university-curriculum-enabling-tool-*)
    for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
        set DIST_PACKAGE=%%i
    )

    REM If distribution package exists and has scripts\win\uninstall.ps1, use it
    if defined DIST_PACKAGE (
        if exist "%SCRIPT_DIR%dist\%DIST_PACKAGE%\scripts\win\uninstall.ps1" (
            set UNINSTALL_SCRIPT="%SCRIPT_DIR%dist\%DIST_PACKAGE%\scripts\win\uninstall.ps1"
            echo Using distribution package: %DIST_PACKAGE%
        )
    )
)

if not defined DIST_PACKAGE (
    echo Using project root installation
)

echo Uninstalling the application...
powershell -NoProfile -ExecutionPolicy Bypass -File %UNINSTALL_SCRIPT% %*

REM Check if uninstall.ps1 succeeded (exit code 0)
if %ERRORLEVEL% EQU 0 (
    echo Application uninstalled successfully!
) else (
    echo Uninstallation failed with error code %ERRORLEVEL%
    echo Press any key to close this window...
    pause >nul
    exit /b %ERRORLEVEL%
)
