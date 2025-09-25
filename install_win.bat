
REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
setlocal enabledelayedexpansion
REM Install script - checks for dist package in scripts dir and runs install.ps1 from there if found
set SCRIPT_DIR=%~dp0

REM Check for dist package in scripts dir
set DIST_PACKAGE=
if exist "%SCRIPT_DIR%dist\" (
    for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
        set DIST_PACKAGE=%%i
    )
)


) if defined DIST_PACKAGE (
    echo Distribution package found: !DIST_PACKAGE!
    echo Running install.ps1 from distribution package...
    cd "%SCRIPT_DIR%dist\!DIST_PACKAGE!"
    echo Current directory: %CD%
    echo Checking for install.ps1...
    if exist "scripts\win\install.ps1" (
        echo Found scripts\win\install.ps1
        powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win\install.ps1" %* 2>&1
    ) else (
        echo ERROR: scripts\win\install.ps1 not found in distribution package
        dir /b
    )
    set INSTALL_RESULT=%ERRORLEVEL%
    echo Distribution package install result: !INSTALL_RESULT!
    cd "%SCRIPT_DIR%"
) else (
    echo No distribution package found. Running install.ps1 in current directory...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\win\install.ps1" %*
    set INSTALL_RESULT=%ERRORLEVEL%

    REM After running local install.ps1, check again for dist package
    set DIST_PACKAGE=
    if exist "%SCRIPT_DIR%dist\" (
        for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
            set DIST_PACKAGE=%%i
        )
    )
    if defined DIST_PACKAGE (
        echo Distribution package found after local install: !DIST_PACKAGE!
        echo Running install.ps1 from distribution package...
        cd "%SCRIPT_DIR%dist\!DIST_PACKAGE!"
        echo Current directory: %CD%
        echo Checking for install.ps1...
        if exist "scripts\win\install.ps1" (
            echo Found scripts\win\install.ps1
            powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win\install.ps1" %* 2>&1
        ) else (
            echo ERROR: powershell\install.ps1 not found in distribution package
            dir /b
        )
        set INSTALL_RESULT=%ERRORLEVEL%
        echo Distribution package install result: !INSTALL_RESULT!
        cd "%SCRIPT_DIR%"
    )
)

if %INSTALL_RESULT% EQU 0 (
    echo Installation completed successfully.
    timeout /t 2 /nobreak >nul
) else (
    echo Installation failed with error code %INSTALL_RESULT%
    echo Press Enter to close this window...
    pause >nul
    exit /b %INSTALL_RESULT%
)
