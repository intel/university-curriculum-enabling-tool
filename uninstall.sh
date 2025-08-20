#!/bin/bash

# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# uninstall.sh: Uninstall the application
# This script removes all services and optionally all installed components

echo "Uninstalling the application..."

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Source local Node.js environment if it exists
NODE_ENV_SCRIPT="$SCRIPT_DIR/node_env.sh"
if [ -f "$NODE_ENV_SCRIPT" ]; then
  source "$NODE_ENV_SCRIPT"
fi

# Function to find the distribution package directory for a given persona
find_dist_package() {
  local persona="$1"
  local dist_dir="$SCRIPT_DIR/dist"
  local package_name=""
  
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
if [ -f "$SCRIPT_DIR/.version" ]; then
  # This is a distribution package
  IS_DIST_PACKAGE=true
  VERSION=$(cat "$SCRIPT_DIR/.version")
  echo "Detected distribution package environment (version: $VERSION)"
else
  echo "Detected repository environment"
  
  # Default persona is faculty if not specified
  PERSONA=${1:-faculty}
  
  # Store original repository directory
  REPO_DIR="$SCRIPT_DIR"
  
  # When running from repository, always use repository scripts
  if [ -d "$SCRIPT_DIR/.git" ]; then
    echo "Repository environment detected. Will use repository scripts for uninstallation."
    
    # Check if dist package exists (for informational purposes only)
    DIST_PACKAGE=$(find_dist_package "$PERSONA")
    
    if [ -d "$DIST_PACKAGE" ] && [ -f "$DIST_PACKAGE/.version" ]; then
      echo "Found dist package at: $DIST_PACKAGE (but will use repository scripts for uninstallation)"
    else
      echo "No valid dist package found. Will use repository scripts for uninstallation."
    fi
    
    # Keep REPO_DIR and SCRIPT_DIR pointing to the repository root
  else
    echo "ERROR: Not in a repository or dist package environment."
    echo "Please run ./install.sh $PERSONA first to create a dist package."
    exit 1
  fi
fi

# Source local Node.js environment if it exists
NODE_ENV_SCRIPT="$SCRIPT_DIR/node_env.sh"
if [ -f "$NODE_ENV_SCRIPT" ]; then
  source "$NODE_ENV_SCRIPT"
fi

# Set environment variable for utils.mjs
export IS_DIST_PACKAGE=$IS_DIST_PACKAGE

# Determine which utils.mjs to use - if we're running from repository but targeting
# a distribution package, we still want to use the utils.mjs from the repository
UTILS_SCRIPT="scripts/utils.mjs"
if [ "$IS_DIST_PACKAGE" = "false" ] && [ -n "$REPO_DIR" ]; then
  UTILS_PATH="$REPO_DIR/$UTILS_SCRIPT"
else
  UTILS_PATH="$SCRIPT_DIR/$UTILS_SCRIPT"
fi

# Try to use utils.mjs if Node.js is available
NODE_BIN="$SCRIPT_DIR/thirdparty/node/bin/node"

# First check if required modules are installed
if [ -f "$NODE_BIN" ] && [ -f "$UTILS_PATH" ]; then
  echo "Found local Node.js binary and utils.mjs script..."
  
  # Try to run the script with a simple check
  if "$NODE_BIN" -e "process.exit(0);" &>/dev/null; then
    echo "Node.js is working. Attempting to use utils.mjs to stop services..."
    # Run the actual command but suppress output unless there's an error
    "$NODE_BIN" "$UTILS_PATH" uninstall >/dev/null 2>&1 || {
      echo "Failed to run utils.mjs (missing modules like fs-extra). Skipping PM2 process management."
    }
  else
    echo "Node.js binary found but not working properly. Skipping PM2 process management."
  fi
else
  # Skip PM2 process management if utils.mjs or Node.js is not available
  echo "Local Node.js or utils.mjs not found. Skipping PM2 process management."
  echo "Please reinstall the application first if you want to properly uninstall all services."
fi

# Check if components should be removed
REMOVE_COMPONENTS=false
SKIP_TEST_LOGS=false

# Check if we should skip removing test logs
if [ -n "$SKIP_REMOVE_TEST_LOGS" ]; then
  echo "Will skip removing test logs as requested via SKIP_REMOVE_TEST_LOGS"
  SKIP_TEST_LOGS=true
fi

# Skip component removal if SKIP_REMOVE_COMPONENTS is set
if [ -n "$SKIP_REMOVE_COMPONENTS" ]; then
  echo "Skipping component removal as requested via SKIP_REMOVE_COMPONENTS"
elif [ -n "$FORCE_REMOVE_COMPONENTS" ]; then
  # Force component removal for automated testing
  echo "Forcing component removal as requested via FORCE_REMOVE_COMPONENTS"
  REMOVE_COMPONENTS=true
else
  # Ask if the user wants to remove installed components
  read -r -p "Do you want to remove all installed components? (y/n): " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    REMOVE_COMPONENTS=true
  fi
fi

# Remove components if requested
if [ "$REMOVE_COMPONENTS" = "true" ]; then
  echo "Removing installed components..."
  
  # Remove backend virtual environment
  if [ -d "backend/venv" ]; then
    echo "Removing backend virtual environment..."
    rm -rf backend/venv
  fi
  
  # Remove frontend build and node_modules
  if [ -d "frontend/.next" ]; then
    echo "Removing frontend build..."
    rm -rf frontend/.next
  fi
  
  # Remove all next-<persona> build directories in frontend folder
  if [ -d "frontend" ]; then
    for next_dir in frontend/next-*; do
      if [ -d "$next_dir" ]; then
        echo "Removing $next_dir build directory..."
        rm -rf "$next_dir"
      fi
    done
  fi
  
  if [ -d "frontend/node_modules" ]; then
    echo "Removing frontend node_modules..."
    rm -rf frontend/node_modules
  fi
  
  # Remove root node_modules directory
  if [ -d "node_modules" ]; then
    echo "Removing root node_modules..."
    rm -rf node_modules
  fi
  
  # Remove thirdparty directory (includes Node.js and Ollama)
  if [ -d "thirdparty" ]; then
    echo "Removing thirdparty directory (Node.js, Ollama, etc.)..."
    rm -rf thirdparty
  fi
  
  # Remove data directory
  if [ -d "data" ]; then
    echo "Removing data directory..."
    rm -rf data
  fi
  
  # Remove test logs directory (unless explicitly told to skip it)
  if [ -d "tests/logs" ] && [ "$SKIP_TEST_LOGS" != "true" ]; then
    echo "Removing test logs directory..."
    rm -rf tests/logs
  elif [ -d "tests/logs" ] && [ "$SKIP_TEST_LOGS" = "true" ]; then
    echo "Skipping removal of test logs directory as requested..."
  fi
  
  # Remove node_env.sh script
  if [ -f "node_env.sh" ]; then
    echo "Removing node_env.sh script..."
    rm -f node_env.sh
  fi
  
  # Remove package.json and package-lock.json
  if [ -f "package.json" ]; then
    echo "Removing package.json..."
    rm -f package.json
  fi
  
  if [ -f "package-lock.json" ]; then
    echo "Removing package-lock.json..."
    rm -f package-lock.json
  fi
  
  # Remove dist packages - make sure to use the repository directory if we're in repo mode
  if [ "$IS_DIST_PACKAGE" = "false" ] && [ -d "$REPO_DIR/dist" ]; then
    echo "Removing dist packages from repository..."
    rm -rf "$REPO_DIR/dist"
  elif [ -d "dist" ]; then
    echo "Removing dist packages..."
    rm -rf dist
  fi
  
  echo "All components removed successfully."
fi

echo "Uninstallation completed successfully"
