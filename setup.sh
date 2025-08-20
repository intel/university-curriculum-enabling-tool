#!/bin/bash

# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# setup.sh: System-level setup (requires sudo privileges)
# This script installs system dependencies required for the application
# It handles ONLY dependencies that require root/sudo privileges
# User-level dependencies are handled by install.sh

echo "Setting up system-level dependencies (requires sudo)..."

install_packages(){
    local PACKAGES=("$@")
    local INSTALL_REQUIRED=0
    for PACKAGE in "${PACKAGES[@]}"; do
        INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PACKAGE" 2>/dev/null || true)
        LATEST_VERSION=$(apt-cache policy "$PACKAGE" | grep Candidate | awk '{print $2}')
        
        if [ -z "$INSTALLED_VERSION" ] || [ "$INSTALLED_VERSION" != "$LATEST_VERSION" ]; then
            echo "$PACKAGE is not installed or not the latest version."
            INSTALL_REQUIRED=1
        fi
    done
    if [ $INSTALL_REQUIRED -eq 1 ]; then
        apt update
        apt install -y "${PACKAGES[@]}"
    fi
}

verify_dependencies(){
    echo -e "# Verifying dependencies"
    DEPENDENCIES_PACKAGES=(
        python3
        python3-pip
        python3-venv
        python3-dev
        curl
    )
    install_packages "${DEPENDENCIES_PACKAGES[@]}"
    echo "$S_VALID Dependencies installed"
}

# Detect environment - repository or distribution package
if [ -f "$(pwd)/.version" ]; then
  # This is a distribution package
  VERSION=$(cat "$(pwd)/.version")
  echo "Detected distribution package environment (version: $VERSION)"
else
  echo "Detected repository environment"
fi

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "This script requires sudo privileges. Please run with sudo."
  exit 1
fi

verify_dependencies

# Note: Node.js is now installed locally by the install.sh script
echo "System-level setup completed successfully."
echo ""
echo "To complete the installation, run the following command (without sudo):"
echo "-----------------------------------------------------------------------"
echo "./install.sh"
echo ""
