#!/bin/bash

# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# install.sh: Install application components
# This script installs application dependencies and builds the application

# Prompt user to choose between Ollama and OVMS installation, or use PROVIDER env var
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$SCRIPT_DIR/thirdparty/node/bin/node"

# Prompt for PROVIDER if not set
if [ -z "$PROVIDER" ]; then
  echo "Which backend do you want to install?"
  echo "  [1] Ollama (default)"
  echo -e "\e[2m  [2] OVMS Not Available For Now\e[0m"
  if ! read -r -t 15 -p "Enter 1 for Ollama: " SERVICE_CHOICE; then
    echo -e "\nNo response after 15 seconds. Defaulting to Ollama."
    SERVICE_CHOICE=""
  fi
  case "$SERVICE_CHOICE" in
    2|ovms|OVMS)
      PROVIDER=ovms
      ;;
    ""|1|ollama|OLLAMA)
      PROVIDER=ollama
      ;;
    *)
      echo "Invalid selection. Defaulting to Ollama."
      PROVIDER=ollama
      ;;
  esac
fi

if [ -n "$PROVIDER" ]; then
  if [ "$PROVIDER" = "ovms" ]; then
    echo "PROVIDER=ovms detected. Installing OVMS..."
    INSTALL_SERVICE=setup-ovms
  elif [ "$PROVIDER" = "ollama" ]; then
    echo "PROVIDER=ollama detected. Installing Ollama..."
    INSTALL_SERVICE=setup-ollama
  else
    echo "Unknown PROVIDER value: $PROVIDER. Supported: ollama, ovms."
    exit 1
  fi
fi

echo "Installing application components..."

# Default persona is faculty if not specified
PERSONA=${1:-faculty}
FORCE_FLAG=""

# Check if force flag is provided
if [ "$2" == "--force" ]; then
  FORCE_FLAG="--force"
fi

# Check for development mode environment variable
DEV_MODE=${DEV_MODE:-false}
if [ "$DEV_MODE" == "true" ]; then
  echo "Development mode enabled - installing minimal dependencies for development"
fi

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Function to find the dist package directory for a given persona
find_dist_package() {
  local persona="$1"
  local dist_dir="$SCRIPT_DIR/dist"
  local package_name=""

  # If we're running from the root repository and it's explicitly specified,
  # we shouldn't use any existing distribution package
  if [ "$IS_ROOT_REPO" = true ] && [ "$2" = "--from-root" ]; then
    return 1
  fi

  if [ ! -d "$dist_dir" ]; then
    return 1
  fi

  if [ "$persona" = "faculty" ]; then
    # For faculty persona, find directories that don't end with persona names
    package_name=$(find "$dist_dir" -maxdepth 1 -type d \
      ! -name "*-lecturer" ! -name "*-student" ! -name "dist" |
      sort -n -t _ -k 2 | tail -n 1)
  else
    # For other personas, find directories that end with the persona name
    package_name=$(find "$dist_dir" -maxdepth 1 -type d -name "*-$persona" |
      sort -n -t _ -k 2 | tail -n 1)
  fi

  if [ -n "$package_name" ] && [ -f "$package_name/.version" ]; then
    echo "$package_name"
    return 0
  else
    return 1
  fi
}

# Detect environment - repository or distribution package
IS_DIST_PACKAGE=false
IS_ROOT_REPO=false

# Check if this is the root repository by looking for specific development directories
if [ -d "$SCRIPT_DIR/frontend/src" ]; then
  IS_ROOT_REPO=true
  echo "Detected root repository environment"
fi

# Check if this is a distribution package by looking for the .version file
if [ -f "$SCRIPT_DIR/.version" ]; then
  IS_DIST_PACKAGE=true
  VERSION=$(cat "$SCRIPT_DIR/.version")
  echo "Detected distribution package environment (version: $VERSION)"
else
  if [ -d "$SCRIPT_DIR/thirdparty/node" ] && [ ! -f "$SCRIPT_DIR/.version" ]; then
    echo "Detected repository environment (with Node.js installed)"
  else
    echo "Detected repository environment"
  fi
fi

# Create directory structure

