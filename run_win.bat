REM Copyright (C) 2025 Intel Corporation
REM SPDX-License-Identifier: Apache-2.0

@echo off
setlocal enabledelayedexpansion

echo Starting University Curriculum Enabling Tool...
echo.

REM Simple directory detection
set SCRIPT_DIR=%~dp0
set WORKING_DIR=%SCRIPT_DIR%

REM Persona selection: default to faculty if not specified
set "Persona=%1"
if "%Persona%"=="" set "Persona=faculty"

REM Validate persona
if /i not "%Persona%"=="faculty" if /i not "%Persona%"=="lecturer" if /i not "%Persona%"=="student" (
    echo ERROR: Invalid persona '%Persona%'
    echo Valid personas are: faculty, lecturer, student
    echo.
    pause
    exit /b 1
)

echo Starting application for persona: %Persona%
echo.

REM Simple directory detection
set SCRIPT_DIR=%~dp0
set WORKING_DIR=%SCRIPT_DIR%

REM Check if we have a distribution package
if exist "%SCRIPT_DIR%dist\university-curriculum-enabling-tool-2025.0.0\node_env.ps1" (
    set WORKING_DIR=%SCRIPT_DIR%dist\university-curriculum-enabling-tool-2025.0.0
    echo Using distribution package
) else (
    echo Using project root
)

REM Change to working directory
cd /d "!WORKING_DIR!"

REM Check for node_env.ps1
if not exist "node_env.ps1" (
    echo ERROR: node_env.ps1 not found!
    echo Please run the install script first.
    echo.
    pause
    exit /b 1
)

REM Check if application is already running on port 8080
echo Checking if application is already running...
netstat -an | findstr ":8080" >nul
if %errorlevel% == 0 (
    echo.
    echo ========================================
    echo APPLICATION ALREADY RUNNING!
    echo ========================================
    echo.
    echo The application is already running.
    echo.
    echo If you want to restart the application:
    echo 1. Run stop_win.bat first
    echo 2. Close all existing command windows
    echo 3. Then run this script again
    echo.
    pause
    exit /b 0
)

REM Start the application
echo Starting application...
if exist "scripts\win\run.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\win\run.ps1" %Persona%
) else (
    echo ERROR: PowerShell run script not found!
    pause
    exit /b 1
)

REM If we get here, application started successfully
echo.
echo ========================================
echo APPLICATION IS RUNNING!
echo ========================================
echo.
echo Running persona: %Persona%
echo Open your browser to: http://localhost:8080
echo.
echo Opening browser automatically in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:8080
echo Browser opened.
echo.
timeout /t 3 /nobreak >nul