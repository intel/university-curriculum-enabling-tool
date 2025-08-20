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
if [ -f "$NODE_BIN" ]; then
  "$NODE_BIN" scripts/utils.mjs start $PERSONA
else
  echo "Error: Local Node.js installation not found. Please run the install script first."
  exit 1
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