mkdir -p scripts
mkdir -p thirdparty/node
mkdir -p thirdparty/ollama
mkdir -p thirdparty/ovms
mkdir -p thirdparty/jq


# Create or update root .env file
if [ ! -f "$SCRIPT_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env.template" ]; then
  echo "Creating root .env file from template..."
  cp "$SCRIPT_DIR/.env.template" "$SCRIPT_DIR/.env"
  echo "Root .env file created successfully."
fi

# Always update PROVIDER in .env to match current PROVIDER value
if [ -f "$SCRIPT_DIR/.env" ]; then
  if grep -q '^PROVIDER=' "$SCRIPT_DIR/.env"; then
    sed -i "s/^PROVIDER=.*/PROVIDER=$PROVIDER                 # AI model server (ollama or ovms)/" "$SCRIPT_DIR/.env"
    echo "Updated PROVIDER in .env to: $PROVIDER"
  else
    echo "PROVIDER=$PROVIDER                 # AI model server (ollama or ovms)" >> "$SCRIPT_DIR/.env"
    echo "Appended PROVIDER to .env: $PROVIDER"
  fi
else
  echo "Warning: .env file not found, PROVIDER not set."
fi

# Check for local Node.js installation
NODE_DIR="$SCRIPT_DIR/thirdparty/node"
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"

