#!/bin/bash

# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

# run.sh: Start the application
# This script starts all services required for the application

echo "Starting the application..."

# Default persona is faculty if not specified
PERSONA=${1:-faculty}

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Source local Node.js environment if it exists
NODE_ENV_SCRIPT="$SCRIPT_DIR/node_env.sh"
if [ -f "$NODE_ENV_SCRIPT" ]; then
  source "$NODE_ENV_SCRIPT"
else
  echo "Error: node_env.sh not found. Please run the install script first."
  exit 1
fi

# Use local Node.js
NODE_BIN="$SCRIPT_DIR/thirdparty/node/bin/node"

check_gpu_compatibility() {
  echo ""
  echo "Checking system GPU compatibility..."

  local GPU_OK=false
  CPU_MODEL=$(lscpu | grep "Model name" | awk -F: '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')

  # Detect Intel Core Ultra (iGPU)
  if echo "$CPU_MODEL" | grep -iq "Core.*Ultra"; then
    echo "Detected Core Ultra CPU ($CPU_MODEL) — iGPU supported."
    GPU_OK=true
  else
    # Detect Intel discrete GPU
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

  # Return 0 if GPU is OK, 1 if not
  if [ "$GPU_OK" = true ]; then
    return 0
  else
    return 1
  fi
}

# Check GPU compatibility
if check_gpu_compatibility; then
  # GPU is compatible - start all services normally
  if [ -f "$NODE_BIN" ]; then
    "$NODE_BIN" scripts/utils.mjs start $PERSONA
  else
    echo "Error: Local Node.js installation not found. Please run the install script first."
    exit 1
  fi
else
  # GPU is NOT compatible - prompt user
  echo ""
  echo "Your GPU may not be compatible to run AI Provider services."
  echo "Choose an option:"
  echo "  [y] Start all services anyway (may fail)"
  echo "  [n] Start only frontend and backend (configure external AI Provider in Settings page)"
  echo ""
  read -r -p "Your choice (y/n): " PROCEED_ANYWAY
  if [[ "$PROCEED_ANYWAY" =~ ^[Yy]$ ]]; then
    # Use local Node.js
    if [ -f "$NODE_BIN" ]; then
      "$NODE_BIN" scripts/utils.mjs start $PERSONA
    else
      echo "Error: Local Node.js installation not found. Please run the install script first."
      exit 1
    fi
  else
    echo ""
    echo "Starting web interface and backend without AI Provider services..."
    echo "Note: Please navigate to settings page to configure external AI Provider server."
    echo ""
    # Use local Node.js to start only frontend and backend
    if [ -f "$NODE_BIN" ]; then
      "$NODE_BIN" scripts/utils.mjs start-no-provider $PERSONA
    else
      echo "Error: Local Node.js installation not found. Please run the install script first."
      exit 1
    fi
  fi
fi

echo "Application started successfully for persona: $PERSONA"
echo ""
echo "Access the web interface at:"
echo "--------------------------------------------------------"
echo "http://localhost:8080"
echo ""
echo "To stop the application, run the following command:"
echo "--------------------------------------------------------"
echo "./stop.sh"
echo ""
echo "To uninstall the application, run the following command:"
echo "--------------------------------------------------------"
echo "./uninstall.sh"
echo ""
