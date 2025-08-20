#!/bin/bash

# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# install.sh: Install application components
# This script installs application dependencies and builds the application

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
cd "$SCRIPT_DIR"  || exit 1

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
  # This is a distribution package
  IS_DIST_PACKAGE=true
  VERSION=$(cat "$SCRIPT_DIR/.version")
  echo "Detected distribution package environment (version: $VERSION)"
else
  # Check specifically for .version file to avoid false detection
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
mkdir -p thirdparty/jq
mkdir -p thirdparty/pm2
mkdir -p node_modules

# Create root .env file from template if it doesn't exist
if [ ! -f "$SCRIPT_DIR/.env" ] && [ -f "$SCRIPT_DIR/.env.template" ]; then
  echo "Creating root .env file from template..."
  cp "$SCRIPT_DIR/.env.template" "$SCRIPT_DIR/.env"
  echo "Root .env file created successfully."
elif [ ! -f "$SCRIPT_DIR/.env" ] && [ ! -f "$SCRIPT_DIR/.env.template" ]; then
  echo "Warning: No .env.template found in root directory. Skipping .env creation."
else
  echo "Root .env file already exists."
fi

# Check for local Node.js installation
NODE_DIR="$SCRIPT_DIR/thirdparty/node"
NODE_BIN="$NODE_DIR/bin/node"
NPM_BIN="$NODE_DIR/bin/npm"
# NPX_BIN="$NODE_DIR/bin/npx"

# If Node.js is not installed locally, download and install it
if [ ! -f "$NODE_BIN" ]; then
  echo "Installing Node.js locally..."
  
  # Create Node.js directory
  mkdir -p "$NODE_DIR"
  
  # Determine system architecture
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    NODE_ARCH="x64"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    NODE_ARCH="arm64"
  else
    echo "Unsupported architecture: $ARCH"
    exit 1
  fi
  
  # Download and extract Node.js
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

# If jq is not installed locally, download and install it
if [ ! -f "$JQ_BIN" ]; then
  echo "Installing jq locally..."
  
  # Create jq directory
  mkdir -p "$JQ_DIR"
  
  # Determine system architecture
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    JQ_ARCH="amd64"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    JQ_ARCH="arm64"
  else
    echo "Unsupported architecture: $ARCH"
    exit 1
  fi
  
  # Download jq
  JQ_VERSION="1.7"
  JQ_URL="https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-${JQ_ARCH}"
  
  echo "Downloading jq from $JQ_URL..."
  curl -L "$JQ_URL" -o "$JQ_BIN"
  
  # Make jq executable
  chmod +x "$JQ_BIN"
  
  echo "jq installed locally at $JQ_BIN"
fi

# Add Node.js to PATH so npm can find it
export PATH="$NODE_DIR/bin:$PATH"

# Install necessary dependencies based on environment
if [ "$IS_DIST_PACKAGE" = false ]; then
  # Repository environment - install all dependencies and build from source
  echo "Installing for repository environment..."
  
  # Create a package.json for script dependencies if it doesn't exist
  if [ ! -f "$SCRIPT_DIR/package.json" ]; then
    echo "Creating package.json for script dependencies..."
    echo '{
  "name": "ci-scripts",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0",
    "pm2": "^6.0.8"
  }
}' > "$SCRIPT_DIR/package.json"
  fi

  # Install script dependencies if needed or forced
  if [ "$FORCE_FLAG" == "--force" ] || [ ! -d "$SCRIPT_DIR/node_modules" ] || [ ! -d "$SCRIPT_DIR/node_modules/fs-extra" ]; then
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

    # Generate a random secret for Payload CMS
    echo "Generating Payload CMS secret"
    PAYLOAD_SECRET=$(openssl rand -base64 32)
    # Set PAYLOAD_SECRET only if it is empty
    sed -i "/^PAYLOAD_SECRET=$/c\PAYLOAD_SECRET=\"$PAYLOAD_SECRET\"" .env

    echo "Frontend .env file created successfully."
  elif [ ! -f ".env" ] && [ ! -f ".env.template" ]; then
    echo "Warning: No .env.template found in frontend directory. Skipping .env creation."
  else
    # If .env exists and PAYLOAD_SECRET is empty, update it
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
    # Add Node.js bin, jq, and PM2 to local path file for other scripts in development mode
    echo "Creating node_env.sh script for development mode..."
    echo "#!/bin/bash
