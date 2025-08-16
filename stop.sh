#!/bin/bash

# stop.sh: Stop the application
# This script stops all services running for the application
#
# Usage:
#   ./stop.sh             - Stop all services
#   FORCE=true ./stop.sh  - Remove all services instead of just stopping them

echo "Stopping the application..."

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

# Check if FORCE environment variable is set (to completely remove services instead of just stopping them)
FORCE_FLAG=""
if [ -n "$FORCE" ] && [ "$FORCE" = "true" ]; then
  echo "FORCE flag detected. Services will be completely removed instead of just stopped."
  FORCE_FLAG="--force"
fi

# Use local Node.js
NODE_BIN="$SCRIPT_DIR/thirdparty/node/bin/node"
if [ -f "$NODE_BIN" ]; then
  "$NODE_BIN" scripts/utils.mjs stop $FORCE_FLAG
else
  echo "Error: Local Node.js installation not found. Please run the install script first."
  exit 1
fi

echo "Application ${FORCE_FLAG:+removed}${FORCE_FLAG:-stopped} successfully"
