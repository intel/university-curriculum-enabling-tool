# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Uninstalling the application..."

# Navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent
Set-Location $ProjectRoot

# Source local Node.js environment if it exists
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
        # First try the standard removal
        Remove-Item $path -Recurse -Force -ErrorAction Stop
    } catch {
        # If that fails, try using robocopy to create an empty directory and mirror it
        # This is a Windows-specific technique for handling long paths
        Write-Host "Standard removal failed for $path, trying alternative method..."
        
        try {
            # Create a temporary empty directory
            $tempDir = Join-Path $env:TEMP "empty_$(Get-Random)"
            New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
            
            # Use robocopy to mirror the empty directory over the target (effectively deleting it)
            $null = & robocopy $tempDir $path /MIR /R:0 /W:0 /NP /NFL /NDL /NJH /NJS 2>$null
            
            # Remove the now-empty target directory
            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
            
            # Clean up the temporary directory
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
    
    $distDir = Join-Path $RepoDir "dist"
    $packageName = ""
    
    if (-not (Test-Path $distDir)) {
        return $null
    }
    
    if ($persona -eq "faculty") {
        # For faculty persona, find directories that don't end with persona names
        $packageName = Get-ChildItem $distDir -Directory | 
            Where-Object { $_.Name -notmatch "-lecturer$" -and $_.Name -notmatch "-student$" -and $_.Name -ne "dist" } |
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
if (Test-Path (Join-Path $ProjectRoot ".version")) {
    # This is a distribution package
    $IsDistPackage = $true
    $Version = Get-Content (Join-Path $ProjectRoot ".version")
    Write-Host "Detected distribution package environment (version: $Version)"
} else {
    Write-Host "Detected repository environment"
    
    # Default persona is faculty if not specified
    $Persona = if ($args[0]) { $args[0] } else { "faculty" }
}

# Store original repository directory
$RepoDir = $ProjectRoot
    
    # When running from repository, always use repository scripts
    if (Test-Path (Join-Path $RepoDir ".git")) {
        Write-Host "Repository environment detected. Will use repository scripts for uninstallation."
        
        # Check if dist package exists (for informational purposes only)
        $DistPackage = Find-DistPackage $Persona
        
        if ($DistPackage -and (Test-Path (Join-Path $DistPackage ".version"))) {
            Write-Host "Found dist package at: $DistPackage (but will use repository scripts for uninstallation)"
        } else {
            Write-Host "No valid dist package found. Will use repository scripts for uninstallation."
        }
        
        # Keep RepoDir pointing to the repository root
    } else {
        Write-Host "ERROR: Not in a repository or dist package environment."
        Write-Host "Please run .\install.ps1 $Persona first to create a dist package."
        exit 1
    }
# }

# Source local Node.js environment if it exists (again after environment detection)
$NodeEnvScript = Join-Path $ProjectRoot "node_env.ps1"
if (Test-Path $NodeEnvScript) {
    . $NodeEnvScript
}

# Set environment variable for utils.mjs
$env:IS_DIST_PACKAGE = $IsDistPackage.ToString().ToLower()

# Determine which utils.mjs to use - if we're running from repository but targeting
# a distribution package, we still want to use the utils.mjs from the repository
$UtilsScript = "scripts\utils.mjs"
if ($IsDistPackage -eq $false -and $RepoDir) {
    $UtilsPath = Join-Path $RepoDir $UtilsScript
} else {
    $UtilsPath = Join-Path $ProjectRoot $UtilsScript
}

# Try to use utils.mjs if Node.js is available
if ($IsDistPackage -eq $true) {
    $NodeBin = Join-Path $ProjectRoot "thirdparty\node\node.exe"
} else {
    $NodeBin = Join-Path $RepoDir "thirdparty\node\node.exe"
}

# First check if required modules are installed
if ((Test-Path $NodeBin) -and (Test-Path $UtilsPath)) {
    Write-Host "Found local Node.js binary and utils.mjs script..."
    
    # Try to run the script with a simple check
    try {
        & $NodeBin -e "process.exit(0);" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Node.js is working. Attempting to use utils.mjs to stop services..."
            # Run the actual command but suppress output unless there's an error
            & $NodeBin $UtilsPath "uninstall" 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Failed to run utils.mjs (missing modules like fs-extra). Skipping PM2 process management."
            }
        } else {
            Write-Host "Node.js binary found but not working properly. Skipping PM2 process management."
        }
    } catch {
        Write-Host "Node.js binary found but not working properly. Skipping PM2 process management."
    }
} else {
    # Skip PM2 process management if utils.mjs or Node.js is not available
    Write-Host "Local Node.js or utils.mjs not found. Skipping PM2 process management."
    Write-Host "Please reinstall the application first if you want to properly uninstall all services."
}

# Check if components should be removed
$RemoveComponents = $false
$SkipTestLogs = $false

# Check if we should skip removing test logs
if ($env:SKIP_REMOVE_TEST_LOGS) {
    Write-Host "Will skip removing test logs as requested via SKIP_REMOVE_TEST_LOGS"
    $SkipTestLogs = $true
}

# Skip component removal if SKIP_REMOVE_COMPONENTS is set
if ($env:SKIP_REMOVE_COMPONENTS) {
    Write-Host "Skipping component removal as requested via SKIP_REMOVE_COMPONENTS"
} elseif ($env:FORCE_REMOVE_COMPONENTS) {
    # Force component removal for automated testing
    Write-Host "Forcing component removal as requested via FORCE_REMOVE_COMPONENTS"
    $RemoveComponents = $true
} else {
    # Ask if the user wants to remove installed components
    $answer = Read-Host "Do you want to remove all installed components? (y/n)"
    if ($answer -match "^[Yy]") {
        $RemoveComponents = $true
    }
}

# Kill running Node.js, PM2, and Ollama processes before removal
Write-Host "Stopping any running Node.js, PM2, and Ollama processes..."
try {
    $nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        Write-Host "Killing node.exe processes..."
        $nodeProcs | ForEach-Object { $_.Kill() }
    }
} catch {}
try {
    $pm2Procs = Get-Process -Name pm2 -ErrorAction SilentlyContinue
    if ($pm2Procs) {
        Write-Host "Killing pm2 processes..."
        $pm2Procs | ForEach-Object { $_.Kill() }
    }
} catch {}
try {
    $ollamaProcs = Get-Process | Where-Object { $_.Name -like '*ollama*' }
    if ($ollamaProcs) {
        Write-Host "Killing all processes with 'ollama' in their name..."
        $ollamaProcs | ForEach-Object { $_.Kill() }
    }
} catch {}
# try {
#     $ollamaLibProcs = Get-Process -Name ollama-lib,ollama-lib.exe -ErrorAction SilentlyContinue
#     if ($ollamaLibProcs) {
#         Write-Host "Killing ollama-lib.exe processes..."
#         $ollamaLibProcs | ForEach-Object { $_.Kill() }
#     }
# } catch {}

