// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use strict';

const path = require('path');
const fs   = require('fs');


const PACKAGE_ROOT = path.resolve(__dirname);

const ALLOWED_ENV_PATHS = [
  path.join(PACKAGE_ROOT, '.env'),
];


function isSafeEnvPath(fullPath) {
  const resolved = path.resolve(fullPath);
  return ALLOWED_ENV_PATHS.some((p) => resolved === p);
}

function isSafeEnvVarName(name) {
  return /^[A-Z_][A-Z0-9_]{0,200}$/.test(name);
}

function readEnvVariable(varName, defaultValue = '') {
  // 1. process.env takes priority
  if (process.env[varName] !== undefined) {
    console.log(`Using ${varName} from process.env: ${process.env[varName]}`);
    return process.env[varName];
  }

  // 2. Read from .env file anchored to PACKAGE_ROOT
  const envPath = ALLOWED_ENV_PATHS[0];
  console.log(`Looking for .env file at: ${envPath}`);

  if (!isSafeEnvPath(envPath)) {
    console.error(`Unsafe .env path detected: ${envPath}`);
    return defaultValue;
  }

  if (fs.existsSync(envPath)) {
    try {
      if (!isSafeEnvVarName(varName)) {
        console.error(`Unsafe environment variable name: ${varName}`);
        return defaultValue;
      }
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const cleanLine = line.split('#')[0].trim();
        if (!cleanLine) continue;
        const [key, ...rest] = cleanLine.split('=');
        if (key && key.trim() === varName) {
          let value = rest.join('=').trim();
          value = value.replace(/^["'](.*)["']$/, '$1').trim();
          console.log(`Using ${varName} from .env file: ${value}`);
          return value;
        }
      }
    } catch (err) {
      console.error(`Error reading ${varName} from .env: ${err.message}`);
    }
  }

  console.log(`Using default value for ${varName}: ${defaultValue}`);
  return defaultValue;
}

function getProcessNamespace() {
  const namespace = readEnvVariable('PROCESS_NAMESPACE', 'latest');
  console.log(`Using process namespace: ${namespace}`);
  return namespace;
}

function buildOvmsArgs() {
  const ovmsHost   = readEnvVariable('PROVIDER_HOST', '127.0.0.1:5950');
  const ovmsDevice = readEnvVariable('OVMS_DEVICE', 'GPU');
  const args       = [];

  if (!/^[\w.-]+:\d+$/.test(ovmsHost)) {
    console.error(`Invalid PROVIDER_HOST format: ${ovmsHost}. Using default.`);
    args.push('--port', '5950');
  } else {
    const port    = ovmsHost.split(':')[1];
    const portNum = parseInt(port, 10);
    if (portNum >= 1024 && portNum <= 65535) {
      args.push('--port', port);
    } else {
      console.error(`Invalid port: ${port}. Using default 5950.`);
      args.push('--port', '5950');
    }
  }

  if (/^(CPU|GPU|NPU|HETERO)([\.:][A-Z0-9,]+)?$/i.test(ovmsDevice)) {
    args.push('--device', ovmsDevice);
  } else {
    console.error(`Invalid OVMS_DEVICE: ${ovmsDevice}. Using default GPU.`);
    args.push('--device', 'GPU');
  }

  return args;
}

function getOvmsPythonPath() {
  const isWindows  = process.platform === 'win32';
  const venvPath   = path.join(PACKAGE_ROOT, 'backend', 'ovms_service', 'venv');

  if (!venvPath.startsWith(PACKAGE_ROOT)) {
    throw new Error('Security: OVMS venv path outside package directory');
  }

  const pythonPath = isWindows
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  if (pythonPath.includes('..') || pythonPath.includes('~')) {
    throw new Error('Security: path traversal detected in OVMS Python path');
  }

  return pythonPath;
}

function getBackendPythonPath() {
  const isWindows  = process.platform === 'win32';
  const venvPath   = path.join(PACKAGE_ROOT, 'backend', 'venv');

  if (!venvPath.startsWith(PACKAGE_ROOT)) {
    throw new Error('Security: backend venv path outside package directory');
  }

  const pythonPath = isWindows
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  if (pythonPath.includes('..') || pythonPath.includes('~')) {
    throw new Error('Security: path traversal detected in backend Python path');
  }

  return pythonPath;
}

function getOllamaScript() {
  const isWindows = process.platform === 'win32';
  const ollamaDir = path.join(PACKAGE_ROOT, 'thirdparty', 'ollama');

  try {
    if (isWindows) {
      const exePath = path.join(ollamaDir, 'ollama.exe');
      if (fs.existsSync(exePath)) {
        console.log(`Using Ollama at: ${exePath}`);
        return exePath;
      }
    } else {
      const binPath = path.join(ollamaDir, 'ollama');
      if (fs.existsSync(binPath)) {
        console.log(`Using Ollama binary at: ${binPath}`);
        return binPath;
      }
    }
    console.warn('Ollama not found in expected directory, falling back to system ollama');
    return isWindows ? 'ollama.exe' : 'ollama';
  } catch (err) {
    console.error('Error finding Ollama executable:', err);
    return isWindows ? 'ollama.exe' : 'ollama';
  }
}

function getFrontendCwd() {
  const persona = readEnvVariable('PERSONA', 'faculty');
  console.log(`Using PERSONA for frontend cwd: ${persona}`);
  // path is relative to PACKAGE_ROOT (where this config file lives)
  return path.join(PACKAGE_ROOT, `next-${persona.toLowerCase()}`, 'standalone');
}

// ── Resolve all top-level values once ────────────────────────────────────────
const NAMESPACE      = getProcessNamespace();
const PROVIDER       = readEnvVariable('PROVIDER', 'ollama');
const FRONTEND_CWD   = getFrontendCwd();
const BACKEND_PYTHON = getBackendPythonPath();

module.exports = {
  apps: [
    // ── Frontend ─────────────────────────────────────────────────────────────
    {
      name:        'frontend',
      namespace:   NAMESPACE,
      cwd:         FRONTEND_CWD,
      script:      'server.js',
      watch:       false,
      autorestart: true,
      env: {
        NODE_ENV:     'production',
        HOSTNAME:     readEnvVariable('FRONTEND_HOST',  '127.0.0.1'),
        PORT:         readEnvVariable('FRONTEND_PORT',  '8080'),
        HF_TOKEN:     readEnvVariable('HF_TOKEN',       ''),
        PACKAGE_ROOT: PACKAGE_ROOT,
        OVMS_DEVICE:  readEnvVariable('OVMS_DEVICE',    'CPU'),
        PROVIDER:     PROVIDER,
        PROVIDER_URL: readEnvVariable('PROVIDER_URL',   'http://localhost:5950'),
      },
    },

    // ── Backend ──────────────────────────────────────────────────────────────
    {
      name:        'backend',
      namespace:   NAMESPACE,
      cwd:         path.join(PACKAGE_ROOT, 'backend'),
      script:      'main.py',
      interpreter: BACKEND_PYTHON,
      watch:       false,
      autorestart: true,
      env: {
        FRONTEND_URL:  readEnvVariable('FRONTEND_URL',  'http://localhost:3000'),
        BACKEND_HOST:  readEnvVariable('BACKEND_HOST',  '127.0.0.1'),
        BACKEND_PORT:  readEnvVariable('BACKEND_PORT',  '8016'),
      },
    },

    // ── Ollama (conditional) ─────────────────────────────────────────────────
    ...(PROVIDER === 'ollama'
      ? [
          {
            name:        'ollama',
            namespace:   NAMESPACE,
            cwd:         path.join(PACKAGE_ROOT, 'thirdparty', 'ollama'),
            script:      getOllamaScript(),
            args:        ['serve'],
            watch:       false,
            autorestart: true,
            env: {
              OLLAMA_HOST:    readEnvVariable('PROVIDER_HOST',   '127.0.0.1:5950'),
              OLLAMA_NUM_GPU: readEnvVariable('OLLAMA_NUM_GPU',  '999'),
              OLLAMA_KEEP_ALIVE: readEnvVariable('OLLAMA_KEEP_ALIVE', '10m'),
              no_proxy:       readEnvVariable('no_proxy',        'localhost,127.0.0.1'),
              ZES_ENABLE_SYSMAN:
                readEnvVariable('ZES_ENABLE_SYSMAN',             '1'),
              SYCL_CACHE_PERSISTENT:
                readEnvVariable('SYCL_CACHE_PERSISTENT',         '1'),
              SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS:
                readEnvVariable('SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS', '1'),
              ONEAPI_DEVICE_SELECTOR:
                readEnvVariable('ONEAPI_DEVICE_SELECTOR',        'level_zero:0'),
            },
          },
        ]
      : []),

    // ── OVMS (conditional) ───────────────────────────────────────────────────
    ...(PROVIDER === 'ovms'
      ? [
          {
            name:        'ovms',
            namespace:   NAMESPACE,
            cwd:         path.join(PACKAGE_ROOT, 'backend', 'ovms_service'),
            script:      'ovms_start.py',
            interpreter: getOvmsPythonPath(),
            args:        buildOvmsArgs(),
            watch:       false,
            autorestart: true,
            env: {
              HF_TOKEN:    readEnvVariable('HF_TOKEN',    ''),
              OVMS_DEVICE: readEnvVariable('OVMS_DEVICE', 'GPU'),
              no_proxy:    readEnvVariable('no_proxy',    'localhost,127.0.0.1'),
            },
          },
        ]
      : []),
  ],
};