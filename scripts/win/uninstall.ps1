# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Uninstalling the application..."

# Navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$NodeEnvScript = Join-Path $ScriptDir "node_env.ps1"
if (Test-Path $NodeEnvScript) {
    . $NodeEnvScript
}

# Function to safely remove directories with long paths
function Remove-DirectorySafely {
    param($path)

    if (-not (Test-Path $path)) {
        return
    }

    try {
        Remove-Item $path -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Host "Standard removal failed for $path, trying alternative method..."

        try {
            $tempDir = Join-Path $env:TEMP "empty_$(Get-Random)"
            New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

            $null = & robocopy $tempDir $path /MIR /R:0 /W:0 /NP /NFL /NDL /NJH /NJS 2>$null

            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $tempDir -Force -ErrorAction SilentlyContinue

            Write-Host "Successfully removed $path using alternative method"
        } catch {
            Write-Host "Warning: Could not fully remove $path. Some files may remain due to path length limitations."
            Write-Host "You may need to manually delete this directory or use a tool like 'rimraf' or 'rd /s /q'"
        }
    }
}

# Function to find the distribution package directory for a given persona
function Find-DistPackage {
    param($persona)

    $distDir = Join-Path $ScriptDir "dist"

    if (-not (Test-Path $distDir)) {
        return $null
    }

    if ($persona -eq "faculty") {
        # For faculty persona, find directories that don't end with other persona names
        $packageName = Get-ChildItem $distDir -Directory |
            Where-Object {
                $_.Name -notmatch "-lecturer$" -and
                $_.Name -notmatch "-student$" -and
                $_.Name -ne "dist"
            } |
            Sort-Object Name | Select-Object -Last 1
    } else {
        # For other personas, find directories that end with the persona name
        $packageName = Get-ChildItem $distDir -Directory |
            Where-Object { $_.Name -match "-$persona$" } |
            Sort-Object Name | Select-Object -Last 1
    }

    if ($packageName -and (Test-Path (Join-Path $packageName.FullName ".version"))) {
        return $packageName.FullName
    } else {
        return $null
    }
}

# Detect environment - repository or distribution package
$IsDistPackage = $false
if (Test-Path (Join-Path $ScriptDir ".version")) {
    $IsDistPackage = $true
    $Version = Get-Content (Join-Path $ScriptDir ".version")
    Write-Host "Detected distribution package environment (version: $Version)"
} else {
    Write-Host "Detected repository environment"

    # Default persona is faculty if not specified
    $Persona = if ($args[0]) { $args[0] } else { "faculty" }
    $RepoDir = $ScriptDir

    if (Test-Path (Join-Path $ScriptDir ".git")) {
        Write-Host "Repository environment detected. Will use repository scripts for uninstallation."

        $DistPackage = Find-DistPackage $Persona

        if ($DistPackage -and (Test-Path (Join-Path $DistPackage ".version"))) {
            Write-Host "Found dist package at: $DistPackage (but will use repository scripts for uninstallation)"
        } else {
            Write-Host "No valid dist package found. Will use repository scripts for uninstallation."
        }
    } else {
        Write-Host "ERROR: Not in a repository or dist package environment."
        Write-Host "Please run .\install.ps1 $Persona first to create a dist package."
        exit 1
    }
}

# Set environment variable for utils.mjs
$env:IS_DIST_PACKAGE = $IsDistPackage.ToString().ToLower()

# Determine which utils.mjs to use
$UtilsScript = "scripts\utils.mjs"
if ($IsDistPackage -eq $false -and $RepoDir) {
    $UtilsPath = Join-Path $RepoDir $UtilsScript
} else {
    $UtilsPath = Join-Path $ScriptDir $UtilsScript
}

# Determine Node.js binary path
if ($IsDistPackage -eq $true) {
    $NodeBin = Join-Path $ScriptDir "thirdparty\node\node.exe"
} else {
    $NodeBin = Join-Path $RepoDir "thirdparty\node\node.exe"
}

# Try to use utils.mjs to stop all managed processes before removing files
if ((Test-Path $NodeBin) -and (Test-Path $UtilsPath)) {
    Write-Host "Found local Node.js binary and utils.mjs script..."

    try {
        & $NodeBin -e "process.exit(0);" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js is working. Attempting to stop all managed processes..."

            & $NodeBin $UtilsPath "stop" "faculty" "--force" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Warning: Could not stop managed processes via process manager."
                Write-Host "         They may have already been stopped or never started."
            }
        } else {
            Write-Host "Node.js binary found but not working properly."
            Write-Host "Skipping managed process shutdown - processes may still be running."
        }
    } catch {
        Write-Host "Node.js binary found but not working properly."
        Write-Host "Skipping managed process shutdown - processes may still be running."
    }
} else {
    Write-Host "Local Node.js or utils.mjs not found."
    Write-Host "Skipping managed process shutdown - processes may still be running."
    Write-Host "If any services are still running, stop them manually."
}

# Check if components should be removed
$RemoveComponents = $false
$SkipTestLogs = $false

