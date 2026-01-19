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

# Global variable to track GPU compatibility status
$script:GpuCompatible = $false

# Function to check GPU compatibility
function Test-GPUCompatibility {
    Write-Host ""
    Write-Host "Checking system GPU compatibility..."

    $GpuOk = $false

    # Get CPU model
    try {
        $CpuModel = (Get-WmiObject -Class Win32_Processor).Name
        Write-Host "CPU: $CpuModel"

        # Detect Intel Core Ultra (iGPU)
        if ($CpuModel -match "Core.*Ultra") {
            Write-Host "Detected Core Ultra CPU ($CpuModel) - iGPU supported."
            $GpuOk = $true
        }
    } catch {
        Write-Host "Warning: Could not detect CPU model"
    }

    # Detect Intel discrete GPU if iGPU not found
    if (-not $GpuOk) {
        try {
            $IntelGpus = Get-WmiObject -Class Win32_VideoController | Where-Object {
                $_.Name -match "Intel" -and $_.AdapterCompatibility -match "Intel"
            }

            foreach ($Gpu in $IntelGpus) {
                # Look for discrete GPUs (Arc series or other dedicated Intel GPUs)
                if ($Gpu.Name -match "Arc|Xe|A[0-9]{3}|DG[0-9]") {
                    Write-Host "Intel discrete GPU detected:"
                    Write-Host "   $($Gpu.Name)"
                    $GpuOk = $true
                    break
                }
            }

            if (-not $GpuOk) {
                Write-Host "Warning: No compatible Intel GPU detected."
            }
        } catch {
            Write-Host "Warning: Could not query GPU information"
        }
    }

    # Set global variable for use at end of installation
    $script:GpuCompatible = $GpuOk

    Write-Host ""

    # Return status: $true if GPU is OK, $false if not
    if ($GpuOk -eq $true) {
        return $true
    } else {
        return $false
    }
}

# Use local Node.js
$NodeBin = Join-Path $ProjectRoot 'thirdparty\node\node.exe'

# Check GPU compatibility
if (Test-GPUCompatibility) {
    # GPU is compatible - start all services normally
    if (Test-Path $NodeBin) {
        # & $NodeBin 'scripts\utils.mjs' 'start' $Persona
        Write-Host "TESTING: Starting without AI provider services..."
        & $NodeBin 'scripts\utils.mjs' 'start-no-provider' $Persona
    } else {
        Write-Host "Error: Local Node.js installation not found. Please run the install script first."
        exit 1
    }
} else {
    # GPU is NOT compatible - prompt user
    Write-Host ""
    Write-Host "Your GPU may not be compatible to run AI Provider services."
    Write-Host "Choose an option:"
    Write-Host "  [y] Start all services anyway (may fail)"
    Write-Host "  [n] Start only frontend and backend (configure external AI Provider in Settings page)"
    Write-Host ""
    $ProceedAnyway = Read-Host "Your choice (y/n)"

    if ($ProceedAnyway -eq "y" -or $ProceedAnyway -eq "Y") {
        # Use local Node.js
        if (Test-Path $NodeBin) {
            & $NodeBin 'scripts\utils.mjs' 'start' $Persona
        } else {
            Write-Host "Error: Local Node.js installation not found. Please run the install script first."
            exit 1
        }
    } else {
        Write-Host ""
        Write-Host "Starting web interface and backend without AI Provider services..."
        Write-Host "Note: Please navigate to settings page to configure external AI Provider server."
        Write-Host ""
        # Use local Node.js to start only frontend and backend
        if (Test-Path $NodeBin) {
            & $NodeBin 'scripts\utils.mjs' 'start-no-provider' $Persona
        } else {
            Write-Host "Error: Local Node.js installation not found. Please run the install script first."
            exit 1
        }
    }
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
