
REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
setlocal enabledelayedexpansion
REM Install script - checks for dist package in scripts dir and runs install.ps1 from there if found
set SCRIPT_DIR=%~dp0

REM =============================================
REM PROVIDER Selection Support
REM =============================================
REM Check if PROVIDER environment variable is set
if defined PROVIDER (
    echo PROVIDER environment variable detected: %PROVIDER%
    echo Installing with %PROVIDER% backend...
    echo.
) else (
    echo.
    echo =============================================
    echo AI Backend Selection
    echo =============================================
    echo No PROVIDER environment variable detected.
    echo The PowerShell script will prompt you to choose between Ollama and OVMS.
    echo.
    echo To skip the prompt next time, you can set the PROVIDER environment variable:
    echo   For Ollama: set PROVIDER=ollama ^& install_win.bat
    echo   For OVMS:   set PROVIDER=ovms ^& install_win.bat
    echo.
    echo Continuing with interactive installation...
    echo.
    timeout /t 3 /nobreak >nul
)

REM Check for dist package in scripts dir
set DIST_PACKAGE=
if exist "%SCRIPT_DIR%dist\" (
    for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
        set DIST_PACKAGE=%%i
    )
)


if defined DIST_PACKAGE (
    echo Distribution package found: !DIST_PACKAGE!
    echo Running install.ps1 from distribution package...
    cd "%SCRIPT_DIR%dist\!DIST_PACKAGE!"
    echo Current directory: %CD%
    echo Checking for install.ps1...
    if exist "scripts\win\install.ps1" (
        echo Found scripts\win\install.ps1
        REM If PROVIDER not set in the environment, try to read it from a root .env or dist .env
        if not defined PROVIDER (
            if exist "%SCRIPT_DIR%.env" (
                for /f "tokens=1* delims==" %%A in ('findstr /b /i "PROVIDER=" "%SCRIPT_DIR%.env" 2^>nul') do (
                    set "PROVIDER=%%B"
                )
            )
            if not defined PROVIDER if exist "%CD%\.env" (
                for /f "tokens=1* delims==" %%A in ('findstr /b /i "PROVIDER=" "%CD%\.env" 2^>nul') do (
                    set "PROVIDER=%%B"
                )
            )
            if defined PROVIDER (
                REM strip possible quotes
                set "PROVIDER=!PROVIDER:"=!"
                echo PROVIDER set from .env: !PROVIDER!
            )
        )
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
    REM Try to load PROVIDER from root .env if install.ps1 wrote it there so we can pass it to the distribution installer
    if not defined PROVIDER (
        if exist "%SCRIPT_DIR%.env" (
            for /f "tokens=1* delims==" %%A in ('findstr /b /i "PROVIDER=" "%SCRIPT_DIR%.env" 2^>nul') do (
                set "PROVIDER=%%B"
            )
        )
        if defined PROVIDER (
            set "PROVIDER=!PROVIDER:"=!"
            echo PROVIDER loaded after local install: !PROVIDER!
        )
    )

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