if ($env:SKIP_REMOVE_TEST_LOGS) {
    Write-Host "Will skip removing test logs as requested via SKIP_REMOVE_TEST_LOGS"
    $SkipTestLogs = $true
}

if ($env:SKIP_REMOVE_COMPONENTS) {
    Write-Host "Skipping component removal as requested via SKIP_REMOVE_COMPONENTS"
} elseif ($env:FORCE_REMOVE_COMPONENTS) {
    Write-Host "Forcing component removal as requested via FORCE_REMOVE_COMPONENTS"
    $RemoveComponents = $true
} else {
    $answer = Read-Host "Do you want to remove all installed components? (y/n)"
    if ($answer -match "^[Yy]") {
        $RemoveComponents = $true
    }
}

Write-Host "Stopping any running Node.js, Ollama, and OVMS processes..."
try {
    $nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        Write-Host "Killing node.exe processes..."
        $nodeProcs | ForEach-Object { $_.Kill() }
    }
} catch {}
try {
    $ollamaProcs = Get-Process | Where-Object { $_.Name -like '*ollama*' }
    if ($ollamaProcs) {
        Write-Host "Killing all processes with 'ollama' in their name..."
        $ollamaProcs | ForEach-Object { $_.Kill() }
    }
} catch {}
try {
    $ovmsProcs = Get-Process | Where-Object { $_.Name -like '*ovms*' }
    if ($ovmsProcs) {
        Write-Host "Killing all processes with 'ovms' in their name..."
        $ovmsProcs | ForEach-Object { $_.Kill() }
    }
} catch {}

if ($RemoveComponents -eq $true) {
    Write-Host "Removing installed components..."

    # Remove backend virtual environment
    $VenvPath = "backend\venv"
    if (Test-Path $VenvPath) {
        Write-Host "Removing backend virtual environment..."
        Remove-DirectorySafely $VenvPath
    }

    # Remove backend virtual environment for ovms service
    $OvmsVenvPath = "backend\ovms_service\venv"
    if (Test-Path $OvmsVenvPath) {
        Write-Host "Removing backend virtual environment for ovms service..."
        Remove-DirectorySafely $OvmsVenvPath
    }

    # Remove frontend build
    $NextPath = "frontend\.next"
    if (Test-Path $NextPath) {
        Write-Host "Removing frontend build..."
        Remove-DirectorySafely $NextPath
    }

    # Remove all next-<persona> build directories in frontend folder
    if (Test-Path "frontend") {
        $nextDirs = Get-ChildItem "frontend" -Directory | Where-Object { $_.Name -match "^next-" }
        foreach ($nextDir in $nextDirs) {
            Write-Host "Removing $($nextDir.FullName) build directory..."
            Remove-DirectorySafely $nextDir.FullName
        }
    }

    # Remove frontend node_modules
    $FrontendNodeModules = "frontend\node_modules"
    if (Test-Path $FrontendNodeModules) {
        Write-Host "Removing frontend node_modules..."
        Remove-DirectorySafely $FrontendNodeModules
    }

    # Remove root node_modules
    if (Test-Path "node_modules") {
        Write-Host "Removing root node_modules..."
        Remove-DirectorySafely "node_modules"
    }

    # Remove thirdparty directory (Node.js, Ollama, OVMS, jq)
    if (Test-Path "thirdparty") {
        Write-Host "Removing thirdparty directory (Node.js, Ollama, OVMS, jq, etc.)..."
        Remove-DirectorySafely "thirdparty"
    }

    if (Test-Path ".process-manager") {
        Write-Host "Removing process manager state directory (.process-manager)..."
        Remove-DirectorySafely ".process-manager"
    }

    # Remove data directory
    if (Test-Path "data") {
        Write-Host "Removing data directory..."
        Remove-DirectorySafely "data"
    }

    # Remove test logs directory (unless explicitly told to skip)
    if ((Test-Path "tests\logs") -and ($SkipTestLogs -ne $true)) {
        Write-Host "Removing test logs directory..."
        Remove-DirectorySafely "tests\logs"
    } elseif ((Test-Path "tests\logs") -and ($SkipTestLogs -eq $true)) {
        Write-Host "Skipping removal of test logs directory as requested..."
    }

    # Remove node_env.ps1 script
    if (Test-Path "node_env.ps1") {
        Write-Host "Removing node_env.ps1 script..."
        Remove-Item "node_env.ps1" -Force
    }

    # Remove package.json and package-lock.json
    if (Test-Path "package.json") {
        Write-Host "Removing package.json..."
        Remove-Item "package.json" -Force
    }

    if (Test-Path "package-lock.json") {
        Write-Host "Removing package-lock.json..."
        Remove-Item "package-lock.json" -Force
    }

    # Remove dist packages
    if (($IsDistPackage -eq $false) -and $RepoDir -and (Test-Path (Join-Path $RepoDir "dist"))) {
        Write-Host "Removing dist packages from repository..."
        Remove-DirectorySafely (Join-Path $RepoDir "dist")
    } elseif (Test-Path "dist") {
        Write-Host "Removing dist packages..."
        Remove-DirectorySafely "dist"
    }

    Write-Host "All components removed successfully."
}

Write-Host "Uninstallation completed successfully"