# If Node.js is not installed locally, download and install it
if [ ! -f "$NODE_BIN" ]; then
  echo "Installing Node.js locally..."

  mkdir -p "$NODE_DIR"

  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    NODE_ARCH="x64"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    NODE_ARCH="arm64"
  else
    echo "Unsupported architecture: $ARCH"
    exit 1
  fi

  NODE_VERSION="22.16.0"
  NODE_TARBALL="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.gz"
  NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL"

  echo "Downloading Node.js from $NODE_URL..."
  curl -L "$NODE_URL" -o "/tmp/$NODE_TARBALL"

  echo "Extracting Node.js..."
  tar -xzf "/tmp/$NODE_TARBALL" -C "/tmp"
  cp -r "/tmp/node-v$NODE_VERSION-linux-$NODE_ARCH"/* "$NODE_DIR"
  rm -f "/tmp/$NODE_TARBALL"

  echo "Node.js installed locally at $NODE_DIR"
fi

# Check for local jq installation
JQ_DIR="$SCRIPT_DIR/thirdparty/jq"
JQ_BIN="$JQ_DIR/jq"

if [ ! -f "$JQ_BIN" ]; then
  echo "Installing jq locally..."

  mkdir -p "$JQ_DIR"

  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    JQ_ARCH="amd64"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    JQ_ARCH="arm64"
  else
    echo "Unsupported architecture: $ARCH"
    exit 1
  fi

  JQ_VERSION="1.7"
  JQ_URL="https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-${JQ_ARCH}"

  echo "Downloading jq from $JQ_URL..."
  curl -L "$JQ_URL" -o "$JQ_BIN"

  chmod +x "$JQ_BIN"

  echo "jq installed locally at $JQ_BIN"
fi

# Global variable to track GPU compatibility status
GPU_COMPATIBLE=false

check_gpu_compatibility() {
  echo ""
  echo "Checking system GPU compatibility..."

  local GPU_OK=false
  CPU_MODEL=$(lscpu | grep "Model name" | awk -F: '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')

  if echo "$CPU_MODEL" | grep -iq "Core.*Ultra"; then
    echo "Detected Core Ultra CPU ($CPU_MODEL) — iGPU supported."
    GPU_OK=true
  else
    DGPU_LINE=$(lspci -nn 2>/dev/null | grep -Ei 'VGA|DISPLAY' | grep -E '8086' | grep -v '00:02.0')
    if [ -n "$DGPU_LINE" ]; then
      echo "Intel discrete GPU detected:"
      echo "   $DGPU_LINE"
      GPU_OK=true
    else
      echo "Warning: No compatible Intel GPU detected."
      GPU_OK=false
    fi
  fi

  GPU_COMPATIBLE=$GPU_OK

  if [ "$GPU_OK" = true ]; then
    return 0
  else
    return 1
  fi
}

# Run GPU compatibility check
check_gpu_compatibility

# Add Node.js to PATH so npm can find it
export PATH="$NODE_DIR/bin:$PATH"

write_scripts_package_json() {
  local target="$1"
  cat > "$target" <<'EOF'
{
  "name": "ci-scripts",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0"
  }
}
EOF
}

write_runtime_package_json() {
  local target="$1"
  cat > "$target" <<'EOF'
{
  "name": "ci-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0"
  }
}
EOF
}
# ─────────────────────────────────────────────────────────────────────────────

# ── Shared helper: ensure python3-venv is available ──────────────────────────
ensure_python_venv() {
  echo "Checking Python venv support..."
  if ! python3 -m ensurepip --version &>/dev/null 2>&1; then
    echo "python3-venv not found. Installing required Python packages..."
    if command -v apt-get &>/dev/null; then
      if ! sudo apt-get install -y python3-venv python3-pip; then
        echo "ERROR: Failed to install python3-venv. Please run manually:"
        echo "  sudo apt-get install -y python3-venv python3-pip"
        exit 1
      fi
      echo "python3-venv installed successfully."
    else
      echo "ERROR: apt-get not found. Please install python3-venv manually."
      echo "  On Debian/Ubuntu: sudo apt-get install -y python3-venv python3-pip"
      exit 1
    fi
  else
    echo "Python venv support confirmed."
  fi
}
# ─────────────────────────────────────────────────────────────────────────────

# Install necessary dependencies based on environment
if [ "$IS_DIST_PACKAGE" = false ]; then
  # Repository environment - install all dependencies and build from source
  echo "Installing for repository environment..."

  if [ ! -f "$SCRIPT_DIR/package.json" ] || grep -q '"pm2"' "$SCRIPT_DIR/package.json"; then
    echo "Creating package.json for script dependencies ..."
    write_scripts_package_json "$SCRIPT_DIR/package.json"
  fi

  # Install script dependencies if needed or forced
  if [ "$FORCE_FLAG" == "--force" ] || \
     [ ! -d "$SCRIPT_DIR/node_modules" ] || \
     [ ! -d "$SCRIPT_DIR/node_modules/fs-extra" ]; then
    echo "Installing script dependencies..."
    "$NPM_BIN" install --no-progress --no-color
  else
    echo "Script dependencies already installed. Use --force to reinstall."
  fi

  # Install frontend dependencies if needed or forced
  cd frontend || exit 1
  if [ "$FORCE_FLAG" == "--force" ] || [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    "$NPM_BIN" install --no-progress --no-color
  else
    echo "Frontend dependencies already installed. Use --force to reinstall."
  fi

  # Create .env file from .env.template if it doesn't exist
  if [ ! -f ".env" ] && [ -f ".env.template" ]; then
    echo "Creating frontend/.env file from template..."
    cp .env.template .env

    echo "Generating Payload CMS secret"
    PAYLOAD_SECRET=$(openssl rand -base64 32)
    sed -i "/^PAYLOAD_SECRET=$/c\PAYLOAD_SECRET=\"$PAYLOAD_SECRET\"" .env

    echo "Frontend .env file created successfully."
  elif [ ! -f ".env" ] && [ ! -f ".env.template" ]; then
    echo "Warning: No .env.template found in frontend directory. Skipping .env creation."
  else
    if grep -q "^PAYLOAD_SECRET=$" .env; then
      echo "Updating PAYLOAD_SECRET in existing frontend .env file"
      PAYLOAD_SECRET=$(openssl rand -base64 32)
      sed -i "/^PAYLOAD_SECRET=$/c\PAYLOAD_SECRET=\"$PAYLOAD_SECRET\"" .env
      echo "Updated PAYLOAD_SECRET in existing frontend .env file."
    else
      echo "Frontend .env file already exists and PAYLOAD_SECRET is set."
    fi
  fi

  cd .. || exit 1

  # Skip build and distribution package creation in development mode
  if [ "$DEV_MODE" == "true" ]; then
    echo "Creating node_env.sh script for development mode..."
    cat > "$SCRIPT_DIR/node_env.sh" <<EOF
#!/bin/bash
export PATH="$NODE_DIR/bin:$JQ_DIR:\$PATH"
export THIRDPARTY_DIR="$SCRIPT_DIR/thirdparty"
export IS_DIST_PACKAGE=false
export DEV_MODE=true
export PROVIDER="$PROVIDER"
EOF
    chmod +x "$SCRIPT_DIR/node_env.sh"
    echo "node_env.sh created successfully at: $SCRIPT_DIR/node_env.sh"

    # Source the environment file to ensure paths are available for setup scripts
    source "$SCRIPT_DIR/node_env.sh"

    ensure_python_venv

    # Setup backend environment
    cd "$SCRIPT_DIR" || exit 1
    "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG

    # Setup Ollama or OVMS
    cd "$SCRIPT_DIR" || exit 1
    "$NODE_BIN" scripts/utils.mjs "$INSTALL_SERVICE"

    if [ "$INSTALL_SERVICE" = "setup-ollama" ]; then
      echo "Development environment installation completed."
      echo ""
      echo "To start development:"
      echo "1. Start Ollama with required environment variables:"
      echo "   cd thirdparty/ollama"
      echo "   source ../../.env"
      echo "   ./ollama serve"
      echo "2. In one terminal - Start frontend: cd frontend && npm run dev"
      echo "3. In another terminal - Start backend: cd backend && python main.py --debug"
      exit 0
    else
      echo "Development environment installation completed."
      echo ""
      echo "To start development with OVMS:"
      echo "1. Start OVMS with required environment variables:"
      echo "   cd backend/ovms_service"
      echo "   source venv/bin/activate"
      echo "   python ovms_start.py"
      echo "2. In one terminal - Start frontend: cd frontend && npm run dev"
      echo "3. In another terminal - Start backend: cd backend && python main.py --debug"
      exit 0
    fi
  fi

  # If we're running from the root repo, always build the application
  if [ "$IS_ROOT_REPO" = true ]; then

    echo "Running database migrations before build..."
    cd "$SCRIPT_DIR/frontend" || exit 1
    if ! "$NPM_BIN" run migrate; then
      echo "ERROR: Database migration failed. Aborting build."
      exit 1
    fi
    echo "Database migration completed successfully."
    cd "$SCRIPT_DIR" || exit 1
    # ─────────────────────────────────────────────────────────────────────────

    echo "Building the application for persona: $PERSONA..."
    "$NODE_BIN" scripts/utils.mjs build $PERSONA $FORCE_FLAG

    echo "Creating/updating distribution package..."

    echo "Creating distribution package for persona: $PERSONA..."
    "$NODE_BIN" scripts/utils.mjs create-package $PERSONA $FORCE_FLAG

    DIST_DIR="$SCRIPT_DIR/dist"
    if [ "$PERSONA" = "faculty" ]; then
      DIST_PACKAGE=$(find "$DIST_DIR" -maxdepth 1 -type d \
        ! -name "*-lecturer" ! -name "*-student" ! -name "dist" |
        sort -n -t _ -k 2 | tail -n 1)
    else
      DIST_PACKAGE=$(find "$DIST_DIR" -maxdepth 1 -type d -name "*-$PERSONA" |
        sort -n -t _ -k 2 | tail -n 1)
    fi

    if [ -z "$DIST_PACKAGE" ] || [ ! -f "$DIST_PACKAGE/.version" ]; then
      echo "ERROR: Failed to create or locate distribution package for persona: $PERSONA"
      exit 1
    fi

    echo "Distribution package created successfully at: $DIST_PACKAGE"
    echo "Distribution package created. Backend and Ollama setup will be performed when the package is installed."

    echo "Creating node_env.sh script for distribution package..."
    cat > "$DIST_PACKAGE/node_env.sh" <<EOF
#!/bin/bash
export PATH="$DIST_PACKAGE/thirdparty/node/bin:$DIST_PACKAGE/thirdparty/jq:\$PATH"
export THIRDPARTY_DIR="$DIST_PACKAGE/thirdparty"
export IS_DIST_PACKAGE=true
export DEV_MODE=false
export PROVIDER="$PROVIDER"
EOF
    chmod +x "$DIST_PACKAGE/node_env.sh"
    echo "node_env.sh created successfully at: $DIST_PACKAGE/node_env.sh"
    echo ""
    echo "To continue installation on this system, run the following commands:"
    echo "-----------------------------------------------------------------------"
    echo "cd \"$DIST_PACKAGE\""
    echo "PROVIDER=$PROVIDER ./install.sh"
    echo ""
    echo ""
    echo "Or, if you want to install this distribution package on another system:"
    echo "-----------------------------------------------------------------------"
    echo "1. Copy or extract \"$DIST_PACKAGE.zip\" to your target location"
    echo "2. Run setup.sh in the extracted directory:"
    echo "cd <your-target-directory>"
    echo "sudo ./setup.sh"
    echo ""
    exit 0
  else
    if [ "$IS_DIST_PACKAGE" = false ]; then
      DIST_PACKAGE=$(find_dist_package "$PERSONA")
      if [ -n "$DIST_PACKAGE" ] && [ -f "$DIST_PACKAGE/.version" ]; then
        echo "Found existing distribution package at: $DIST_PACKAGE"
        echo "Running install.sh from distribution package..."
        cd "$DIST_PACKAGE" || exit 1
        IS_DIST_PACKAGE=true
      else
        if [ "$IS_ROOT_REPO" = false ]; then
          echo "Setting up backend and Ollama for non-root repository..."

          ensure_python_venv

          echo "Setting up backend environment..."
          "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG

          echo "Setting up $INSTALL_SERVICE..."
          "$NODE_BIN" scripts/utils.mjs "$INSTALL_SERVICE"
        else
          echo "Skipping backend and Ollama setup in root repository (not in dev mode)."
        fi
      fi
    fi
  fi
else
  # Distribution package environment - already built, just install runtime dependencies
  echo "Installing for distribution package environment..."

  if [ ! -f "$SCRIPT_DIR/package.json" ] || grep -q '"pm2"' "$SCRIPT_DIR/package.json"; then
    echo "Creating package.json for runtime dependencies ..."
    write_runtime_package_json "$SCRIPT_DIR/package.json"
  fi

  # Install minimal runtime dependencies if needed or forced
  if [ "$FORCE_FLAG" == "--force" ] || \
     [ ! -d "$SCRIPT_DIR/node_modules" ] || \
     [ ! -d "$SCRIPT_DIR/node_modules/fs-extra" ]; then
    echo "Installing runtime dependencies..."
    "$NPM_BIN" install --no-progress --no-color
  else
    echo "Runtime dependencies already installed. Use --force to reinstall."
  fi

  ensure_python_venv
  # ─────────────────────────────────────────────────────────────────────────

  # Setup backend environment
  echo "Setting up backend environment..."
  "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG

  # Setup Ollama or OVMS
  echo "Setting up $INSTALL_SERVICE..."
  "$NODE_BIN" scripts/utils.mjs "$INSTALL_SERVICE"

  echo "Creating node_env.sh script for distribution package environment..."
  cat > "$SCRIPT_DIR/node_env.sh" <<EOF
#!/bin/bash
export PATH="$NODE_DIR/bin:$JQ_DIR:\$PATH"
export THIRDPARTY_DIR="$SCRIPT_DIR/thirdparty"
export IS_DIST_PACKAGE=true
export DEV_MODE=false
export PROVIDER="$PROVIDER"
EOF
  chmod +x "$SCRIPT_DIR/node_env.sh"
  echo "node_env.sh created successfully at: $SCRIPT_DIR/node_env.sh"

  echo "Distribution package environment setup completed."
fi

echo "Installation completed successfully"
echo ""

if [ "$GPU_COMPATIBLE" = false ]; then
  echo "-----------------------------------------------------------------------"
  echo "Warning: You have no compatible Intel GPU detected."
  echo "         You should navigate to settings page to configure to use external AI Provider server"
  echo "-----------------------------------------------------------------------"
  echo ""
fi

echo "To start the application, run the following command:"
echo "-----------------------------------------------------------------------"
echo "./run.sh"
echo ""