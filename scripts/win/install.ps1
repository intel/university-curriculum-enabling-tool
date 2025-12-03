# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# Set error action preference to stop on any error
$ErrorActionPreference = "Stop"

# Add global error handler
trap {
    Write-Host "ERROR: An unexpected error occurred during installation:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Error occurred at line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    Write-Host "Full error details:" -ForegroundColor Red
    Write-Host $_.Exception.ToString() -ForegroundColor Red
    exit 1
}

Write-Host "Installing application components..."

# Default persona is faculty if not specified
$Persona = if ($args[0]) { $args[0] } else { "faculty" }
$ForceFlag = ""

# Check if force flag is provided
if ($args[1] -eq "--force") {
    $ForceFlag = "--force"
}

# Check for development mode environment variable
$DevMode = if ($env:DEV_MODE) { $env:DEV_MODE } else { "false" }
if ($DevMode -eq "true") {
    Write-Host "Development mode enabled - installing minimal dependencies for development"
}

# Function to read input with timeout
function Read-HostWithTimeout {
    param(
        [string]$Prompt,
        [int]$TimeoutSeconds = 15
    )

    Write-Host "$Prompt : " -NoNewline

    $endTime = (Get-Date).AddSeconds($TimeoutSeconds)
    $input = ""

    while ((Get-Date) -lt $endTime) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq 'Enter') {
                Write-Host ""
                return $input
            } elseif ($key.Key -eq 'Backspace') {
                if ($input.Length -gt 0) {
                    $input = $input.Substring(0, $input.Length - 1)
                    Write-Host "`b `b" -NoNewline
                }
            } else {
                $input += $key.KeyChar
                Write-Host $key.KeyChar -NoNewline
            }
        }
        Start-Sleep -Milliseconds 50
    }

    Write-Host ""
    return $null
}

# Prompt for PROVIDER if not set
if (-not $env:PROVIDER) {
    Write-Host "Which backend do you want to install?"
    Write-Host "  [1] Ollama (default)"
    Write-Host "  [2] OVMS"

    $ServiceChoice = Read-HostWithTimeout -Prompt "Enter 1 for Ollama or 2 for OVMS (auto-selects Ollama after 15s)" -TimeoutSeconds 15

    if (-not $ServiceChoice) {
        Write-Host "`nNo response after 15 seconds. Defaulting to Ollama."
        $env:PROVIDER = "ollama"
    } else {
        switch ($ServiceChoice.Trim()) {
            {$_ -in @("2", "ovms", "OVMS")} {
                $env:PROVIDER = "ovms"
            }
            {$_ -in @("", "1", "ollama", "OLLAMA")} {
                $env:PROVIDER = "ollama"
            }
            default {
                Write-Host "Invalid selection. Defaulting to Ollama."
                $env:PROVIDER = "ollama"
            }
        }
    }
}

# Set install service based on PROVIDER environment variable
$InstallService = ""
if ($env:PROVIDER -eq "ovms") {
    Write-Host "PROVIDER=ovms detected. Installing OVMS..."
    $InstallService = "setup-ovms"
} elseif ($env:PROVIDER -eq "ollama") {
    Write-Host "PROVIDER=ollama detected. Installing Ollama..."
    $InstallService = "setup-ollama"
} else {
    Write-Host "Unknown PROVIDER value: $($env:PROVIDER). Supported: ollama, ovms."
    Write-Host "Defaulting to ollama."
    $env:PROVIDER = "ollama"
    $InstallService = "setup-ollama"
}

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent
Set-Location $ProjectRoot

# Function to find the dist package directory for a given persona
function Find-DistPackage {
    param($persona)

    $distDir = Join-Path $ProjectRoot "dist"
    $packageName = ""

    # If we're running from the root repository and it's explicitly specified,
    # we shouldn't use any existing distribution package
    if ($script:IsRootRepo -eq $true -and $args[1] -eq "--from-root") {
        return $null
    }

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
$IsRootRepo = $false

# Check if this is the root repository by looking for specific development directories
if (Test-Path (Join-Path $ProjectRoot "frontend\src")) {
    $IsRootRepo = $true
    Write-Host "Detected root repository environment"
}

# Check if this is a distribution package by looking for the .version file
if (Test-Path (Join-Path $ProjectRoot ".version")) {
    $IsDistPackage = $true
    $Version = Get-Content (Join-Path $ProjectRoot ".version")
    Write-Host "Detected distribution package environment (version: $Version)"
} else {
    if ((Test-Path (Join-Path $ProjectRoot "thirdparty\node")) -and -not (Test-Path (Join-Path $ProjectRoot ".version"))) {
        Write-Host "Detected repository environment (with Node.js installed)"
    } else {
        Write-Host "Detected repository environment"
    }
}

# Create directory structure in project root
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "scripts")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "thirdparty\node")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "thirdparty\ollama")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "thirdparty\jq")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "thirdparty\pm2")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "node_modules")