# Remove components if requested
if ($RemoveComponents -eq $true) {
    Write-Host "Removing installed components..."
    
    # Remove backend virtual environment
    $VenvPath = "backend\venv"
    if (Test-Path $VenvPath) {
        Write-Host "Removing backend virtual environment..."
        Remove-DirectorySafely $VenvPath
    }
    
    # Remove frontend build and node_modules
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
    
    $FrontendNodeModules = "frontend\node_modules"
    if (Test-Path $FrontendNodeModules) {
        Write-Host "Removing frontend node_modules..."
        Remove-DirectorySafely $FrontendNodeModules
    }
    
    # Remove root node_modules directory
    if (Test-Path "node_modules") {
        Write-Host "Removing root node_modules..."
        Remove-DirectorySafely "node_modules"
    }
    
    # Remove thirdparty directory (includes Node.js and Ollama)
    if (Test-Path "thirdparty") {
        Write-Host "Removing thirdparty directory (Node.js, Ollama, etc.)..."
        Remove-DirectorySafely "thirdparty"
    }
    
    # Remove data directory
    if (Test-Path "data") {
        Write-Host "Removing data directory..."
        Remove-DirectorySafely "data"
    }
    
    # Remove test logs directory (unless explicitly told to skip it)
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
    
    # Remove dist packages - make sure to use the repository directory if we're in repo mode
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
