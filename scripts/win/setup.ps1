# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

Write-Host "Setting up system-level dependencies (requires administrator privileges)..."

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Download-File {
    param(
        [string]$Url,
        [string]$OutputPath,
        [int]$MaxRetries = 3
    )

    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        $attempt++
        Write-Host "Downloading from $Url (attempt $attempt of $MaxRetries)..."
        try {
            $webClient = New-Object System.Net.WebClient
            $webClient.DownloadFile($Url, $OutputPath)
            Write-Host "Download completed: $OutputPath"
            return $true
        } catch {
            Write-Warning "Download attempt $attempt failed: $_"
            if (Test-Path $OutputPath) {
                Remove-Item $OutputPath -Force
            }
            if ($attempt -lt $MaxRetries) {
                Write-Host "Retrying in 5 seconds..."
                Start-Sleep -Seconds 5
            }
        } finally {
            if ($webClient) { $webClient.Dispose() }
        }
    }
    return $false
}

function Refresh-Path {
    Write-Host "Refreshing PATH environment variable..."
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH    = "$machinePath;$userPath"

    # Broadcast WM_SETTINGCHANGE so Explorer and new shells pick up the updated PATH
    if (-not ([System.Management.Automation.PSTypeName]'WinAPI.NativeMethods').Type) {
        Add-Type -Namespace WinAPI -Name NativeMethods -MemberDefinition @"
            [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
            public static extern IntPtr SendMessageTimeout(
                IntPtr hWnd, uint Msg, UIntPtr wParam,
                string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
    }

    $HWND_BROADCAST   = [IntPtr]0xffff
    $WM_SETTINGCHANGE = 0x001A
    $result           = [UIntPtr]::Zero
    [WinAPI.NativeMethods]::SendMessageTimeout(
        $HWND_BROADCAST,
        $WM_SETTINGCHANGE,
        [UIntPtr]::Zero,
        "Environment",
        2,
        5000,
        [ref]$result
    ) | Out-Null

    Write-Host "PATH refreshed and broadcast to system."
}

function Add-ToSystemPath {
    param([string]$Directory)

    if (-not (Test-Path $Directory)) {
        Write-Warning "Directory does not exist, skipping PATH addition: $Directory"
        return
    }

    $currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $pathEntries = $currentPath -split ";" | ForEach-Object { $_.TrimEnd("\") }

    if ($pathEntries -notcontains $Directory.TrimEnd("\")) {
        $newPath = "$currentPath;$Directory"
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
        Write-Host "Added to system PATH: $Directory"
    } else {
        Write-Host "Already in system PATH: $Directory"
    }

    # Also update the current session immediately
    if (($env:PATH -split ";" | ForEach-Object { $_.TrimEnd("\") }) -notcontains $Directory.TrimEnd("\")) {
        $env:PATH = "$env:PATH;$Directory"
        Write-Host "Updated current session PATH: $Directory"
    }
}

function Install-Python {
    Write-Host ""
    Write-Host "=== Installing Python 3.12 ==="

    $pythonCandidates = @("python", "python3", "python3.12")
    foreach ($candidate in $pythonCandidates) {
        try {
            $ver = & $candidate --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $ver -match "Python (\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 12)) {
                    Write-Host "Python $major.$minor is already installed ($candidate): $ver"
                    Ensure-PythonInPath
                    return
                }
            }
        } catch { }
    }

    $pythonVersion = "3.12.10"
    $installerUrl  = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-amd64.exe"
    $installerPath = "$env:TEMP\python-$pythonVersion-amd64.exe"

    Write-Host "Downloading Python $pythonVersion installer from python.org..."
    $downloaded = Download-File -Url $installerUrl -OutputPath $installerPath

    if (-not $downloaded) {
        Write-Error "Failed to download Python installer after multiple attempts. Please install manually from https://www.python.org/downloads/"
        return
    }

    Write-Host "Installing Python $pythonVersion (machine-wide, added to PATH)..."
    $installArgs = @(
        "/quiet",
        "InstallAllUsers=1",
        "PrependPath=1",
        "Include_pip=1",
        "Include_launcher=1",
        "Include_test=0",
        "SimpleInstall=0"
    )

    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
    if ($process.ExitCode -eq 0) {
        Write-Host "Python $pythonVersion installed successfully."
    } else {
        Write-Error "Python installer exited with code $($process.ExitCode). Please install manually from https://www.python.org/downloads/"
        return
    }

    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    Refresh-Path
    Ensure-PythonInPath
}

function Ensure-PythonInPath {
    $candidateDirs = @(
        "C:\Program Files\Python312",
        "C:\Program Files\Python312\Scripts",
        "$env:LOCALAPPDATA\Programs\Python\Python312",
        "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts"
    )

    foreach ($dir in $candidateDirs) {
        if (Test-Path $dir) {
            Add-ToSystemPath -Directory $dir
        }
    }

    Refresh-Path

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    $pythonExe = if ($pythonCmd) { $pythonCmd.Source } else { $null }
    if ($pythonExe) {
        Write-Host "Python found on PATH: $pythonExe"
    } else {
        Write-Warning "python.exe not found on PATH after installation. You may need to restart your shell."
    }
}

function Install-Git {
    Write-Host ""
    Write-Host "=== Installing Git ==="

    try {
        $gitVer = & git --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Git is already installed: $gitVer"
            Ensure-GitInPath
            return
        }
    } catch { }

    Write-Host "Resolving latest Git for Windows release..."
    $installerUrl = $null

    try {
        $apiUrl   = "https://api.github.com/repos/git-for-windows/git/releases/latest"
        $headers  = @{ "User-Agent" = "PowerShell-Setup-Script" }
        $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 30
        $asset    = $response.assets | Where-Object { 
            $_.name -match "Git-[\d\.]+-64-bit\.exe" 
        } | Select-Object -First 1
        if ($asset) {
            $installerUrl = $asset.browser_download_url
            Write-Host "Latest Git version: $($response.tag_name)"
        }
    } catch {
        Write-Warning "Could not query GitHub API: $_"
    }

    if (-not $installerUrl) {
        $gitVersion   = "2.49.0"
        $installerUrl = "https://github.com/git-for-windows/git/releases/download/v$gitVersion.windows.1/Git-$gitVersion-64-bit.exe"
        Write-Host "Using fallback Git version: $gitVersion"
    }

    $installerPath = "$env:TEMP\Git-64-bit.exe"

    Write-Host "Downloading Git installer..."
    $downloaded = Download-File -Url $installerUrl -OutputPath $installerPath

    if (-not $downloaded) {
        Write-Error "Failed to download Git installer after multiple attempts. Please install manually from https://git-scm.com/download/win"
        return
    }

    Write-Host "Installing Git (added to system PATH)..."

    $installArgs = @(
        "/VERYSILENT",
        "/NORESTART",
        "/NOCANCEL",
        "/SP-",
        "/PathOption=Cmd",
        "/CRLFOption=CRLFAlways",
        "/BashTerminalOption=MinTTY",
        "/NoAutoCrlf=true"
    )

    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
    if ($process.ExitCode -eq 0) {
        Write-Host "Git installed successfully."
    } else {
        Write-Error "Git installer exited with code $($process.ExitCode). Please install manually from https://git-scm.com/download/win"
        return
    }

    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    Refresh-Path
    Ensure-GitInPath
}

function Ensure-GitInPath {
    $candidateDirs = @(
        "C:\Program Files\Git\cmd",
        "C:\Program Files\Git\bin",
        "C:\Program Files\Git\usr\bin",
        "C:\Program Files (x86)\Git\cmd",
        "C:\Program Files (x86)\Git\bin",
        "$env:LOCALAPPDATA\Programs\Git\cmd",
        "$env:LOCALAPPDATA\Programs\Git\bin"
    )

    foreach ($dir in $candidateDirs) {
        if (Test-Path $dir) {
            Add-ToSystemPath -Directory $dir
        }
    }

    Refresh-Path

    try {
        $gitVer = & git --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Git verified on PATH: $gitVer"
        } else {
            Write-Warning "Git still not found on PATH. Please open a new PowerShell window."
        }
    } catch {
        Write-Warning "Git still not found on PATH. Please open a new PowerShell window."
    }
}

function Enable-LongPaths {
    Write-Host ""
    Write-Host "=== Enabling Long Path Support ==="
    try {
        $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
        Set-ItemProperty -Path $regPath -Name "LongPathsEnabled" -Value 1 -Force
        Write-Host "Long path support enabled."
        try {
            & git config --system core.longpaths true 2>&1 | Out-Null
            Write-Host "Git long paths enabled."
        } catch { }
    } catch {
        Write-Warning "Failed to enable long path support: $_"
    }
}

# ── Entry Point ───────────────────────────────────────────────────────────────

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path (Split-Path $ScriptDir -Parent) -Parent

if (Test-Path (Join-Path $ProjectRoot ".version")) {
    $Version = Get-Content (Join-Path $ProjectRoot ".version")
    Write-Host "Detected distribution package environment (version: $Version)"
} else {
    Write-Host "Detected repository environment"
}

if (-not (Test-Administrator)) {
    Write-Host ""
    Write-Host "This script requires administrator privileges."
    Write-Host "Right-click PowerShell and select 'Run as administrator', then run this script again."
    Read-Host "Press Enter to close this window..."
    exit 1
}

$executionPolicy = Get-ExecutionPolicy
if ($executionPolicy -eq "Restricted") {
    Write-Host "Enabling PowerShell script execution..."
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
}

Enable-LongPaths
Install-Python
Install-Git

Write-Host ""
Write-Host "======================================================================="
Write-Host "System-level setup completed successfully."
Write-Host "======================================================================="
Write-Host ""

try { Write-Host "  Python : $( & python --version 2>&1 )" } catch { Write-Host "  Python : (restart shell to verify)" }
try { Write-Host "  Git    : $( & git    --version 2>&1 )" } catch { Write-Host "  Git    : (restart shell to verify)" }

Write-Host ""
Write-Host "IMPORTANT: Open a NEW PowerShell window (non-admin) so the updated"
Write-Host "           PATH is picked up, then run:"
Write-Host "-----------------------------------------------------------------------"
Write-Host "  .\install.ps1"
Write-Host "-----------------------------------------------------------------------"
Write-Host ""
Write-Host "Press Enter to close this window..."
Read-Host