# Create root .env file from template if it doesn't exist
$EnvFile = Join-Path $ProjectRoot ".env"
$EnvTemplate = Join-Path $ProjectRoot ".env.template"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvTemplate)) {
    Write-Host "Creating root .env file from template..."
    Copy-Item $EnvTemplate $EnvFile
    Write-Host "Root .env file created successfully."
} elseif (-not (Test-Path $EnvFile) -and -not (Test-Path $EnvTemplate)) {
    Write-Host "Warning: No .env.template found in root directory. Skipping .env creation."
} else {
    Write-Host "Root .env file already exists."
}

# Always update PROVIDER in .env to match current PROVIDER value
if (Test-Path $EnvFile) {
    Write-Host "Updating PROVIDER=$($env:PROVIDER) in root .env file..."
    $envContent = Get-Content $EnvFile -Raw
    if ($envContent -match '(?m)^PROVIDER=.*$') {
        # Update existing PROVIDER line
        $envContent = $envContent -replace '(?m)^PROVIDER=.*$', "PROVIDER=$($env:PROVIDER)"
    } else {
        # Add PROVIDER if it doesn't exist
        if (-not $envContent.EndsWith("`n")) {
            $envContent += "`n"
        }
        $envContent += "PROVIDER=$($env:PROVIDER)`n"
    }
    $envContent | Set-Content $EnvFile -NoNewline
    Write-Host "PROVIDER updated successfully in root .env file."
} else {
    Write-Host "Warning: .env file not found, PROVIDER not set."
}

# Check for local Node.js installation
$NodeDir = Join-Path $ProjectRoot "thirdparty\node"
$NodeBin = Join-Path $NodeDir "node.exe"
$NpmBin = Join-Path $NodeDir "npm.cmd"

# If Node.js is not installed locally, download and install it
if (-not (Test-Path $NodeBin)) {
    Write-Host "Installing Node.js locally..."

    # Create Node.js directory
    $null = New-Item -ItemType Directory -Force -Path $NodeDir

    # Determine system architecture
    $Arch = $env:PROCESSOR_ARCHITECTURE
    if ($Arch -eq "AMD64") {
        $NodeArch = "x64"
    } elseif ($Arch -eq "ARM64") {
        $NodeArch = "arm64"
    } else {
        Write-Host "Unsupported architecture: $Arch"
        exit 1
    }

    # Download and extract Node.js
    $NodeVersion = "22.16.0"
    $NodeZip = "node-v$NodeVersion-win-$NodeArch.zip"
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZip"
    $TempZip = Join-Path $env:TEMP $NodeZip

    Write-Host "Downloading Node.js from $NodeUrl..."
    Invoke-WebRequest -Uri $NodeUrl -OutFile $TempZip

    Write-Host "Extracting Node.js..."
    Expand-Archive -Path $TempZip -DestinationPath $env:TEMP -Force
    $ExtractedDir = Join-Path $env:TEMP "node-v$NodeVersion-win-$NodeArch"

    # Use robocopy for better handling of long paths and deep directory structures
    Write-Host "Copying Node.js files (this may take a moment)..."
    $RobocopyArgs = @(
        "`"$ExtractedDir`"",
        "`"$NodeDir`"",
        "/E",           # Copy subdirectories, including empty ones
        "/R:3",         # Retry 3 times on failed copies
        "/W:1",         # Wait 1 second between retries
        "/NFL",         # No file list (reduce output)
        "/NDL",         # No directory list
        "/NJH",         # No job header
        "/NJS",         # No job summary
        "/NC",          # No class
        "/NS",          # No size
        "/NP"           # No progress
    )

    $RobocopyResult = & robocopy @RobocopyArgs
    $RobocopyExitCode = $LASTEXITCODE

    # Robocopy exit codes 0-7 are success, 8+ are errors
    if ($RobocopyExitCode -ge 8) {
        Write-Host "Warning: Some files may not have been copied correctly (robocopy exit code: $RobocopyExitCode)"
        Write-Host "Attempting fallback copy method..."

        # Fallback to PowerShell copy with error handling
        try {
            Copy-Item -Path "$ExtractedDir\*" -Destination $NodeDir -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Host "Error during Node.js installation: $($_.Exception.Message)"
            Write-Host "Some files with very long paths may not have been copied."
            Write-Host "Node.js should still function correctly for basic operations."
        }
    } else {
        Write-Host "Node.js files copied successfully."
    }

    Remove-Item $TempZip -Force
    Remove-Item $ExtractedDir -Recurse -Force

    Write-Host "Node.js installed locally at $NodeDir"
} else {
    Write-Host "Node.js already available at $NodeDir"
}

