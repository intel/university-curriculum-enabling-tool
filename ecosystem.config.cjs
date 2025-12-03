// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

const path = require('path');
const fs = require('fs');
const { hostname } = require("os");
const os = require('os');

const ALLOWED_ENV_PATHS = [
  path.resolve(__dirname, '.env'),
];

function isSafeEnvPath(fullPath) {
  const resolved = path.resolve(fullPath);
  return ALLOWED_ENV_PATHS.includes(resolved);
}

function isSafeEnvVarName(name) {
  // Only allow typical env var names: uppercase, numbers, underscores, not empty, not too long
  return /^[A-Z_][A-Z0-9_]{0,63}$/.test(name);
}

// Utility function to read environment variables from .env file
function readEnvVariable(varName, defaultValue = '', rootEnvPath) {

  // If no root .env path is provided, determine it
  if (!rootEnvPath) {
    rootEnvPath = ALLOWED_ENV_PATHS[0];
    console.log(`Looking for .env file at: ${rootEnvPath}`);
  }

  // Step 1: First check if it's in process.env (already set)
  if (process.env[varName] !== undefined) {
    console.log(`Using ${varName} from process.env: ${process.env[varName]}`);
    return process.env[varName];
  }

  if (!isSafeEnvPath(rootEnvPath)) {
    console.error(`Unsafe .env path detected: ${rootEnvPath}`);
    return defaultValue;
  }

  // Step 2: If not in process.env, try to read from root .env file
  if (fs.existsSync(rootEnvPath)) {
    try {
      rootEnvPath = ALLOWED_ENV_PATHS[0];
      const envContent = fs.readFileSync(rootEnvPath, 'utf8');
      if (!isSafeEnvVarName(varName)) {
        console.error(`Unsafe environment variable name: ${varName}`);
        return defaultValue;
      }
      const lines = envContent.split('\n');
      for (const line of lines) {
        // Remove comments and trim
        const cleanLine = line.split('#')[0].trim();
        if (!cleanLine) continue;
        const [key, ...rest] = cleanLine.split('=');
        if (key && key.trim() === varName) {
          // Join the rest in case value contains '='
          let value = rest.join('=').trim();
          // Remove any surrounding quotes
          value = value.replace(/^["'](.*)["']$/, '$1').trim();
          console.log(`Using ${varName} from .env file: ${value}`);
          return value;
        }
      }
    } catch (err) {
      console.error(`Error reading ${varName} from root .env file: ${err.message}`);
    }
  }

  // Step 3: Return default value if not found in process.env or .env file
  console.log(`Using default value for ${varName}: ${defaultValue}`);
  return defaultValue;
}

// Helper function to get PM2 namespace from environment or root .env file
function getPM2Namespace() {
  const namespace = readEnvVariable('PM2_NAMESPACE', 'latest');
  console.log(`Using PM2_NAMESPACE from environment or .env: ${namespace}`);
  return namespace;
}

// Helper function to build OVMS command-line arguments
function buildOvmsArgs() {
  const ovmsHost = readEnvVariable('PROVIDER_HOST', '127.0.0.1:5950');
  const ovmsDevice = readEnvVariable('OVMS_DEVICE', 'GPU');
  const args = [];

  // Validate PROVIDER_HOST format to prevent injection
  if (!/^[\w.-]+:\d+$/.test(ovmsHost)) {
    console.error(`Invalid PROVIDER_HOST format: ${ovmsHost}. Using default.`);
    args.push('--port', '5950');
  } else {
    // Extract and add port from PROVIDER_HOST (e.g., "127.0.0.1:5950" -> "5950")
    const port = ovmsHost.split(':')[1];
    // Validate port is a number between 5000-6000
    const portNum = parseInt(port, 10);
    if (portNum >= 5000 && portNum <= 6000) {
      args.push('--port', port);
    } else {
      console.error(`Invalid port number: ${port}. Using default 5950.`);
      args.push('--port', '5950');
    }
  }

  // Validate device to prevent injection - only allow safe device names
  // Valid formats: CPU, GPU, NPU, GPU.0, GPU.1, HETERO:GPU,CPU
  if (/^(CPU|GPU|NPU|HETERO)([\.:][A-Z0-9,]+)?$/i.test(ovmsDevice)) {
    args.push('--device', ovmsDevice);
  } else {
    console.error(`Invalid OVMS_DEVICE: ${ovmsDevice}. Using default GPU.`);
    args.push('--device', 'GPU');
  }

  return args;
}

// Helper function to get Python interpreter path for OVMS
function getOvmsPythonPath() {
  const isWindows = process.platform === 'win32';
  const baseDir = process.cwd();

  // Validate base directory to prevent path traversal
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedBase.startsWith(path.resolve(__dirname))) {
    console.error('Security: Detected path traversal attempt');
    throw new Error('Invalid base directory path');
  }

  // Construct safe path using path.join to prevent path manipulation
  const ovmsVenvPath = path.join(resolvedBase, 'backend', 'ovms_service', 'venv');

  // Validate the venv path is within the project directory
  if (!ovmsVenvPath.startsWith(resolvedBase)) {
    console.error('Security: Python venv path outside project directory');
    throw new Error('Invalid venv path');
  }

  const pythonPath = isWindows
    ? path.join(ovmsVenvPath, 'Scripts', 'python.exe')
    : path.join(ovmsVenvPath, 'bin', 'python');

  // Final validation: ensure no path traversal sequences
  if (pythonPath.includes('..') || pythonPath.includes('~')) {
    console.error('Security: Path traversal attempt detected in Python path');
    throw new Error('Invalid Python interpreter path');
  }

  return pythonPath;
}

module.exports = {
  apps: [
    {
      name: 'frontend',
      namespace: getPM2Namespace(),
      // Use the standalone server.js from the Next.js build
      cwd: function() {
        // Read persona from environment or .env file with 'faculty' as the default
        const persona = readEnvVariable('PERSONA', 'faculty');
        console.log(`Using PERSONA for frontend service: ${persona}`);
        return `./next-${persona.toLowerCase()}/standalone`;
      }(),
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        HOSTNAME: readEnvVariable('FRONTEND_HOST', '127.0.0.1'),
        PORT: readEnvVariable('FRONTEND_PORT', 8080),
        PROVIDER_URL: readEnvVariable('PROVIDER_URL', 'http://127.0.0.1:5950'),
        HF_TOKEN: readEnvVariable('HF_TOKEN', ''),
        PACKAGE_ROOT: path.resolve(__dirname),
        PROVIDER: readEnvVariable('PROVIDER', 'ollama'),
        OVMS_DEVICE: readEnvVariable('OVMS_DEVICE', 'CPU'),
      },
      watch: false,
      autorestart: true,
    },
    {
      name: 'backend',
      namespace: getPM2Namespace(),
      cwd: './backend',
      script: 'main.py',
      // Use a function to resolve the interpreter path properly
      interpreter: function() {
        const path = require('path');
        const isWindows = process.platform === 'win32';
        const venvPath = path.join(process.cwd(), 'backend', 'venv');
        return isWindows
          ? path.join(venvPath, 'Scripts', 'python.exe')
          : path.join(venvPath, 'bin', 'python');
      }(),
      watch: false,
      autorestart: true,
      env: {
        // Pass environment variables to backend
        FRONTEND_URL: 'http://localhost:3000',
        BACKEND_HOST: readEnvVariable('BACKEND_HOST', '127.0.0.1'),
        BACKEND_PORT: readEnvVariable('BACKEND_PORT', 8016)
      }
    },
    // Conditionally include Ollama when PROVIDER=ollama (or not set, since ollama is default)
    ...(readEnvVariable('PROVIDER', 'ollama') === 'ollama'
      ? [{
          name: 'ollama',
          namespace: getPM2Namespace(),
          cwd: './thirdparty/ollama',
          // Use the script path dynamically based on OS and check for directory existence
          script: function() {
            const fs = require('fs');
            const path = require('path');
            const isWindows = process.platform === 'win32';
            const ollamaDir = path.join(process.cwd(), 'thirdparty/ollama');

            try {
              // Check for Ollama executables directly in the ollama directory
              if (isWindows) {
                // For Windows, look for ollama.exe
                const exePath = path.join(ollamaDir, 'ollama.exe');
                if (fs.existsSync(exePath)) {
                  console.log(`Using Ollama at: ${exePath}`);
                  return exePath;
                }
              } else {
                // For Linux, directly use the ollama binary with serve command
                const ollamaBinPath = path.join(ollamaDir, 'ollama');

                if (fs.existsSync(ollamaBinPath)) {
                  console.log(`Using Ollama binary at: ${ollamaBinPath}`);
                  return ollamaBinPath;
                }
              }

              console.warn('No Ollama executable found in expected directory');

              // Fallback: try to use a system-installed ollama
              return isWindows ? 'ollama.exe' : 'ollama';
            } catch (err) {
              console.error('Error finding Ollama executable:', err);
              return isWindows ? 'ollama.exe' : 'ollama';
            }
          }(),
          // Add the serve argument for the ollama command
          args: "serve",
          watch: false,
          autorestart: true,
          env: {
            // Ollama configuration
            OLLAMA_HOST: readEnvVariable('PROVIDER_HOST', '127.0.0.1:5950'),
            OLLAMA_NUM_GPU: readEnvVariable('OLLAMA_NUM_GPU', 999),
            OLLAMA_KEEP_ALIVE: readEnvVariable('OLLAMA_KEEP_ALIVE', '10m'),

            // Proxy settings
            no_proxy: readEnvVariable('no_proxy', 'localhost,127.0.0.1'),

            // Intel GPU optimization settings
            ZES_ENABLE_SYSMAN: readEnvVariable('ZES_ENABLE_SYSMAN', 1),
            SYCL_CACHE_PERSISTENT: readEnvVariable('SYCL_CACHE_PERSISTENT', 1),
            SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS:
              readEnvVariable('SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS', 1),
            ONEAPI_DEVICE_SELECTOR: readEnvVariable('ONEAPI_DEVICE_SELECTOR', 'level_zero:0')
          }
        }]
      : []),
    // Conditionally include OVMS when PROVIDER=ovms
    ...(readEnvVariable('PROVIDER') === 'ovms'
      ? [{
          name: 'ovms',
          namespace: getPM2Namespace(),
          cwd: './backend/ovms_service',
          script: 'ovms_start.py',
          interpreter: getOvmsPythonPath(),
          args: buildOvmsArgs(),
          watch: false,
          autorestart: true,
          env: {
            HF_TOKEN: readEnvVariable('HF_TOKEN', ''),
            OVMS_DEVICE: readEnvVariable('OVMS_DEVICE', 'GPU'),
            no_proxy: readEnvVariable('no_proxy', 'localhost,127.0.0.1'),
          }
        }]
      : [])
  ]
};