export PATH=\"$NODE_DIR/bin:$JQ_DIR:$SCRIPT_DIR/node_modules/.bin:\$PATH\"
export THIRDPARTY_DIR=\"$SCRIPT_DIR/thirdparty\"
export IS_DIST_PACKAGE=false
export DEV_MODE=true
" > "$SCRIPT_DIR/node_env.sh"
    chmod +x "$SCRIPT_DIR/node_env.sh"
    echo "node_env.sh created successfully at: $SCRIPT_DIR/node_env.sh"
    
    # Source the environment file to ensure paths are available for setup scripts
    source "$SCRIPT_DIR/node_env.sh"
    
    # Setup backend environment - ensure we're in the root directory
    cd "$SCRIPT_DIR" || exit 1
    "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG
    
    # Setup Ollama - ensure we're in the root directory
    cd "$SCRIPT_DIR" || exit 1
    "$NODE_BIN" scripts/utils.mjs setup-ollama

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
  fi

  # If we're running from the root repo, always build the application
  if [ "$IS_ROOT_REPO" = true ]; then
    # Build the application
    echo "Building the application for persona: $PERSONA..."
    "$NODE_BIN" scripts/utils.mjs build $PERSONA $FORCE_FLAG
    
    # Always create or update the dist package when run from repository
    echo "Creating/updating distribution package..."
    DIST_DIR="$SCRIPT_DIR/dist"
    
    echo "Creating distribution package for persona: $PERSONA..."
    # Run the create-package command
    "$NODE_BIN" scripts/utils.mjs create-package $PERSONA $FORCE_FLAG
    
    # Try to find the distribution package after creation
    # We need to directly find the package since we just created it
    DIST_DIR="$SCRIPT_DIR/dist"
    if [ "$PERSONA" = "faculty" ]; then
      # For faculty persona, find directories that don't end with persona names
      DIST_PACKAGE=$(find "$DIST_DIR" -maxdepth 1 -type d \
        ! -name "*-lecturer" ! -name "*-student" ! -name "dist" | 
        sort -n -t _ -k 2 | tail -n 1)
    else
      # For other personas, find directories that end with the persona name
      DIST_PACKAGE=$(find "$DIST_DIR" -maxdepth 1 -type d -name "*-$PERSONA" | 
        sort -n -t _ -k 2 | tail -n 1)
    fi
    
    # Check if we found a valid distribution package
    if [ -z "$DIST_PACKAGE" ] || [ ! -f "$DIST_PACKAGE/.version" ]; then
      echo "ERROR: Failed to create or locate distribution package for persona: $PERSONA"
      exit 1
    fi
    
    echo "Distribution package created successfully at: $DIST_PACKAGE"
    
    # When running from root repo, we don't need to set up backend/ollama dependencies
    # They will be set up when the distribution package is installed
    echo "Distribution package created. Backend and Ollama setup will be performed when the package is installed."
    
    # Add Node.js bin, jq, and PM2 to local path file for other scripts in dist package
    echo "Creating node_env.sh script for distribution package..."
    echo "#!/bin/bash
