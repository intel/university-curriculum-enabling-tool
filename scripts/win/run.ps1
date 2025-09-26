# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Starting the application..."

# Default persona is faculty if not specified, but auto-detect from directory structure
$Persona = if ($args[0]) { 
    $args[0] 
} else { 
    # Auto-detect persona from next-* directories
    $NextDirs = Get-ChildItem -Directory -Name "next-*" -ErrorAction SilentlyContinue
    if ($NextDirs) {
        $DetectedPersona = $NextDirs[0] -replace "^next-", ""
        Write-Host "Auto-detected persona from directory structure: $DetectedPersona"
        $DetectedPersona
    } else {
        # Try to detect from package name patterns in current directory
        $CurrentDir = Split-Path -Leaf (Get-Location)
        if ($CurrentDir -match "expert-advisor") {
            Write-Host "Auto-detected lecturer persona from package name"
            "lecturer"
        } elseif ($CurrentDir -match "learning-companion") {
            Write-Host "Auto-detected student persona from package name"
            "student"
        } elseif ($CurrentDir -match "curriculum-builder") {
            Write-Host "Auto-detected faculty persona from package name"
            "faculty"
        } else {
            Write-Host "No persona indicators found, defaulting to faculty"
            "faculty"
        }
    }
}

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent
Set-Location $ProjectRoot

# Source local Node.js environment if it exists
$NodeEnvScript = Join-Path $ProjectRoot "node_env.ps1"
if (Test-Path $NodeEnvScript) {
    . $NodeEnvScript
} else {
    Write-Host "Error: node_env.ps1 not found. Please run the install script first."
    exit 1
}

# Use local Node.js
$NodeBin = Join-Path $ProjectRoot "thirdparty\node\node.exe"
if (Test-Path $NodeBin) {
    & $NodeBin "scripts\utils.mjs" "start" $Persona
} else {
    Write-Host "Error: Local Node.js installation not found. Please run the install script first."
    exit 1
}

Write-Host "Application started successfully for persona: $Persona"
Write-Host ""
Write-Host "Access the web interface at:"
Write-Host "--------------------------------------------------------"
Write-Host "http://localhost:8080"
Write-Host ""
Write-Host "To stop the application, run the following command:"
Write-Host "--------------------------------------------------------"
Write-Host ".\stop.ps1"
Write-Host ""
Write-Host "To uninstall the application, run the following command:"
Write-Host "--------------------------------------------------------"
Write-Host ".\uninstall.ps1"
Write-Host ""
