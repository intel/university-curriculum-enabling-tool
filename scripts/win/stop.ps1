# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Stopping the application..."

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

# Check if FORCE environment variable is set (to completely remove services instead of just stopping them)
$ForceFlag = ""
if ($env:FORCE -eq "true") {
    Write-Host "FORCE flag detected. Services will be completely removed instead of just stopped."
    $ForceFlag = "--force"
}

# Use local Node.js
$NodeBin = Join-Path $ProjectRoot "thirdparty\node\node.exe"
if (Test-Path $NodeBin) {
    if ($ForceFlag) {
        & $NodeBin "scripts\utils.mjs" "stop" $ForceFlag
    } else {
        & $NodeBin "scripts\utils.mjs" "stop"
    }
} else {
    Write-Host "Error: Local Node.js installation not found. Please run the install script first."
    exit 1
}

if ($ForceFlag) {
    Write-Host "Application removed successfully"
} else {
    Write-Host "Application stopped successfully"
}