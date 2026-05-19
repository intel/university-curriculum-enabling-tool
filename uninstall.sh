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
    package_name=$(find "$dist_dir" -maxdepth 1 -type d \
      ! -name "*-lecturer" ! -name "*-student" ! -name "dist" |
      sort -n -t _ -k 2 | tail -n 1)
  else
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
  IS_DIST_PACKAGE=true
  VERSION=$(cat "$SCRIPT_DIR/.version")
  echo "Detected distribution package environment (version: $VERSION)"
else
  echo "Detected repository environment"

  PERSONA=${1:-faculty}
  REPO_DIR="$SCRIPT_DIR"

  if [ -d "$SCRIPT_DIR/.git" ]; then
    echo "Repository environment detected. Will use repository scripts for uninstallation."

    DIST_PACKAGE=$(find_dist_package "$PERSONA")

    if [ -d "$DIST_PACKAGE" ] && [ -f "$DIST_PACKAGE/.version" ]; then
      echo "Found dist package at: $DIST_PACKAGE (but will use repository scripts for uninstallation)"
    else
      echo "No valid dist package found. Will use repository scripts for uninstallation."
    fi
  else
    echo "ERROR: Not in a repository or dist package environment."
    echo "Please run ./install.sh $PERSONA first to create a dist package."
    exit 1
  fi
fi

# Export environment variable for utils.mjs
export IS_DIST_PACKAGE=$IS_DIST_PACKAGE

# Determine which utils.mjs to use
UTILS_SCRIPT="scripts/utils.mjs"
if [ "$IS_DIST_PACKAGE" = "false" ] && [ -n "$REPO_DIR" ]; then
  UTILS_PATH="$REPO_DIR/$UTILS_SCRIPT"
else
  UTILS_PATH="$SCRIPT_DIR/$UTILS_SCRIPT"
fi

# Try to use utils.mjs to stop all managed processes before removing files
NODE_BIN="$SCRIPT_DIR/thirdparty/node/bin/node"

if [ -f "$NODE_BIN" ] && [ -f "$UTILS_PATH" ]; then
  echo "Found local Node.js binary and utils.mjs script..."

  if "$NODE_BIN" -e "process.exit(0);" &>/dev/null; then
    echo "Node.js is working. Attempting to stop all managed processes..."

    "$NODE_BIN" "$UTILS_PATH" stop faculty --force 2>&1 || {
      echo "Warning: Could not stop managed processes via process manager."
      echo "         They may have already been stopped or never started."
    }
  else
    echo "Node.js binary found but not working properly."
    echo "Skipping managed process shutdown - processes may still be running."
  fi
else
  echo "Local Node.js or utils.mjs not found."
  echo "Skipping managed process shutdown - processes may still be running."
  echo "If any services are still running, stop them manually."
fi

# Check if components should be removed
REMOVE_COMPONENTS=false
SKIP_TEST_LOGS=false

if [ -n "$SKIP_REMOVE_TEST_LOGS" ]; then
  echo "Will skip removing test logs as requested via SKIP_REMOVE_TEST_LOGS"
  SKIP_TEST_LOGS=true
fi

if [ -n "$SKIP_REMOVE_COMPONENTS" ]; then
  echo "Skipping component removal as requested via SKIP_REMOVE_COMPONENTS"
elif [ -n "$FORCE_REMOVE_COMPONENTS" ]; then
  echo "Forcing component removal as requested via FORCE_REMOVE_COMPONENTS"
  REMOVE_COMPONENTS=true
else
  read -r -p "Do you want to remove all installed components? (y/n): " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    REMOVE_COMPONENTS=true
  fi
fi

if [ "$REMOVE_COMPONENTS" = "true" ]; then
  echo "Removing installed components..."

  # Remove backend virtual environment
  if [ -d "backend/venv" ]; then
    echo "Removing backend virtual environment..."
    rm -rf backend/venv
  fi

  # Remove backend virtual environment for ovms service
  if [ -d "backend/ovms_service/venv" ]; then
    echo "Removing backend virtual environment for ovms service..."
    rm -rf backend/ovms_service/venv
  fi

  # Remove frontend build
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

  # Remove frontend node_modules
  if [ -d "frontend/node_modules" ]; then
    echo "Removing frontend node_modules..."
    rm -rf frontend/node_modules
  fi

  # Remove root node_modules
  if [ -d "node_modules" ]; then
    echo "Removing root node_modules..."
    rm -rf node_modules
  fi

  # Remove thirdparty directory (Node.js, Ollama, OVMS, jq)
  if [ -d "thirdparty" ]; then
    echo "Removing thirdparty directory (Node.js, Ollama, OVMS, jq, etc.)..."
    rm -rf thirdparty
  fi

  if [ -d ".process-manager" ]; then
    echo "Removing process manager state directory (.process-manager)..."
    rm -rf .process-manager
  fi

  # Remove data directory
  if [ -d "data" ]; then
    echo "Removing data directory..."
    rm -rf data
  fi

  # Remove test logs directory (unless explicitly told to skip)
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

  # Remove dist packages
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