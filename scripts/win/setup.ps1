# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Setting up system-level dependencies (requires administrator privileges)..."

# Function to check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Install winget if not available
function Install-Winget {
    Write-Host "Checking if winget is available..."

    try {
        $wingetVersion = winget --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "winget is already available: $wingetVersion"
            return
        }
    } catch {
        # winget not found, continue with installation
    }
    
    Write-Host "Installing winget (App Installer)..."
    try {
        # Install App Installer package which includes winget
        Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe
        Write-Host "winget installed successfully."
    } catch {
        Write-Warning "Failed to install winget automatically. Please install manually from Microsoft Store (App Installer)."
    }
}

# Install Python 3.12 using winget
function Install-Python {
    Write-Host "Checking if Python 3.12 or higher is installed..."

    try {
        $pythonVersion = python --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            if ($pythonVersion -match "Python (\d+)\.(\d+)") {
                $major = [int]$matches[1]
                $minor = [int]$matches[2]
                if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 12)) {
                    Write-Host "Python $major.$minor is already installed: $pythonVersion"
                    return
                }
            }
        }
        Write-Host "Installing Python 3.12..."
        winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Python 3.12 installed successfully."
        } else {
            Write-Warning "Failed to install Python 3.12 via winget. Please install manually from python.org"
        }
    } catch {
        Write-Host "Installing Python 3.12..."
        try {
            winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Python 3.12 installed successfully."
            } else {
                Write-Warning "Failed to install Python 3.12 via winget. Please install manually from python.org"
            }
        } catch {
            Write-Warning "Failed to install Python 3.12. Please install manually from python.org"
        }
    }

    # Create python3 alias using symbolic link
    Write-Host "Creating python3 alias..."
    try {
        # Get the Python installation path
        $pythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
        if ($pythonPath) {
            $python3SymlinkPath = "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\python3.exe"

            # Create symbolic link if it doesn't exist
            if (-not (Test-Path $python3SymlinkPath)) {
                New-Item -ItemType SymbolicLink -Path $python3SymlinkPath -Target $pythonPath -Force
                Write-Host "Created python3.exe symbolic link successfully."
            } else {
                Write-Host "python3.exe symbolic link already exists."
            }
        } else {
            Write-Warning "Could not find python.exe to create python3 alias."
        }
    } catch {
        Write-Warning "Could not create python3 alias. You may need to use 'python' instead of 'python3'."
    }
}

# Enable long path support
function Enable-LongPaths {
    Write-Host "Enabling long path support..."
    try {
        $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
        $regKey = "LongPathsEnabled"
        $regValue = 1

        Set-ItemProperty -Path $regPath -Name $regKey -Value $regValue -Force
        Write-Host "Long path support enabled."
    } catch {
        Write-Warning "Failed to enable long path support. This may cause issues with deep directory structures."
    }
}

# Detect environment - repository or distribution package
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent
if (Test-Path (Join-Path $ProjectRoot ".version")) {
    # This is a distribution package
    $Version = Get-Content (Join-Path $ProjectRoot ".version")
    Write-Host "Detected distribution package environment (version: $Version)"
} else {
    Write-Host "Detected repository environment"
}

# Check if running as administrator
if (-not (Test-Administrator)) {
    Write-Host "This script requires administrator privileges. Please run as administrator."
    Write-Host "Right-click on PowerShell and select 'Run as administrator', then run this script again."
    exit 1
}

# Enable PowerShell script execution if needed
$executionPolicy = Get-ExecutionPolicy
if ($executionPolicy -eq "Restricted") {
    Write-Host "Enabling PowerShell script execution..."
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
}

Enable-LongPaths
Install-Winget
Install-Python

Write-Host "System-level setup completed successfully."
Write-Host ""
Write-Host "To complete the installation, double click or run the following command in PowerShell terminal (without administrator privileges):"
Write-Host "-----------------------------------------------------------------------"
Write-Host ".\install.ps1"
Write-Host ""