# Check for local jq installation
$JqDir = Join-Path $ProjectRoot "thirdparty\jq"
$JqBin = Join-Path $JqDir "jq.exe"

# If jq is not installed locally, download and install it
if (-not (Test-Path $JqBin)) {
    Write-Host "Installing jq locally..."

    # Create jq directory
    $null = New-Item -ItemType Directory -Force -Path $JqDir

    # Determine system architecture
    $Arch = $env:PROCESSOR_ARCHITECTURE
    if ($Arch -eq "AMD64") {
        $JqArch = "amd64"
    } elseif ($Arch -eq "ARM64") {
        $JqArch = "arm64"
    } else {
        Write-Host "Unsupported architecture: $Arch"
        exit 1
    }

    # Download jq
    $JqVersion = "1.7"
    $JqUrl = "https://github.com/jqlang/jq/releases/download/jq-$JqVersion/jq-windows-$JqArch.exe"

    Write-Host "Downloading jq from $JqUrl..."
    Invoke-WebRequest -Uri $JqUrl -OutFile $JqBin

    Write-Host "jq installed locally at $JqBin"
} else {
    Write-Host "jq already available at $JqBin"
}

# Add Node.js to PATH so npm can find it
$env:PATH = "$NodeDir;$env:PATH"

# Install necessary dependencies based on environment
if ($IsDistPackage -eq $false) {
    # Repository environment - install all dependencies and build from source
    Write-Host "Installing for repository environment..."

    # Create a package.json for script dependencies if it doesn't exist
    $PackageJsonPath = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $PackageJsonPath)) {
        Write-Host "Creating package.json for script dependencies..."
        $PackageJson = @'
{
  "name": "ci-scripts",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0",
    "pm2": "^6.0.8"
  }
}
'@
        $PackageJson | Out-File -FilePath $PackageJsonPath -Encoding UTF8
    }

    # Install script dependencies if needed or forced
    $NodeModulesPath = Join-Path $ProjectRoot "node_modules"
    $FsExtraPath = Join-Path $NodeModulesPath "fs-extra"

    if ($ForceFlag -eq "--force" -or -not (Test-Path $NodeModulesPath) -or -not (Test-Path $FsExtraPath)) {
        Write-Host "Installing script dependencies..."
        & $NpmBin install --no-progress --no-color
    } else {
        Write-Host "Script dependencies already installed. Use --force to reinstall."
    }

    # Install frontend dependencies if needed or forced
    Set-Location "frontend"
    $FrontendNodeModules = Join-Path $ProjectRoot "frontend\node_modules"
    if ($ForceFlag -eq "--force" -or -not (Test-Path $FrontendNodeModules)) {
        Write-Host "Installing frontend dependencies..."
        & $NpmBin install --no-progress --no-color
    } else {
        Write-Host "Frontend dependencies already installed. Use --force to reinstall."
    }

    # Create .env file from .env.template if it doesn't exist
    $FrontendEnv = ".env"
    $FrontendEnvTemplate = ".env.template"

    if (-not (Test-Path $FrontendEnv) -and (Test-Path $FrontendEnvTemplate)) {
        Write-Host "Creating frontend/.env file from template..."
        Copy-Item $FrontendEnvTemplate $FrontendEnv

        # Generate a random secret for Payload CMS
        Write-Host "Generating Payload CMS secret"
        $RNG = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $RandomBytes = New-Object byte[] 32
        $RNG.GetBytes($RandomBytes)
        $PayloadSecret = [Convert]::ToBase64String($RandomBytes)
        $RNG.Dispose()

        # Set PAYLOAD_SECRET only if it is empty (matches install.sh pattern)
        $envContent = Get-Content $FrontendEnv
        $envContent = $envContent -replace '^PAYLOAD_SECRET=$', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
        $envContent | Set-Content $FrontendEnv

        Write-Host "Frontend .env file created successfully."
    } elseif (-not (Test-Path $FrontendEnv) -and -not (Test-Path $FrontendEnvTemplate)) {
        Write-Host "Warning: No .env.template found in frontend directory. Skipping .env creation."
    } else {
        # If .env exists and PAYLOAD_SECRET is empty, update it
        $envContent = Get-Content $FrontendEnv
        if ($envContent -match '^PAYLOAD_SECRET=$') {
            Write-Host "Updating PAYLOAD_SECRET in existing frontend .env file"
            $RNG = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $RandomBytes = New-Object byte[] 32
            $RNG.GetBytes($RandomBytes)
            $PayloadSecret = [Convert]::ToBase64String($RandomBytes)
            $RNG.Dispose()
            $envContent = $envContent -replace '^PAYLOAD_SECRET=$', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent | Set-Content $FrontendEnv
            Write-Host "Updated PAYLOAD_SECRET in existing frontend .env file."
        } else {
            Write-Host "Frontend .env file already exists and PAYLOAD_SECRET is set."
        }
    }

    Set-Location ".."

    # Skip build and distribution package creation in development mode
    if ($DevMode -eq "true") {
        # Add Node.js bin, jq, and PM2 to local path file for other scripts in development mode
        Write-Host "Creating node_env.ps1 script for development mode..."
        $NodeEnvContent = @"
# node_env.ps1
`$env:PATH = "$NodeDir;$JqDir;$(Join-Path $ProjectRoot 'node_modules\.bin');`$env:PATH"
`$env:THIRDPARTY_DIR = "$(Join-Path $ProjectRoot 'thirdparty')"
`$env:IS_DIST_PACKAGE = "false"
`$env:DEV_MODE = "true"
`$env:PROVIDER = "$($env:PROVIDER)"
"@
        $NodeEnvPath = Join-Path $ProjectRoot "node_env.ps1"
        $NodeEnvContent | Out-File -FilePath $NodeEnvPath -Encoding UTF8
        Write-Host "node_env.ps1 created successfully at: $NodeEnvPath"

        # Source the environment file to ensure paths are available for setup scripts
        . $NodeEnvPath

        # Setup backend environment - ensure we're in the root directory
        Set-Location $ProjectRoot
        $ForceArg = if ($ForceFlag) { $ForceFlag } else { "" }
        # Set environment variable for proper path resolution
        $env:IS_DIST_PACKAGE = "false"
        $env:DEV_MODE = "true"
        try {
            & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") "setup-backend" $ForceArg
            if ($LASTEXITCODE -ne 0) {
                throw "Backend setup failed with exit code: $LASTEXITCODE"
            }
            Write-Host "Backend setup completed successfully."
        } catch {
            Write-Host "ERROR: Backend setup failed:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }

        # Setup AI service (Ollama or OVMS) - ensure we're in the root directory
        Set-Location $ProjectRoot
        # Set environment variable for proper path resolution
        $env:IS_DIST_PACKAGE = "false"
        $env:DEV_MODE = "true"
        try {
            & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") $InstallService
            if ($LASTEXITCODE -ne 0) {
                throw "$InstallService failed with exit code: $LASTEXITCODE"
            }
            Write-Host "$InstallService completed successfully."
        } catch {
            Write-Host "ERROR: $InstallService failed:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }

        Write-Host "Development environment installation completed."
        Write-Host ""
        Write-Host "To start development:"
        Write-Host "1. Source the environment: . .\node_env.ps1"
        if ($env:PROVIDER -eq "ollama") {
            Write-Host "2. Start Ollama with required environment variables:"
            Write-Host "   cd thirdparty\ollama"
            Write-Host "   # Set environment variables from .env file"
            Write-Host "   .\ollama.exe serve"
        } else {
            Write-Host "2. Start OVMS with required environment variables:"
            Write-Host "   cd backend\ovms_service"
            Write-Host "   .\venv\Scripts\Activate.ps1"
            Write-Host "   python ovms_start.py"
        }
        Write-Host "3. In one terminal - Start frontend: cd frontend && npm run dev"
        Write-Host "4. In another terminal - Start backend: cd backend && python main.py --debug"
        exit 0
    }

    # If we're running from the root repo, build and create distribution package then exit
    if ($IsRootRepo -eq $true) {
        # Build the application
        Write-Host "Building the application for persona: $Persona..."
        & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") "build" $Persona $ForceFlag

        # Create distribution package
        Write-Host "Creating distribution package for persona: $Persona..."
        & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") "create-package" $Persona $ForceFlag

        # Exit after creating distribution package (like install.sh does)
        exit 0
    } else {
        # For non-root repository environments, show guidance
        Write-Host "Non-root repository environment detected."
        Write-Host "Please run this script from the root repository directory to build and create distribution packages."
        Write-Host "Or manually build the application first with:"
        Write-Host "& `"$NodeBin`" `"$(Join-Path $ProjectRoot 'scripts\utils.mjs')`" build $Persona"
        Write-Host "& `"$NodeBin`" `"$(Join-Path $ProjectRoot 'scripts\utils.mjs')`" create-package $Persona"
        exit 1
    }
} else {
    # Distribution package environment - already built, just install runtime dependencies
    Write-Host "Installing for distribution package environment..."

    # Create a minimal package.json for runtime dependencies if it doesn't exist
    $PackageJsonPath = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $PackageJsonPath)) {
        Write-Host "Creating package.json for runtime dependencies..."
        $PackageJson = @'
{
  "name": "ci-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0",
    "pm2": "^6.0.8"
  }
}
'@
        $PackageJson | Out-File -FilePath $PackageJsonPath -Encoding UTF8
    }

    # Install minimal runtime dependencies if needed or forced
    $NodeModulesPath = Join-Path $ProjectRoot "node_modules"
    $FsExtraPath = Join-Path $NodeModulesPath "fs-extra"

    if ($ForceFlag -eq "--force" -or -not (Test-Path $NodeModulesPath) -or -not (Test-Path $FsExtraPath)) {
        Write-Host "Installing runtime dependencies..."
        & $NpmBin install --no-progress --no-color
    } else {
        Write-Host "Runtime dependencies already installed. Use --force to reinstall."
    }

    # Generate PAYLOAD_SECRET for distribution package .env files
    Write-Host "Setting up PayloadCMS secrets for distribution package..."

    # Check if this is a faculty distribution package (default persona)
    $StandaloneEnvPath = Join-Path $ScriptDir "next-faculty\standalone\.env"
    if (Test-Path $StandaloneEnvPath) {
        $envContent = Get-Content $StandaloneEnvPath -Raw
        if ($envContent -match 'PAYLOAD_SECRET=""' -or $envContent -match '^PAYLOAD_SECRET=$') {
            Write-Host "Generating Payload CMS secret for next-faculty/standalone/.env"
            $RNG = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $RandomBytes = New-Object byte[] 32
            $RNG.GetBytes($RandomBytes)
            $PayloadSecret = [Convert]::ToBase64String($RandomBytes)
            $RNG.Dispose()

            # Replace empty PAYLOAD_SECRET with generated secret
            $envContent = $envContent -replace 'PAYLOAD_SECRET=""', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent = $envContent -replace '^PAYLOAD_SECRET=$', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent | Set-Content $StandaloneEnvPath -NoNewline
            Write-Host "PAYLOAD_SECRET generated successfully for next-faculty/standalone/.env"
        } else {
            Write-Host "PAYLOAD_SECRET already set in next-faculty/standalone/.env"
        }
    }

    # Check for other persona distribution packages (lecturer, student)
    $LecturerStandaloneEnvPath = Join-Path $ScriptDir "next-lecturer\standalone\.env"
    if (Test-Path $LecturerStandaloneEnvPath) {
        $envContent = Get-Content $LecturerStandaloneEnvPath -Raw
        if ($envContent -match 'PAYLOAD_SECRET=""' -or $envContent -match '^PAYLOAD_SECRET=$') {
            Write-Host "Generating Payload CMS secret for next-lecturer/standalone/.env"
            $RNG = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $RandomBytes = New-Object byte[] 32
            $RNG.GetBytes($RandomBytes)
            $PayloadSecret = [Convert]::ToBase64String($RandomBytes)
            $RNG.Dispose()

            # Replace empty PAYLOAD_SECRET with generated secret
            $envContent = $envContent -replace 'PAYLOAD_SECRET=""', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent = $envContent -replace '^PAYLOAD_SECRET=$', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent | Set-Content $LecturerStandaloneEnvPath -NoNewline
            Write-Host "PAYLOAD_SECRET generated successfully for next-lecturer/standalone/.env"
        } else {
            Write-Host "PAYLOAD_SECRET already set in next-lecturer/standalone/.env"
        }
    }

    $StudentStandaloneEnvPath = Join-Path $ScriptDir "next-student\standalone\.env"
    if (Test-Path $StudentStandaloneEnvPath) {
        $envContent = Get-Content $StudentStandaloneEnvPath -Raw
        if ($envContent -match 'PAYLOAD_SECRET=""' -or $envContent -match '^PAYLOAD_SECRET=$') {
            Write-Host "Generating Payload CMS secret for next-student/standalone/.env"
            $RNG = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $RandomBytes = New-Object byte[] 32
            $RNG.GetBytes($RandomBytes)
            $PayloadSecret = [Convert]::ToBase64String($RandomBytes)
            $RNG.Dispose()

            # Replace empty PAYLOAD_SECRET with generated secret
            $envContent = $envContent -replace 'PAYLOAD_SECRET=""', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent = $envContent -replace '^PAYLOAD_SECRET=$', ('PAYLOAD_SECRET="' + $PayloadSecret + '"')
            $envContent | Set-Content $StudentStandaloneEnvPath -NoNewline
            Write-Host "PAYLOAD_SECRET generated successfully for next-student/standalone/.env"
        } else {
            Write-Host "PAYLOAD_SECRET already set in next-student/standalone/.env"
        }
    }

    # Setup backend environment
    Write-Host "Setting up backend environment..."
    $ForceArg = if ($ForceFlag) { $ForceFlag } else { "" }
    # Set environment variable for proper path resolution
    $env:IS_DIST_PACKAGE = "true"
    $env:DEV_MODE = "false"
    try {
        & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") "setup-backend" $ForceArg
        if ($LASTEXITCODE -ne 0) {
            throw "Backend setup failed with exit code: $LASTEXITCODE"
        }
        Write-Host "Backend setup completed successfully."
    } catch {
        Write-Host "ERROR: Backend setup failed:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }

    # Setup AI service (Ollama or OVMS)
    Write-Host "Setting up $($env:PROVIDER.ToUpper())..."
    # Set environment variable for proper path resolution
    $env:IS_DIST_PACKAGE = "true"
    $env:DEV_MODE = "false"
    try {
        & $NodeBin (Join-Path $ProjectRoot "scripts\utils.mjs") $InstallService
        if ($LASTEXITCODE -ne 0) {
            throw "$InstallService failed with exit code: $LASTEXITCODE"
        }
        Write-Host "$InstallService completed successfully."
    } catch {
        Write-Host "ERROR: $InstallService failed:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }

    # Add Node.js bin, jq, and PM2 to local path file for other scripts
    Write-Host "Creating node_env.ps1 script for distribution package environment..."
    $NodeEnvContent = @"
# node_env.ps1
`$env:PATH = "$NodeDir;$JqDir;$(Join-Path $ProjectRoot 'node_modules\.bin');`$env:PATH"
`$env:THIRDPARTY_DIR = "$(Join-Path $ProjectRoot 'thirdparty')"
`$env:IS_DIST_PACKAGE = "true"
`$env:DEV_MODE = "false"
`$env:PROVIDER = "$($env:PROVIDER)"
"@
    $NodeEnvPath = Join-Path $ProjectRoot "node_env.ps1"
    $NodeEnvContent | Out-File -FilePath $NodeEnvPath -Encoding UTF8
    Write-Host "node_env.ps1 created successfully at: $NodeEnvPath"

    Write-Host "Distribution package environment setup completed."
}

Write-Host "Installation completed successfully"
Write-Host ""
Write-Host "To complete the installation, double click or run the following command in PowerShell terminal (without administrator privileges):"
Write-Host "-----------------------------------------------------------------------"
Write-Host ".\run.ps1"
Write-Host ""

# Explicit successful exit
exit 0
