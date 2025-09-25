REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
setlocal enabledelayedexpansion

REM Initialize variables
set SCRIPT_DIR=%~dp0
set WORKING_DIR=%SCRIPT_DIR%
set DIST_PACKAGE=
set StopResult=0
set ForceFlag=

echo ================================================================
echo  UNIVERSITY CURRICULUM ENABLING TOOL - STOP SCRIPT
echo ================================================================
echo.

REM Detect distribution package or project root
echo [INFO] Detecting installation type...
if exist "%SCRIPT_DIR%dist\" (
    for /f "delims=" %%i in ('dir "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-*" /b /ad 2^>nul') do (
        set DIST_PACKAGE=%%i
    )
    if defined DIST_PACKAGE (
        if exist "%SCRIPT_DIR%dist\!DIST_PACKAGE!\node_env.ps1" (
            set WORKING_DIR=%SCRIPT_DIR%dist\!DIST_PACKAGE!
            echo [INFO] Using distribution package: !DIST_PACKAGE!
        ) else (
            echo [INFO] Distribution package found but incomplete: !DIST_PACKAGE!
        )
    ) else (
        echo [INFO] No distribution package found in dist folder
    )
) else (
    echo [INFO] No dist folder found
)

if not defined DIST_PACKAGE (
    echo [INFO] Using project root installation
)

echo [INFO] Working directory: !WORKING_DIR!
echo.

REM Change to working directory
echo [INFO] Changing to working directory...
cd /d "!WORKING_DIR!" || (
    echo [ERROR] Failed to change to working directory: !WORKING_DIR!
    set StopResult=1
    goto :finish
)

REM Check for FORCE flag
if /I "%FORCE%"=="true" set ForceFlag=--force
if /I "%1"=="--force" set ForceFlag=--force
if defined ForceFlag (
    echo [INFO] FORCE flag detected - services will be completely removed
) else (
    echo [INFO] Normal stop mode - services will be stopped
)

REM Validate environment
echo [INFO] Validating environment...
if not exist "node_env.ps1" (
    echo [ERROR] node_env.ps1 not found in !WORKING_DIR!
    echo [ERROR] Please run the install script first
    set StopResult=1
    goto :finish
)

REM Source environment variables
echo [INFO] Loading Node.js environment...
for /f "usebackq tokens=*" %%E in (`powershell -NoProfile -ExecutionPolicy Bypass -File node_env.ps1 2^>nul ^| findstr /r /c:"^set "`) do (
    %%E
)

REM Validate Node.js installation
set NodeBin=!WORKING_DIR!\thirdparty\node\node.exe
echo [INFO] Checking Node.js at: !NodeBin!
if not exist "!NodeBin!" (
    echo [ERROR] Local Node.js installation not found
    echo [ERROR] Expected path: !NodeBin!
    echo [ERROR] Please run the install script first
    set StopResult=1
    goto :finish
)

REM Execute stop command
echo.
echo [INFO] Attempting to stop application services...
if exist "scripts\win\stop.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win\stop.ps1" %* >nul 2>&1
    set StopResult=%ERRORLEVEL%
) else if defined ForceFlag (
    echo [INFO] Executing: "!NodeBin!" scripts\utils.mjs stop --force
    "!NodeBin!" scripts\utils.mjs stop --force >nul 2>&1
    set StopResult=!ERRORLEVEL!
    if !StopResult! EQU 0 (
        echo [SUCCESS] Application services removed successfully
    ) else (
        echo [ERROR] Application removal failed with error code: !StopResult!
    )
) else (
    echo [INFO] Executing: "!NodeBin!" scripts\utils.mjs stop
    "!NodeBin!" scripts\utils.mjs stop >nul 2>&1
    set StopResult=!ERRORLEVEL!
    if !StopResult! EQU 0 (
        echo [SUCCESS] Application services stopped successfully
    ) else (
        echo [ERROR] Application stop failed with error code: !StopResult!
    )
)

REM Final cleanup
echo.
echo [INFO] Freeing processes on application ports...
for %%p in (8080 8016 11434) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)
echo [INFO] Final cleanup completed

:finish
echo.
echo ================================================================
if !StopResult! EQU 0 (
    echo  APPLICATION STOPPED SUCCESSFULLY
    echo ================================================================
    echo.
    echo The application has been stopped successfully.
    if defined ForceFlag (
        echo All services have been completely removed.
    ) else (
        echo All services have been stopped.
    )
    echo.
    echo Please manually close any remaining command prompt windows
    echo to complete the application shutdown process.
) else (
    echo  APPLICATION STOP FAILED
    echo ================================================================
    echo.
    echo An error occurred while stopping the application.
    echo Error code: !StopResult!
    echo.
    echo Please check the error messages above and try again.
    echo If the problem persists, you may need to:
    echo   1. Run the install script to fix the environment
    echo   2. Manually terminate any running processes
    echo   3. Use the --force flag: stop.bat --force
)
echo.
echo ================================================================
echo Press Enter to close this window...
echo ================================================================
pause >nul

REM Final cleanup (always executed)
if exist "%SCRIPT_DIR%run.lock" del /f /q "%SCRIPT_DIR%run.lock" >nul 2>&1