export PATH=\"$DIST_PACKAGE/thirdparty/node/bin:$DIST_PACKAGE/thirdparty/jq:$DIST_PACKAGE/node_modules/.bin:\$PATH\"
export THIRDPARTY_DIR=\"$DIST_PACKAGE/thirdparty\"
export IS_DIST_PACKAGE=true
export DEV_MODE=false
" > "$DIST_PACKAGE/node_env.sh"
    chmod +x "$DIST_PACKAGE/node_env.sh"
    echo "node_env.sh created successfully at: $DIST_PACKAGE/node_env.sh"
        
    echo ""
    echo "To continue installation on this system, run the following commands:"
    echo "-----------------------------------------------------------------------"
    echo "cd \"$DIST_PACKAGE\""
    echo "./install.sh"
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
    # For non-root repository environments without a distribution marker,
    # check for an existing distribution package and use that if available
    if [ "$IS_DIST_PACKAGE" = false ]; then
      DIST_PACKAGE=$(find_dist_package "$PERSONA")
      if [ -n "$DIST_PACKAGE" ] && [ -f "$DIST_PACKAGE/.version" ]; then
        echo "Found existing distribution package at: $DIST_PACKAGE"
        echo "Running install.sh from distribution package..."
        cd "$DIST_PACKAGE" || exit 1
        # Do not recursively call install.sh from the dist package
        # Instead, set IS_DIST_PACKAGE=true and continue with setup
        IS_DIST_PACKAGE=true
      else
        # For non-root repository, set up backend and Ollama
        if [ "$IS_ROOT_REPO" = false ]; then
          echo "Setting up backend and Ollama for non-root repository..."
          
          # Setup backend environment
          echo "Setting up backend environment..."
          "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG
          
          # Setup Ollama
          echo "Setting up Ollama..."
          "$NODE_BIN" scripts/utils.mjs setup-ollama
        else
          echo "Skipping backend and Ollama setup in root repository (not in dev mode)."
        fi
      fi
    fi
  fi
else
  # Distribution package environment - already built, just install runtime dependencies
  echo "Installing for distribution package environment..."
  
  # Create a minimal package.json for runtime dependencies if it doesn't exist
  if [ ! -f "$SCRIPT_DIR/package.json" ]; then
    echo "Creating package.json for runtime dependencies..."
    echo '{
  "name": "ci-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "fs-extra": "^11.3.0",
    "archiver": "^7.0.1",
    "commander": "^14.0.0",
    "pm2": "^6.0.8"
  }
}' > "$SCRIPT_DIR/package.json"
  fi
  
  # Install minimal runtime dependencies if needed or forced
  if [ "$FORCE_FLAG" == "--force" ] || [ ! -d "$SCRIPT_DIR/node_modules" ] || [ ! -d "$SCRIPT_DIR/node_modules/fs-extra" ]; then
    echo "Installing runtime dependencies..."
    "$NPM_BIN" install --no-progress --no-color
  else
    echo "Runtime dependencies already installed. Use --force to reinstall."
  fi
  
  # Setup backend environment
  echo "Setting up backend environment..."
  "$NODE_BIN" scripts/utils.mjs setup-backend $FORCE_FLAG
  
  # Setup Ollama
  echo "Setting up Ollama..."
  "$NODE_BIN" scripts/utils.mjs setup-ollama
  
  # Add Node.js bin, jq, and PM2 to local path file for other scripts
  echo "Creating node_env.sh script for distribution package environment..."
  echo "#!/bin/bash
export PATH=\"$NODE_DIR/bin:$JQ_DIR:$SCRIPT_DIR/node_modules/.bin:\$PATH\"
export THIRDPARTY_DIR=\"$SCRIPT_DIR/thirdparty\"
export IS_DIST_PACKAGE=true
export DEV_MODE=false
" > "$SCRIPT_DIR/node_env.sh"
  chmod +x "$SCRIPT_DIR/node_env.sh"
  echo "node_env.sh created successfully at: $SCRIPT_DIR/node_env.sh"

  echo "Distribution package environment setup completed."
fi

echo "Installation completed successfully"
echo ""
echo "To start the application, run the following command:"
echo "-----------------------------------------------------------------------"
echo "./run.sh"
echo ""
