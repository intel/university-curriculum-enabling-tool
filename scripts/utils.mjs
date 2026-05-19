#!/usr/bin/env node

// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { execSync, spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { fileURLToPath } from 'url';
import { resolvePaths } from './path-resolver.mjs';
import { spawnSync } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

import {
  startProcess,
  stopProcess,
  deleteProcess,
  killDaemon,
  listProcesses,
  startEcosystem,
} from './process-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const allowedPersonaMap = {
  faculty: 'faculty',
  lecturer: 'lecturer',
  student: 'student',
};

const personaArg = process.argv[3];
const persona = allowedPersonaMap[personaArg] || 'faculty';

const paths = resolvePaths({ persona });

const {
  root: WORKING_DIR,
  frontend: FRONTEND_DIR,
  backend: BACKEND_DIR,
  thirdparty: THIRDPARTY_DIR,
  node: NODE_DIR,
  ollama: OLLAMA_DIR,
  data: DATA_DIR,
  venv: VENV_DIR,
  ovms: OVMS_DIR,
  ovmsVenv: OVMS_VENV_DIR,
  ovmsBackend: OVMS_BACKEND,
  ecosystem: ECOSYSTEM_CONFIG,
  dist: DIST_DIR,
  isOllamaOrOvms: IS_OLLAMA_OR_OVMS,
  isDistPackage: IS_DIST_PACKAGE,
  isDevelopmentMode: IS_DEV_MODE,
  isRootRepo: IS_ROOT_REPO
} = paths;

const isWindows = process.platform === 'win32';

function getPythonCommand() {
  if (isWindows) {
    const pythonCommands = ['python', 'python3', 'py'];
    for (const cmd of pythonCommands) {
      try {
        const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
        if (result.status === 0) return cmd;
      } catch (_) {}
    }
    return 'python';
  } else {
    return 'python3';
  }
}

const pythonCommand = getPythonCommand();
const venvPython = isWindows
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python');
const venvPip = isWindows
  ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
  : path.join(VENV_DIR, 'bin', 'pip');
const ovmsVenvPip = isWindows
  ? path.join(OVMS_VENV_DIR, 'Scripts', 'pip.exe')
  : path.join(OVMS_VENV_DIR, 'bin', 'pip');

const nodeBin = isWindows
  ? path.join(NODE_DIR, 'node.exe')
  : path.join(NODE_DIR, 'bin', 'node');

const npmBin = isWindows
  ? path.join(NODE_DIR, 'npm.cmd')
  : path.join(NODE_DIR, 'bin', 'npm');

const npmCommand = fs.existsSync(npmBin) ? npmBin : (isWindows ? 'npm.cmd' : 'npm');
const nodePath = fs.existsSync(nodeBin) ? nodeBin : (isWindows ? 'node.exe' : 'node');

const ALLOWED_PATH_REGEX = /^[a-zA-Z0-9_\-\.\/]+$/;
const SAFE_ARG_REGEX = /^[a-zA-Z0-9_\-\/\.=:@+\\]+$/;
const SAFE_URL_REGEX = /^https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;

function isValidPythonPath(pythonPath) {
  if (!pythonPath || typeof pythonPath !== 'string') return false;
  const dangerousChars = /[;&|`$(){}[\]<>]/;
  if (dangerousChars.test(pythonPath)) return false;
  if (isWindows && !path.isAbsolute(pythonPath)) return false;
  const validEndings = isWindows
    ? [/python\.exe$/i, /python3\.exe$/i]
    : [/\/python$/, /\/python3$/, /\/python3\.\d+$/];
  if (!validEndings.some((pattern) => pattern.test(pythonPath))) return false;
  if (!fs.existsSync(pythonPath)) return false;
  if (isWindows) {
    const allowedPrefixes = [
      'C:\\Python',
      'C:\\Program Files\\Python',
      'C:\\Program Files (x86)\\Python',
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\Python')
        : null,
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps')
        : null,
    ].filter(Boolean);
    const isInAllowedLocation = allowedPrefixes.some((prefix) =>
      pythonPath.toLowerCase().startsWith(prefix.toLowerCase())
    );
    if (!isInAllowedLocation) {
      console.log(`Python path not in allowed location: ${pythonPath}`);
      return false;
    }
  }
  return true;
}

function getDynamicPythonCommand() {
  if (isWindows) {
    console.log('Searching for Python installation...');
    try {
      const whereResult = spawnSync('where', ['python'], { encoding: 'utf8' });
      if (whereResult.status === 0 && whereResult.stdout) {
        const pythonPaths = whereResult.stdout
          .trim()
          .split('\n')
          .map((p) => p.trim())
          .filter(Boolean);
        for (const pythonPath of pythonPaths) {
          if (isValidPythonPath(pythonPath)) {
            try {
              const result = spawnSync(pythonPath, ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                encoding: 'utf8',
              });
              if (result.status === 0) {
                console.log(`Verified Python works: ${pythonPath}`);
                return pythonPath;
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    const pythonCommands = ['python', 'python3', 'py'];
    const userProfile = process.env.USERPROFILE || '';
    const pythonPathPatterns = [
      'C:\\Python*\\python.exe',
      'C:\\Program Files\\Python*\\python.exe',
      'C:\\Program Files (x86)\\Python*\\python.exe',
    ];
    if (userProfile) {
      pythonPathPatterns.push(
        path.join(userProfile, 'AppData\\Local\\Programs\\Python\\Python*\\python.exe'),
        path.join(userProfile, 'AppData\\Local\\Microsoft\\WindowsApps\\python*.exe')
      );
    }

    for (const pattern of pythonPathPatterns) {
      try {
        const basePath = pattern.substring(0, pattern.lastIndexOf('\\'));
        const baseDir = basePath.substring(0, basePath.lastIndexOf('\\'));
        if (fs.existsSync(baseDir)) {
          const entries = fs.readdirSync(baseDir);
          let matchingEntries;
          if (pattern.includes('WindowsApps')) {
            matchingEntries = entries
              .filter((file) => /^python(3(\.\d+)?)?\.exe$/i.test(file))
              .map((file) => path.join(baseDir, file));
          } else {
            matchingEntries = entries
              .filter((dir) => /^Python(\d+(\.\d+)?)?$/i.test(dir))
              .map((dir) => path.join(baseDir, dir, 'python.exe'))
              .filter((exe) => fs.existsSync(exe));
          }
          pythonCommands.push(...matchingEntries);
        }
      } catch (_) {}
    }

    for (const cmd of pythonCommands) {
      try {
        if (cmd.includes(path.sep) && isValidPythonPath(cmd)) {
          const result = spawnSync(cmd, ['--version'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
          });
          if (result.status === 0) return cmd;
        } else if (!cmd.includes(path.sep)) {
          const result = spawnSync(cmd, ['--version'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
          });
          if (result.status === 0) return cmd;
        }
      } catch (_) {}
    }

    console.warn('No working Python installation found!');
    return 'python';
  } else {
    const checkSnippet = [
      'import ensurepip, os;',
      'b = os.path.join(os.path.dirname(ensurepip.__file__), "_bundled");',
      'exit(0 if os.path.isdir(b) and any(f.endswith(".whl") for f in os.listdir(b)) else 1)',
    ].join(' ');

    const candidates = [
      '/usr/local/bin/python3.12',
      '/usr/local/bin/python3.11',
      '/usr/local/bin/python3.10',
      '/usr/local/bin/python3.9',
      '/usr/local/bin/python3',
      '/usr/bin/python3.12',
      '/usr/bin/python3.11',
      '/usr/bin/python3.10',
      '/usr/bin/python3.9',
      '/usr/bin/python3',
      'python3',
    ];

    for (const candidate of candidates) {
      if (candidate.startsWith('/') && !fs.existsSync(candidate)) continue;

      try {
        const ver = spawnSync(candidate, ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        });
        if (ver.status !== 0) continue;

        const check = spawnSync(candidate, ['-c', checkSnippet], {
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        });

        if (check.status === 0) {
          console.log(`Using Python with working ensurepip: ${candidate}`);
          return candidate;
        }

        console.log(`Skipping ${candidate}: ensurepip has no bundled pip wheel`);
      } catch (_) {
        continue;
      }
    }

    console.warn('No Python with bundled ensurepip found, falling back to python3');
    return 'python3';
  }
}

// ── All known Python path aliases used in whitelist ──────────────────────────
const LINUX_PYTHON_PATHS = [
  '/usr/local/bin/python3.12',
  '/usr/local/bin/python3.11',
  '/usr/local/bin/python3.10',
  '/usr/local/bin/python3.9',
  '/usr/local/bin/python3',
  '/usr/bin/python3.12',
  '/usr/bin/python3.11',
  '/usr/bin/python3.10',
  '/usr/bin/python3.9',
  '/usr/bin/python3',
  '/usr/bin/python',
  '/usr/local/bin/python',
];

export const ALLOWED_COMMANDS_CONFIG = {
  npm: {
    path: npmCommand,
    aliases: ['npm', npmCommand],
    allowedArgs: new Set([
      'install', 'run', 'list',
      'build:faculty', 'build:lecturer', 'build:student',
      '--no-progress', '--no-color',
    ]),
  },
  python3: {
    path: getDynamicPythonCommand(),
    aliases: [
      'python', 'python3', pythonCommand,
      getDynamicPythonCommand(),
      ...LINUX_PYTHON_PATHS,
    ],
    allowedArgs: new Set([
      '-m', 'pip', 'install', 'venv',
      '--without-pip', '--copies',
    ]),
  },
  pip: {
    path: venvPip,
    aliases: ['pip', 'pip3', venvPip],
    allowedArgs: new Set(['install', '-r', 'requirements.txt']),
  },
  ovmsPip: {
    path: ovmsVenvPip,
    aliases: [ovmsVenvPip],
    allowedArgs: new Set(['install', '-r', 'requirements.txt']),
  },
  node: {
    path: nodePath,
    aliases: ['node', nodePath],
    allowedArgs: new Set([]),
  },
  curl: {
    path: 'curl',
    aliases: ['curl'],
    allowedArgs: new Set([
      '-L', '-o', '--location', '--output', '--fail', '--retry', '--retry-delay',
      '--connect-timeout', '--max-time', '--progress-bar',
    ]),
  },
  tar: {
    path: 'tar',
    aliases: ['tar'],
    allowedArgs: new Set(['-xzf', '--strip-components=1']),
  },
  chmod: {
    path: 'chmod',
    aliases: ['chmod'],
    allowedArgs: new Set(['+x']),
  },
  powershell: {
    path: isWindows
      ? (() => {
          const powerShellPaths = [
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
            'powershell.exe',
            'powershell',
          ];
          for (const psPath of powerShellPaths) {
            if (psPath.includes('\\') && fs.existsSync(psPath)) return psPath;
            else if (!psPath.includes('\\')) {
              try {
                const r = spawnSync('where', [psPath], { stdio: 'ignore' });
                if (r.status === 0) return psPath;
              } catch (_) {}
            }
          }
          return 'powershell';
        })()
      : null,
    aliases: ['powershell'],
    allowedArgs: new Set([
      '-Command', 'Expand-Archive', '-Path', '-DestinationPath', '-Force',
      'Invoke-WebRequest', '-Uri', '-OutFile',
    ]),
  },
  cmd: {
    path: isWindows ? 'cmd' : null,
    aliases: ['cmd'],
    allowedArgs: new Set(['/c', '/k']),
  },
};

export function lookupCommandInfo(cmdAlias) {
  if (
    ['python', 'python3'].includes(cmdAlias) ||
    (typeof cmdAlias === 'string' &&
      cmdAlias.toLowerCase().includes('python') &&
      (cmdAlias.toLowerCase().endsWith('.exe') ||
       /python[\d.]*$/.test(cmdAlias))
    )
  ) {
    const pythonPath = getDynamicPythonCommand();
    return {
      path: pythonPath,
      aliases: [
        'python', 'python3', pythonPath, cmdAlias,
        ...LINUX_PYTHON_PATHS,
      ],
      allowedArgs: new Set([
        '-m', 'pip', 'install', 'venv',
        '--without-pip', '--copies',
      ]),
    };
  }

  if (isWindows && cmdAlias.toLowerCase().includes('powershell.exe')) {
    const powerShellConfig = ALLOWED_COMMANDS_CONFIG.powershell;
    if (powerShellConfig && powerShellConfig.path) {
      return {
        path: cmdAlias,
        aliases: [cmdAlias, 'powershell.exe', 'powershell'],
        allowedArgs: powerShellConfig.allowedArgs,
      };
    }
  }

  if (cmdAlias.toLowerCase().includes('node.exe') || cmdAlias.toLowerCase().endsWith('node')) {
    const nodeConfig = ALLOWED_COMMANDS_CONFIG.node;
    if (nodeConfig && nodeConfig.path) {
      return {
        path: cmdAlias,
        aliases: [cmdAlias, 'node.exe', 'node', nodeConfig.path],
        allowedArgs: nodeConfig.allowedArgs,
      };
    }
  }

  return (
    Object.values(ALLOWED_COMMANDS_CONFIG).find((entry) =>
      entry.aliases.includes(cmdAlias)
    ) || null
  );
}

function isSafeRelativePath(inputPath) {
  const resolvedRoot = path.resolve(ROOT_DIR);
  const resolvedInput = path.resolve(inputPath);
  if (
    resolvedInput !== resolvedRoot &&
    !resolvedInput.startsWith(resolvedRoot + path.sep)
  ) {
    return false;
  }
  if (inputPath.includes('..')) return false;
  const segments = path.relative(resolvedRoot, resolvedInput).split(path.sep);
  for (const segment of segments) {
    if (segment && !ALLOWED_PATH_REGEX.test(segment)) return false;
  }
  return true;
}

function getPersonaFromKey(persona) {
  const normalized = persona.toLowerCase().trim();
  const safePersona = allowedPersonaMap[normalized];
  if (!safePersona) throw new Error(`Invalid persona: ${persona}`);
  return safePersona;
}

function getOllamaEnvironmentVariables(rootDir) {
  const envVars = {
    OLLAMA_NUM_GPU: 999,
    no_proxy: 'localhost,127.0.0.1',
    ZES_ENABLE_SYSMAN: 1,
    SYCL_CACHE_PERSISTENT: 1,
    OLLAMA_KEEP_ALIVE: '10m',
    SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS: 1,
    ONEAPI_DEVICE_SELECTOR: 'level_zero:0',
  };
  const ollamaEnvVars = [
    'OLLAMA_NUM_GPU', 'no_proxy', 'ZES_ENABLE_SYSMAN', 'SYCL_CACHE_PERSISTENT',
    'OLLAMA_KEEP_ALIVE', 'SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS',
    'ONEAPI_DEVICE_SELECTOR', 'PROVIDER_HOST', 'OLLAMA_MODELS', 'OLLAMA_DEBUG',
    'http_proxy', 'https_proxy', 'OLLAMA_ORIGINS',
  ];
  ollamaEnvVars.forEach((varName) => {
    const value = readEnvVariable(varName, envVars[varName]);
    if (value !== undefined) {
      console.log(`Using ${varName}: ${value}`);
      envVars[varName] = value;
    }
  });
  return envVars;
}

function parsePortFromProviderHost(providerHost, defaultPort = 5950) {
  if (!providerHost || typeof providerHost !== 'string') return defaultPort;
  const parts = providerHost.split(':');
  if (parts.length === 2) {
    const port = parseInt(parts[1], 10);
    if (!isNaN(port) && port > 0 && port <= 65535) return port;
  }
  return defaultPort;
}

function getOvmsEnvironmentVariables(rootDir) {
  const envVars = {
    PROVIDER_HOST: '127.0.0.1:5950',
    OVMS_LOG_LEVEL: 'INFO',
    OVMS_POLL_INTERVAL: 1,
    no_proxy: 'localhost,127.0.0.1',
  };
  const ovmsEnvVars = [
    'PROVIDER_HOST', 'OVMS_LOG_LEVEL', 'OVMS_POLL_INTERVAL',
    'OVMS_DEVICE', 'no_proxy', 'http_proxy', 'https_proxy',
  ];
  ovmsEnvVars.forEach((varName) => {
    const value = readEnvVariable(varName, envVars[varName]);
    if (value !== undefined) {
      console.log(`Using ${varName}: ${value}`);
      envVars[varName] = value;
    }
  });
  return envVars;
}

function validateExecutablePath(commandPath) {
  if (!commandPath || typeof commandPath !== 'string') {
    throw new Error('Invalid command path: must be a non-empty string');
  }
  const dangerousChars = /[;&|`$(){}[\]<>]/;
  if (dangerousChars.test(commandPath)) {
    throw new Error(`Invalid command path: contains dangerous characters: ${commandPath}`);
  }
  if (path.isAbsolute(commandPath)) {
    const projectBasePaths = [ROOT_DIR, path.dirname(ROOT_DIR)];
    const safePrefixes = isWindows
      ? [
          'C:\\Windows\\System32\\',
          'C:\\Windows\\SysWOW64\\',
          'C:\\Program Files\\',
          'C:\\Program Files (x86)\\',
          'C:\\Python',
          process.env.USERPROFILE
            ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\')
            : null,
          process.env.USERPROFILE
            ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps\\')
            : null,
          ...projectBasePaths,
        ].filter(Boolean)
      : [
          '/usr/bin/', '/usr/local/bin/', '/bin/', '/opt/',
          ...projectBasePaths,
        ];

    const isInSafeLocation = safePrefixes.some((prefix) =>
      commandPath.toLowerCase().startsWith(prefix.toLowerCase())
    );
    if (!isInSafeLocation) {
      throw new Error(`Invalid command path: not in safe location: ${commandPath}`);
    }
  }
  return true;
}

function getSanitizedCommandPath(commandPath) {
  validateExecutablePath(commandPath);
  if (!validateCommandPath(commandPath)) {
    throw new Error(`Command path not in whitelist: ${commandPath}`);
  }
  return { executablePath: String(commandPath), isValidated: true };
}

function validateCommandPath(commandPath) {
  const ALLOWED_COMMAND_PATHS = [
    'C:\\Windows\\System32\\cmd.exe',
    'C:\\Windows\\SysWOW64\\cmd.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
    'powershell.exe', 'powershell', 'cmd', 'curl', 'tar', 'chmod', 'where', 'robocopy',
    'node', 'node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd',
    'python', 'python3', 'python.exe', 'python3.exe', 'py', 'pip', 'pip3', 'pip.exe',
    '/usr/bin/python3', '/usr/bin/python',
    '/usr/local/bin/python3', '/usr/local/bin/python',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
    '/usr/local/bin/python3.10',
    '/usr/local/bin/python3.9',
    '/usr/bin/python3.12',
    '/usr/bin/python3.11',
    '/usr/bin/python3.10',
    '/usr/bin/python3.9',
    '/bin/bash', '/bin/sh', '/usr/bin/curl', '/usr/bin/tar', '/usr/bin/chmod',
  ];
  if (ALLOWED_COMMAND_PATHS.includes(commandPath)) return true;

  const projectBasePaths = [ROOT_DIR, path.dirname(ROOT_DIR)];
  for (const basePath of projectBasePaths) {
    if (commandPath.startsWith(basePath)) return true;
  }

  const systemPrefixes = isWindows
    ? ['C:\\Windows\\System32\\', 'C:\\Windows\\SysWOW64\\', 'C:\\Program Files\\',
       'C:\\Program Files (x86)\\', 'C:\\Python']
    : ['/usr/bin/', '/usr/local/bin/', '/bin/', '/opt/'];
  for (const prefix of systemPrefixes) {
    if (commandPath.startsWith(prefix)) return true;
  }

  if (isWindows && process.env.USERPROFILE) {
    const userPrefixes = [
      path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\'),
      path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps\\'),
    ];
    for (const prefix of userPrefixes) {
      if (commandPath.startsWith(prefix)) return true;
    }
  }
  return false;
}

const SAFE_PATH_ENTRY_REGEX = /^[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\. \\]+)?$/;

const WINDOWS_SAFE_PATH_PREFIXES = [
  'C:\\Windows\\',
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
  'C:\\Python',
  ...(process.env.USERPROFILE ? [
    path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\'),
    path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps\\'),
    path.join(process.env.USERPROFILE, 'AppData\\Roaming\\npm'),
  ] : []),
  ROOT_DIR,
  path.dirname(ROOT_DIR),
];

function isSafeWindowsPathEntry(entry) {
  if (!entry || typeof entry !== 'string') return false;
  const trimmed = entry.trim();
  if (!trimmed) return false;

  // Must not contain shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]<>"']/;
  if (dangerousChars.test(trimmed)) return false;

  // Must match basic Windows absolute path pattern
  if (!SAFE_PATH_ENTRY_REGEX.test(trimmed)) return false;

  // Must start with a known safe prefix (case-insensitive)
  const lower = trimmed.toLowerCase();
  return WINDOWS_SAFE_PATH_PREFIXES.some(
    (prefix) => lower.startsWith(prefix.toLowerCase())
  );
}

function sanitizeWindowsPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';

  const entries = rawPath.split(';');
  const sanitized = entries.filter((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    const safe = isSafeWindowsPathEntry(trimmed);
    if (!safe) {
      console.warn(`Removing unsafe PATH entry: ${trimmed}`);
    }
    return safe;
  });

  return sanitized.join(';');
}

function buildSafeEnv(baseEnv = process.env) {
  const env = { ...baseEnv };

  if (isWindows) {
    const rawPath = getRefreshedWindowsPath();   // may return tainted data
    const safePath = sanitizeWindowsPath(rawPath); // explicit sanitization
    if (safePath) {
      env.PATH = safePath;
      console.log('PATH refreshed and sanitized from Windows registry.');
    }
    // If sanitization produced nothing, env.PATH retains the inherited value.
  }

  if (fs.existsSync(NODE_DIR)) {
    const nodeBinPath = isWindows ? NODE_DIR : path.join(NODE_DIR, 'bin');
    env.PATH = nodeBinPath + (isWindows ? ';' : ':') + (env.PATH || '');
  }

  return env;
}

function getRefreshedWindowsPath() {
  if (!isWindows) return process.env.PATH || '';

  try {
    const machinePathResult = spawnSync(
      'reg',
      [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
        '/v',
        'PATH',
      ],
      { encoding: 'utf8' }
    );

    const userPathResult = spawnSync(
      'reg',
      ['query', 'HKCU\\Environment', '/v', 'PATH'],
      { encoding: 'utf8' }
    );

    const extractPath = (regOutput) => {
      if (!regOutput) return '';
      const match = regOutput.match(/PATH\s+REG(?:_EXPAND)?_SZ\s+(.+)/i);
      return match ? match[1].trim() : '';
    };

    const machinePath = extractPath(machinePathResult.stdout);
    const userPath    = extractPath(userPathResult.stdout);

    const combined = [machinePath, userPath].filter(Boolean).join(';');
    if (combined) {
      const sanitized = sanitizeWindowsPath(combined);
      if (sanitized) {
        return sanitized;
      }
      console.warn('No safe PATH entries found after sanitization, falling back to process PATH');
    }
  } catch (e) {
    console.warn('Could not refresh PATH from registry:', e.message);
  }

  return process.env.PATH || '';
}

function execCommand(command, options = {}) {
  try {
    let cmd, args;
    if (Array.isArray(command)) {
      [cmd, ...args] = command;
    } else {
      [cmd, ...args] = command.split(' ');
    }

    const commandInfo = lookupCommandInfo(cmd);
    if (!commandInfo) {
      throw new Error(`Blocked execution: command '${cmd}' is not allowed.`);
    }

    if (!Array.isArray(args)) throw new Error('Arguments must be in an array');
    for (const arg of args) {
      if (typeof arg !== 'string' || !SAFE_ARG_REGEX.test(arg)) {
        throw new Error(`Blocked execution: unsafe argument '${arg}'`);
      }
    }

    const sanitizedCommand = getSanitizedCommandPath(commandInfo.path);

    // Build a clean env from scratch instead of inheriting process.env
    const env = Object.create(null);
    const safeEnv = buildSafeEnv();
    env.PATH = safeEnv.PATH || '';

    // Preserve proxy settings needed for network access
    const proxyVars = ['http_proxy', 'https_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
    for (const key of proxyVars) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    const result = spawnSync(sanitizedCommand.executablePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      shell: false,
      env,
      ...options,
    });

    if (result.status === 0) {
      return { success: true, output: result.stdout };
    } else {
      return { success: false, error: result.error?.message, stderr: result.stderr };
    }
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr?.toString() };
  }
}

function isSafeArg(command, commandInfo, arg, index, args) {
  if (typeof arg !== 'string') return false;
  if (command === 'curl' && SAFE_URL_REGEX.test(arg)) return true;
  if (command === 'curl' && args && (args[index - 1] === '-o' || args[index - 1] === '--output')) {
    return SAFE_ARG_REGEX.test(arg);
  }
  if (
    command === 'curl' &&
    ['-L', '-o', '--location', '--output', '--fail', '--retry', '--retry-delay',
     '--connect-timeout', '--max-time', '--progress-bar'].includes(arg)
  ) return true;
  if (
    command === 'curl' &&
    args &&
    ['--retry', '--retry-delay', '--connect-timeout', '--max-time'].includes(args[index - 1]) &&
    /^\d+$/.test(arg)
  ) return true;

  const isPowerShellCommand =
    command === 'powershell' ||
    command.toLowerCase().includes('powershell.exe') ||
    path.basename(command).toLowerCase() === 'powershell.exe';

  if (isPowerShellCommand) {
    if (SAFE_URL_REGEX.test(arg)) return true;
    if (arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:]+$/)) return true;
    if (
      (arg.includes('Invoke-WebRequest') || arg.includes('Expand-Archive')) &&
      arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:\"'=@+\?\&\[\](){}]+$/)
    ) return true;
    if (arg.match(/^-[a-zA-Z0-9]+$/)) return true;
    if (arg.match(/^\"[^\"]*\"$/) || arg.match(/^'[^']*'$/)) return true;
    if (arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:]+$/)) return true;
    if (commandInfo.allowedArgs && !commandInfo.allowedArgs.has(arg)) return false;
    return false;
  }

  if (commandInfo.allowedArgs && arg.startsWith('-')) {
    return commandInfo.allowedArgs.has(arg);
  }
  if (!SAFE_ARG_REGEX.test(arg)) return false;
  if (command === 'tar' && (arg === '-xzf' || arg === '--strip-components=1')) return true;
  return true;
}

function sanitizeArgs(command, commandInfo, args) {
  if (!Array.isArray(args)) return [];
  const sanitized = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!isSafeArg(command, commandInfo, arg, i, args)) {
      throw new Error(`Blocked execution: unsafe or disallowed arg '${arg}'`);
    }
    sanitized.push(arg);
  }
  return sanitized;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const commandInfo = lookupCommandInfo(command);
    if (!commandInfo) {
      return reject(new Error(`Blocked execution: command '${command}' is not allowed.`));
    }

    let sanitizedArgs;
    try {
      sanitizedArgs = sanitizeArgs(command, commandInfo, args || []);
    } catch (error) {
      return reject(error);
    }

    let finalCommand = commandInfo.path;
    let finalArgs = sanitizedArgs;

    if (isWindows && (commandInfo.path.endsWith('.cmd') || commandInfo.path.endsWith('.bat'))) {
      const safeCmdPaths = [
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\Windows\\SysWOW64\\cmd.exe',
      ];
      let cmdPath = 'cmd.exe';
      for (const safePath of safeCmdPaths) {
        if (fs.existsSync(safePath)) { cmdPath = safePath; break; }
      }
      finalCommand = cmdPath;
      finalArgs = ['/d', '/s', '/c', commandInfo.path, ...sanitizedArgs];
    }

    // Build a clean env from scratch instead of inheriting process.env
    const env = Object.create(null);
    const safeEnv = buildSafeEnv();
    env.PATH = safeEnv.PATH || '';

    // Preserve proxy settings needed for network access
    const proxyVars = ['http_proxy', 'https_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];
    for (const key of proxyVars) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    const sanitizedCommand = getSanitizedCommandPath(finalCommand);
    const proc = spawn(sanitizedCommand.executablePath, finalArgs, {
      stdio: 'inherit',
      shell: false,
      env,
      ...options,
    });

    proc.on('close', (code) => {
      if (code === 0) resolve({ success: true });
      else reject({ success: false, code });
    });
    proc.on('error', (err) => reject({ success: false, error: err }));
  });
}

function checkBuildExists(persona) {
  const { frontend } = resolvePaths({ persona });
  const personaDir = path.join(frontend, `next-${persona.toLowerCase()}`);
  const buildIdFile = path.join(personaDir, 'BUILD_ID');
  if (fs.existsSync(buildIdFile)) {
    const buildId = fs.readFileSync(buildIdFile, 'utf-8').trim();
    console.log(`Build for ${persona} exists. BUILD_ID: ${buildId}`);
    return true;
  }
  return false;
}

function checkDistExists(persona) {
  const { dist, frontend } = resolvePaths({ persona });
  const packageJsonPath = path.join(frontend, 'package.json');
  let packageName = 'university-curriculum-enabling-tool';
  let packageVersion = '';
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      packageName = packageJson.name || packageName;
      packageVersion = packageJson.version || '';
    } catch (error) {
      console.warn(`Failed to parse package.json: ${error.message}.`);
    }
  }
  const versionString = packageVersion ? `-${packageVersion}` : '';
  const distDir =
    persona.toLowerCase() === 'faculty'
      ? path.join(dist, `${packageName}${versionString}`)
      : path.join(dist, `${packageName}${versionString}-${persona}`);
  const zipFile = `${distDir}.zip`;
  return fs.existsSync(distDir) && fs.existsSync(zipFile);
}

export async function buildPersona(persona, force = false) {
  console.log(`Building for persona: ${persona}`);
  const { isDistPackage, frontend, root } = resolvePaths({ persona });
  if (isDistPackage) {
    console.log(`Running in distribution package mode - build is already complete for ${persona}`);
    return { success: true, skipped: true };
  }
  if (!force && checkBuildExists(persona)) {
    console.log(`Build for ${persona} already exists. Use --force to rebuild.`);
    return { success: true, skipped: true };
  }
  try {
    if (isSafeRelativePath(frontend)) {
      process.chdir(fileURLToPath(new URL(`file://${path.resolve(frontend)}`)));
    } else {
      throw new Error(`Unsafe frontend directory detected: ${frontend}`);
    }
    if (!fs.existsSync(path.join(frontend, 'node_modules'))) {
      console.log('Installing frontend dependencies...');
      await spawnCommand(npmCommand, ['install', '--no-progress', '--no-color']);
    }
    let buildCommand;
    switch (persona.toLowerCase()) {
      case 'faculty':   buildCommand = ['run', 'build:faculty',  '--no-progress', '--no-color']; break;
      case 'lecturer':  buildCommand = ['run', 'build:lecturer', '--no-progress', '--no-color']; break;
      case 'student':   buildCommand = ['run', 'build:student',  '--no-progress', '--no-color']; break;
      default: throw new Error(`Unknown persona: ${persona}`);
    }
    console.log(`Running build command: ${npmCommand} ${buildCommand.join(' ')}`);
    await spawnCommand(npmCommand, buildCommand);
    console.log(`Successfully built for persona: ${persona}`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to build for persona ${persona}:`, error);
    return { success: false, error };
  } finally {
    if (isSafeRelativePath(root)) {
      process.chdir(fileURLToPath(new URL(`file://${path.resolve(root)}`)));
    } else {
      console.error(`Unsafe root path detected when attempting to build persona: ${root}`);
    }
  }
}

export async function createDistPackage(persona, force = false) {
  console.log(`\n=== Creating Distribution Package ===`);
  console.log(`Persona: ${persona}`);
  console.log(`Force rebuild: ${force}`);

  const safePersona = getPersonaFromKey(persona);
  const { isDistPackage, isRootRepo, root } = resolvePaths({ safePersona });

  if (isDistPackage) {
    console.log(`✓ Running in distribution package mode - package creation skipped for ${safePersona}`);
    return { success: true, skipped: true };
  }
  if (!isRootRepo && !force) {
    console.log(`✓ Not running from root repository - skipping package creation for ${safePersona}`);
    return { success: true, skipped: true };
  }
  if (!force && checkDistExists(safePersona)) {
    console.log(`✓ Distribution package for ${safePersona} already exists. Use --force to recreate.`);
    return { success: true, skipped: true };
  }

  try {
    console.log(`\n[1/12] Building persona ${safePersona}...`);
    const buildResult = await buildPersona(safePersona, force);
    if (!buildResult.success) {
      throw new Error(`Build failed for persona ${safePersona}`);
    }

    console.log(`[2/12] Resolving paths for ${safePersona}...`);
    const { frontend, backend, dist, ecosystem } = resolvePaths({ safePersona });

    console.log(`[3/12] Reading package information...`);
    const packageJsonPath = path.join(frontend, 'package.json');
    let packageName = 'university-curriculum-enabling-tool';
    let packageVersion = '';
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName = packageJson.name || packageName;
        packageVersion = packageJson.version || '';
        console.log(`Using package name: ${packageName}, version: ${packageVersion}`);
      } catch (error) {
        console.warn(`Failed to parse package.json: ${error.message}.`);
      }
    }

    const versionString = packageVersion ? `-${packageVersion}` : '';
    const distDir = persona.toLowerCase() === 'faculty'
      ? path.join(dist, `${packageName}${versionString}`)
      : path.join(dist, `${packageName}${versionString}-${safePersona}`);
    const zipFile = `${distDir}.zip`;

    console.log(`Step 4: Preparing distribution directory structure...`);
    if (force) {
      console.log(`Step 5: Cleaning up existing distribution package...`);
      if (fs.existsSync(distDir)) {
        fs.removeSync(distDir);
        console.log(`Removed existing distDir: ${distDir}`);
      }
      if (fs.existsSync(zipFile)) {
        fs.removeSync(zipFile);
        console.log(`Removed existing zip: ${zipFile}`);
      }
    }

    fs.mkdirSync(distDir, { recursive: true });

    console.log(`Step 4.1: Copying thirdparty dependencies...`);
    fs.mkdirSync(path.join(distDir, 'thirdparty'), { recursive: true });

    const sourceNodeDir = path.join(root, 'thirdparty', 'node');
    if (fs.existsSync(sourceNodeDir)) {
      console.log(`Copying Node.js from ${sourceNodeDir}...`);
      const targetNodeDir = path.join(distDir, 'thirdparty', 'node');
      if (isWindows) {
        try {
          const robocopyArgs = [
            sourceNodeDir, targetNodeDir,
            '/E', '/R:3', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
          ];
          const robocopyResult = spawnSync('robocopy', robocopyArgs, {
            stdio: ['ignore', 'ignore', 'pipe'],
            encoding: 'utf8',
            timeout: 60000,
          });
          if ((robocopyResult.status || 0) >= 8) {
            fs.copySync(sourceNodeDir, targetNodeDir);
          }
        } catch (_) {
          fs.copySync(sourceNodeDir, targetNodeDir);
        }
      } else {
        fs.copySync(sourceNodeDir, targetNodeDir);
      }
    } else {
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'node'), { recursive: true });
    }

    const sourceJqDir = path.join(root, 'thirdparty', 'jq');
    if (fs.existsSync(sourceJqDir)) {
      fs.copySync(sourceJqDir, path.join(distDir, 'thirdparty', 'jq'));
    } else {
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'jq'), { recursive: true });
    }

    const sourceOllamaDir = path.join(root, 'thirdparty', 'ollama');
    if (fs.existsSync(sourceOllamaDir)) {
      fs.copySync(sourceOllamaDir, path.join(distDir, 'thirdparty', 'ollama'));
    } else {
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'ollama'), { recursive: true });
    }

    if (safePersona.toLowerCase() === 'faculty') {
      console.log(`Step 6: Creating assets directory structure for faculty...`);
      const personasDir = path.join(distDir, 'assets', 'deployment', 'personas');
      fs.mkdirSync(path.join(personasDir, 'lecturer'), { recursive: true });
      fs.mkdirSync(path.join(personasDir, 'student'), { recursive: true });
    }

    console.log(`Step 7: Copying Next.js build for ${safePersona}...`);
    const nextPersonaDir = path.join(frontend, `next-${safePersona.toLowerCase()}`);
    if (!fs.existsSync(nextPersonaDir)) {
      throw new Error(`Next.js build directory for persona '${persona}' not found at ${nextPersonaDir}`);
    }
    const distNextDir = path.join(distDir, `next-${safePersona.toLowerCase()}`);
    fs.mkdirSync(path.join(distNextDir, 'standalone'), { recursive: true });

    const standaloneDir = path.join(nextPersonaDir, 'standalone');
    if (!fs.existsSync(standaloneDir)) {
      throw new Error(`Next.js standalone build directory not found at ${standaloneDir}`);
    }
    const personaStandaloneDir = path.join(standaloneDir, `next-${safePersona.toLowerCase()}`);
    if (!fs.existsSync(personaStandaloneDir)) {
      throw new Error(`Standalone directory for persona '${safePersona}' not found at ${personaStandaloneDir}`);
    }
    fs.copySync(
      personaStandaloneDir,
      path.join(distNextDir, 'standalone', `next-${safePersona.toLowerCase()}`),
      { dereference: true }
    );

    const entries = fs.readdirSync(standaloneDir);
    for (const entry of entries) {
      const entryPath = path.join(standaloneDir, entry);
      if (
        entry.startsWith('next-') &&
        entry !== `next-${safePersona.toLowerCase()}` &&
        fs.statSync(entryPath).isDirectory()
      ) continue;
      if (entry === `next-${safePersona.toLowerCase()}`) continue;
      fs.copySync(entryPath, path.join(distNextDir, 'standalone', entry)),
      { dereference: true }
    }

    const staticDir = path.join(nextPersonaDir, 'static');
    if (fs.existsSync(staticDir)) {
      fs.copySync(
        staticDir,
        path.join(distNextDir, 'standalone', `next-${safePersona.toLowerCase()}`, 'static')
      ),
      { dereference: true }
    }

    const scriptsToInclude = [
      'setup.sh', 'install.sh', 'run.sh', 'stop.sh', 'uninstall.sh',
      'setup_win.bat', 'install_win.bat', 'run_win.bat', 'stop_win.bat', 'uninstall_win.bat',
      'setup.ps1', 'install.ps1', 'run.ps1', 'stop.ps1', 'uninstall.ps1',
    ];

    // Step 7.1: Copy sharp to correct location for Windows
    if (isWindows) {
      console.log('Step 7.1: Fixing sharp native module for Windows...');
      const standaloneDir = path.join(distNextDir, 'standalone');
      const standaloneNodeModules = path.join(standaloneDir, 'node_modules', '@img');
      const personaNodeModules = path.join(standaloneDir, `next-${safePersona.toLowerCase()}`, 'node_modules', '@img');

      const linuxNativeDirs = [
        '@img/sharp-linux-x64',
        '@img/sharp-linux-arm64',
        '@img/sharp-libvips-linux-x64',
        '@img/sharp-libvips-linux-arm64',
      ];
      for (const dir of linuxNativeDirs) {
        const dirPath = path.join(standaloneDir, 'node_modules', dir);
        if (fs.existsSync(dirPath)) {
          fs.removeSync(dirPath);
          console.log(`Removed Linux binary: ${dir}`);
        }
      }

      const sharpSrc = path.join(standaloneNodeModules, 'sharp-win32-x64');
      if (fs.existsSync(sharpSrc)) {
        fs.mkdirSync(personaNodeModules, { recursive: true });
        fs.copySync(sharpSrc, path.join(personaNodeModules, 'sharp-win32-x64'), { dereference: true });
        console.log('sharp-win32-x64 copied to correct Next.js location.');
      } else {
        console.log('sharp-win32-x64 not found in standalone\\node_modules, will be installed at install time.');
      }
    }

    if (safePersona.toLowerCase() === 'faculty') {
      console.log(`Step 8: Populating deployment assets for other personas...`);
      const personasDir = path.join(distDir, 'assets', 'deployment', 'personas');
      const otherPersonas = ['lecturer', 'student'];

      for (const otherPersona of otherPersonas) {
        console.log(`Step 8.1: Setting up deployment files for ${otherPersona} persona...`);
        const personaDir = path.join(personasDir, otherPersona);

        console.log(`Step 8.2: Copying scripts for ${otherPersona} persona...`);
        for (const script of scriptsToInclude) {
          const sourcePath = path.join(root, script);
          if (fs.existsSync(sourcePath)) {
            fs.copySync(sourcePath, path.join(personaDir, script));
            if (!isWindows && script.endsWith('.sh')) {
              fs.chmodSync(path.join(personaDir, script), '755');
            }
          }
        }

        console.log(`Step 8.3: Creating version file for ${otherPersona} persona...`);
        const date = new Date().toISOString().split('T')[0];
        fs.writeFileSync(
          path.join(personaDir, '.version'),
          `${date}-${otherPersona.toLowerCase()}`
        );

        console.log(`Step 8.4: Creating scripts directory for ${otherPersona} persona...`);
        fs.mkdirSync(path.join(personaDir, 'scripts'), { recursive: true });
        fs.copySync(__dirname, path.join(personaDir, 'scripts'));

        console.log(`Step 8.5: Creating backend directory for ${otherPersona} persona...`);
        const backendDest = path.join(personaDir, 'backend');
        fs.mkdirSync(backendDest, { recursive: true });
        if (isSafeRelativePath(backendDest)) {
          fs.copySync(
            fileURLToPath(new URL(`file://${path.resolve(backend)}`)),
            fileURLToPath(new URL(`file://${path.resolve(backendDest)}`))
          );
        } else {
          console.warn(`Refused to copy backend to unsafe path: ${backendDest}`);
        }

        console.log(`Step 8.6: Creating supporting directories for ${otherPersona} persona...`);
        fs.mkdirSync(path.join(personaDir, 'thirdparty'), { recursive: true });

        console.log(`Step 8.7: Creating Next.js directories for ${otherPersona} persona...`);
        const personaNextDir = path.join(personaDir, `next-${otherPersona.toLowerCase()}`);
        fs.mkdirSync(
          path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`),
          { recursive: true }
        );

        console.log(`Step 8.8: Copying Next.js build for ${otherPersona} persona...`);
        const sourceNextPersonaDir = path.join(frontend, `next-${otherPersona.toLowerCase()}`);
        if (fs.existsSync(sourceNextPersonaDir)) {
          const sourceStandaloneDir = path.join(sourceNextPersonaDir, 'standalone');
          if (fs.existsSync(sourceStandaloneDir)) {
            const sourcePersonaStandaloneDir = path.join(
              sourceStandaloneDir,
              `next-${otherPersona.toLowerCase()}`
            );
            if (fs.existsSync(sourcePersonaStandaloneDir)) {
              fs.copySync(
                sourcePersonaStandaloneDir,
                path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`),
                { dereference: true }
              );
              const standaloneEntries = fs.readdirSync(sourceStandaloneDir);
              for (const entry of standaloneEntries) {
                const entryPath = path.join(sourceStandaloneDir, entry);
                if (
                  entry.startsWith('next-') &&
                  entry !== `next-${otherPersona.toLowerCase()}` &&
                  fs.statSync(entryPath).isDirectory()
                ) continue;
                if (entry === `next-${otherPersona.toLowerCase()}`) continue;
                fs.copySync(entryPath, path.join(personaNextDir, 'standalone', entry)),
                { dereference: true }
              }
            } else {
              console.warn(`Standalone dir for '${otherPersona}' not found, copying full standalone`);
              fs.copySync(sourceStandaloneDir, path.join(personaNextDir, 'standalone')),
               { dereference: true }
            }
          }
          const sourceStaticDir = path.join(sourceNextPersonaDir, 'static');
          if (fs.existsSync(sourceStaticDir)) {
            fs.copySync(
              sourceStaticDir,
              path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`, 'static')
            ),
             { dereference: true }
          }
        } else {
          console.warn(`No Next.js build found for ${otherPersona} at ${sourceNextPersonaDir}`);
        }

        console.log(`Step 8.9: Setting up ecosystem config for ${otherPersona} persona...`);
        if (fs.existsSync(ecosystem)) {
          const ecosystemDestPath = path.join(personaDir, 'ecosystem.config.cjs');
          fs.copySync(ecosystem, ecosystemDestPath);
          try {
            let ecosystemContent = fs.readFileSync(ecosystemDestPath, 'utf8');
            ecosystemContent = ecosystemContent.replace(
              /const persona = process\.env\.PERSONA \|\| ['"]faculty['"]/g,
              `const persona = process.env.PERSONA || '${otherPersona}'`
            );
            fs.writeFileSync(ecosystemDestPath, ecosystemContent);
          } catch (err) {
            console.warn(`Failed to update ecosystem config for ${otherPersona}: ${err.message}`);
          }
        }

        console.log(`Step 8.10: Creating environment template for ${otherPersona} persona...`);
        const rootEnvTemplateFile = path.join(ROOT_DIR, '.env.template');
        if (fs.existsSync(rootEnvTemplateFile)) {
          let envContent = fs.readFileSync(rootEnvTemplateFile, 'utf8');
          if (!/^PERSONA=/m.test(envContent)) {
            envContent =
              "# =============================================\n" +
              "# Persona Configuration\n" +
              "# =============================================\n" +
              `PERSONA=${otherPersona}             # Default persona for this deployment\n\n` +
              envContent;
          } else {
            envContent = envContent.replace(
              /^PERSONA=.*$/m,
              `PERSONA=${otherPersona}             # Default persona for this deployment`
            );
          }
          fs.writeFileSync(path.join(personaDir, '.env.template'), envContent);
        }

        console.log(`Step 8.11: Updating all scripts for ${otherPersona} persona...`);
        for (const script of scriptsToInclude) {
          const scriptPath = path.join(personaDir, script);
          if (!fs.existsSync(scriptPath)) continue;
          try {
            let scriptContent = fs.readFileSync(scriptPath, 'utf8');
            if (script.endsWith('.sh')) {
              scriptContent = scriptContent.replace(
                /PERSONA=\${1:-faculty}/g,
                `PERSONA=\${1:-${otherPersona}}`
              );
            } else if (script.endsWith('.bat')) {
              scriptContent = scriptContent
                .replace(/set "Persona=faculty"/g, `set "Persona=${otherPersona}"`)
                .replace(
                  /if "%Persona%"=="" set "Persona=faculty"/g,
                  `if "%Persona%"=="" set "Persona=${otherPersona}"`
                )
                .replace(
                  /if "%PERSONA%"=="" set PERSONA=faculty/g,
                  `if "%PERSONA%"=="" set PERSONA=${otherPersona}`
                );
            } else if (script.endsWith('.ps1')) {
              scriptContent = scriptContent
                .replace(
                  /\$Persona = if \(\$args\[0\]\) \{ \$args\[0\] \} else \{ "faculty" \}/g,
                  `$Persona = if ($args[0]) { $args[0] } else { "${otherPersona}" }`
                )
                .replace(
                  /Write-Host "No persona indicators found, defaulting to faculty"\s*"faculty"/g,
                  `Write-Host "No persona indicators found, defaulting to ${otherPersona}"\n            "${otherPersona}"`
                )
                .replace(
                  /} else \{\s*Write-Host "No persona indicators found, defaulting to faculty"\s*"faculty"\s*\}/g,
                  `} else {\n            Write-Host "No persona indicators found, defaulting to ${otherPersona}"\n            "${otherPersona}"\n        }`
                );
            }
            fs.writeFileSync(scriptPath, scriptContent);
          } catch (err) {
            console.warn(`Failed to update ${script} for ${otherPersona}: ${err.message}`);
          }
        }
      }
    }

    console.log(`Step 9: Creating environment template...`);
    const rootEnvTemplateFile = path.join(ROOT_DIR, '.env.template');
    if (fs.existsSync(rootEnvTemplateFile)) {
      let envContent = fs.readFileSync(rootEnvTemplateFile, 'utf8');
      if (!/^PERSONA=/m.test(envContent)) {
        envContent =
          "# =============================================\n" +
          "# Persona Configuration\n" +
          "# =============================================\n" +
          `PERSONA=${safePersona}             # Default persona for this deployment\n\n` +
          envContent;
      } else {
        envContent = envContent.replace(
          /^PERSONA=.*$/m,
          `PERSONA=${safePersona}             # Default persona for this deployment`
        );
      }
      fs.writeFileSync(path.join(distDir, '.env.template'), envContent);
    }

    console.log(`Step 10: Copying backend, scripts and configuration files...`);
    fs.copySync(backend, path.join(distDir, 'backend'));
    fs.copySync(__dirname, path.join(distDir, 'scripts'));

    for (const script of scriptsToInclude) {
      const sourcePath = path.join(root, script);
      if (fs.existsSync(sourcePath)) {
        fs.copySync(sourcePath, path.join(distDir, script));
      }
    }

    if (fs.existsSync(ecosystem)) {
      fs.copySync(ecosystem, path.join(distDir, 'ecosystem.config.cjs'));
    }

    console.log(`Step 10.1: Updating main distribution package scripts for ${safePersona} persona...`);
    for (const script of scriptsToInclude) {
      const scriptPath = path.join(distDir, script);
      if (!fs.existsSync(scriptPath)) continue;
      try {
        let scriptContent = fs.readFileSync(scriptPath, 'utf8');
        if (script.endsWith('.sh')) {
          scriptContent = scriptContent.replace(
            /PERSONA=\${1:-faculty}/g,
            `PERSONA=\${1:-${safePersona}}`
          );
        } else if (script.endsWith('.bat')) {
          scriptContent = scriptContent
            .replace(/set "Persona=faculty"/g, `set "Persona=${safePersona}"`)
            .replace(
              /if "%Persona%"=="" set "Persona=faculty"/g,
              `if "%Persona%"=="" set "Persona=${safePersona}"`
            )
            .replace(
              /if "%PERSONA%"=="" set PERSONA=faculty/g,
              `if "%PERSONA%"=="" set PERSONA=${safePersona}`
            );
        } else if (script.endsWith('.ps1')) {
          scriptContent = scriptContent
            .replace(
              /\$Persona = if \(\$args\[0\]\) \{ \$args\[0\] \} else \{ "faculty" \}/g,
              `$Persona = if ($args[0]) { $args[0] } else { "${safePersona}" }`
            )
            .replace(/"faculty"/g, `"${safePersona}"`);
        }
        fs.writeFileSync(scriptPath, scriptContent);
      } catch (err) {
        console.warn(`Failed to update ${script}: ${err.message}`);
      }
    }

    console.log(`Step 11: Creating version file...`);
    const date = new Date().toISOString().split('T')[0];
    const version = `${date}-${safePersona.toLowerCase()}`;
    fs.writeFileSync(path.join(distDir, '.version'), version);

    if (!fs.existsSync(path.join(distDir, '.version'))) {
      throw new Error('Failed to create .version file in distribution package');
    }

    if (!isWindows) {
      for (const script of scriptsToInclude.filter(s => s.endsWith('.sh'))) {
        const scriptPath = path.join(distDir, script);
        if (fs.existsSync(scriptPath)) {
          fs.chmodSync(scriptPath, '755');
        }
      }
    }

    console.log(`Step 12: Creating zip archive...`);
    await createZipArchive(distDir, zipFile);

    console.log(`Successfully created distribution package for persona: ${safePersona}`);
    console.log(`Distribution directory: ${distDir}`);
    console.log(`Zip file: ${zipFile}`);

    return { success: true, distDir, zipFile };
  } catch (error) {
    console.error(`Failed to create distribution package for persona ${safePersona}:`, error);
    return { success: false, error };
  }
}

async function createZipArchive(sourceDir, outputZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => {
      console.log(`Archive created: ${outputZip} (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on('error', (err) => reject(err));
    const dirName = path.basename(sourceDir);
    archive.pipe(output);
    archive.directory(sourceDir, dirName);
    archive.finalize();
  });
}

export async function setupBackend(force = false) {
  console.log('Setting up backend environment...');
  const { venv, backend, root } = resolvePaths();
  const backendPath = backend;
  const venvPath = venv;

  if (!force && fs.existsSync(venvPath)) {
    console.log('Backend environment already exists. Use --force to recreate.');
    return { success: true };
  }

  try {
    if (isSafeRelativePath(venvPath)) {
      fs.removeSync(path.resolve(ROOT_DIR, venvPath));
    } else {
      throw new Error('Venv path is invalid');
    }

    const venvParentDir = path.dirname(venvPath);
    if (!fs.existsSync(venvParentDir)) fs.mkdirSync(venvParentDir, { recursive: true });

    process.chdir(backendPath);

    const pythonCmd = getDynamicPythonCommand();
    console.log(`Using Python command: ${pythonCmd}`);

    try {
      const result = spawnSync(pythonCmd, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Python version check failed`);
    } catch (error) {
      console.error(`Python not found: ${error.message}`);
      return { success: false, error: new Error('Python not available.') };
    }

    console.log('Creating Python virtual environment...');
    let venvCreated = false;

    try {
      await spawnCommand(pythonCmd, ['-m', 'venv', 'venv']);
      venvCreated = true;
      console.log('Virtual environment created successfully.');
    } catch (err) {
      console.warn(`Standard venv failed (code: ${err.code}), trying --copies...`);
    }

    if (!venvCreated) {
      try {
        await spawnCommand(pythonCmd, ['-m', 'venv', '--copies', 'venv']);
        venvCreated = true;
        console.log('Virtual environment created with --copies flag.');
      } catch (err) {
        console.warn(`Venv --copies failed (code: ${err.code}), trying --without-pip...`);
      }
    }

    if (!venvCreated) {
      console.log('Creating venv without pip, will bootstrap manually...');
      await spawnCommand(pythonCmd, ['-m', 'venv', '--without-pip', 'venv']);

      const venvPythonPath = path.join(venvPath, 'bin', 'python');
      const getPipScript = path.join(venvPath, 'get-pip.py');

      console.log('Downloading get-pip.py...');
      await spawnCommand('curl', [
        '--fail', '--location', '--retry', '3', '--retry-delay', '5',
        '--connect-timeout', '30', '--max-time', '120',
        '--output', getPipScript,
        'https://bootstrap.pypa.io/get-pip.py',
      ]);

      console.log('Bootstrapping pip into virtual environment...');
      await new Promise((resolve, reject) => {
        const proc = spawn(venvPythonPath, [getPipScript], {
          stdio: 'inherit',
          shell: false,
        });
        proc.on('close', (code) => {
          if (code === 0) resolve({ success: true });
          else reject({ success: false, code });
        });
        proc.on('error', (err) => reject({ success: false, error: err }));
      });

      if (fs.existsSync(getPipScript)) fs.unlinkSync(getPipScript);
      venvCreated = true;
      console.log('Virtual environment created with manual pip bootstrap.');
    }

    console.log('Installing Python dependencies...');
    const pipCommand = isWindows
      ? path.join(venvPath, 'Scripts', 'pip.exe')
      : path.join(venvPath, 'bin', 'pip');
    await spawnCommand(pipCommand, ['install', '-r', 'requirements.txt']);

    console.log('Backend environment setup completed successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to setup backend environment:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function startBackend() {
  console.log('Starting backend server...');
  const { venv, backend, root } = resolvePaths();
  const backendPath = backend;
  const venvPath = venv;

  if (!fs.existsSync(venvPath)) {
    console.log('Backend environment not found. Setting up...');
    const setupResult = await setupBackend(false);
    if (!setupResult.success) throw new Error('Failed to setup backend environment');
  }

  try {
    const venvPythonPath = isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');

    const namespace = getProcessManagerNamespace();

    console.log('Starting backend with process manager...');
    const result = await startProcess({
      name: 'backend',
      script: path.join(backendPath, 'main.py'),
      interpreter: venvPythonPath,
      cwd: backendPath,
      namespace,
      env: { ...process.env },
    });

    if (!result.success) throw new Error(result.error || 'Failed to start backend');

    console.log('Backend server started successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start backend server:', error);
    return { success: false, error };
  }
}

async function getUbuntuMajorVersion() {
  try {
    const osReleasePath = '/etc/os-release';
    if (fs.existsSync(osReleasePath)) {
      const content = fs.readFileSync(osReleasePath, 'utf8');
      const match = content.match(/VERSION_ID="?(\d+)\.?\d*"?/);
      if (match) return match[1];
    }
  } catch (error) {
    console.error('Error detecting Ubuntu version:', error.message);
    throw error;
  }
}

export async function setupOvms(force = false) {
  console.log('Setting up OpenVINO Model Server (OVMS)...');
  const { thirdparty, ovms, ovmsVenv, ovmsBackend, root } = resolvePaths();
  const ovmsPath = ovms;
  const ovmsBackendPath = ovmsBackend;
  const venvPath = ovmsVenv;

  try {
    const version = readEnvVariable('OVMS_VERSION', 'v2025.3.0');
    const archiveExtension = isWindows ? 'zip' : 'tar.gz';
    let ovmsDownloadUrl = null;
    let ovmsArchive = null;

    if (!isWindows) {
      const majorVersion = await getUbuntuMajorVersion();
      if (majorVersion == '22' || majorVersion == '24') {
        ovmsArchive = `ovms_ubuntu${majorVersion}_python_on.${archiveExtension}`;
        ovmsDownloadUrl = `https://github.com/openvinotoolkit/model_server/releases/download/${version}/${ovmsArchive}`;
      } else {
        throw new Error(`OVMS on Ubuntu ${majorVersion} is not supported.`);
      }
    } else {
      ovmsArchive = `ovms_windows_python_on.${archiveExtension}`;
      ovmsDownloadUrl = `https://github.com/openvinotoolkit/model_server/releases/download/${version}/${ovmsArchive}`;
    }

    const ovmsParentDir = path.dirname(ovmsPath);
    if (!fs.existsSync(ovmsParentDir)) fs.mkdirSync(ovmsParentDir, { recursive: true });
    if (!fs.existsSync(ovmsPath)) fs.mkdirSync(ovmsPath, { recursive: true });

    process.chdir(ovmsPath);

    const ovmsBinPath = isWindows
      ? path.join(ovmsPath, 'ovms.exe')
      : path.join(ovmsPath, 'bin', 'ovms');

    if (fs.existsSync(ovmsBinPath)) {
      console.log('OVMS is already downloaded and extracted. Skipping download.');
      return { success: true };
    }

    console.log(`Downloading OVMS from ${ovmsDownloadUrl}...`);

    if (isWindows) {
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      await spawnCommand(powerShellPath, [
        '-Command',
        `Invoke-WebRequest -Uri "${ovmsDownloadUrl}" -OutFile "${ovmsArchive}" -UseBasicParsing -TimeoutSec 600`,
      ], { timeout: 650000 });
    } else {
      await spawnCommand('curl', [
        '--fail', '--location', '--retry', '5', '--retry-delay', '10',
        '--connect-timeout', '60', '--max-time', '600',
        '--progress-bar', '--output', ovmsArchive, ovmsDownloadUrl,
      ], { timeout: 650000 });
    }

    if (isWindows) {
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      await spawnCommand(powerShellPath, ['-Command', `Expand-Archive -Path "${ovmsArchive}" -DestinationPath "." -Force`]);
      try {
        const nestedDir = path.join(ovmsPath, 'ovms');
        if (fs.existsSync(nestedDir) && fs.statSync(nestedDir).isDirectory()) {
          const items = fs.readdirSync(nestedDir);
          for (const item of items) {
            fs.moveSync(path.join(nestedDir, item), path.join(ovmsPath, item), { overwrite: true });
          }
          fs.removeSync(nestedDir);
        }
      } catch (err) {
        console.warn(`OVMS normalization warning: ${err.message}`);
      }
    } else {
      await spawnCommand('tar', ['-xzf', ovmsArchive, '--strip-components=1']);
      if (!fs.existsSync('bin/ovms')) throw new Error('OVMS binary not found after extraction');
    }

    if (fs.existsSync(ovmsArchive)) fs.unlinkSync(ovmsArchive);

    console.log('Setting up OVMS backend environment...');
    if (!force && fs.existsSync(venvPath)) {
      console.log('OVMS venv already exists.');
      return { success: true };
    }

    try {
      if (isSafeRelativePath(venvPath)) {
        fs.removeSync(path.resolve(ROOT_DIR, venvPath));
      } else {
        throw new Error('Venv path is invalid');
      }

      const venvParentDir = path.dirname(venvPath);
      if (!fs.existsSync(venvParentDir)) fs.mkdirSync(venvParentDir, { recursive: true });

      process.chdir(ovmsBackendPath);

      const pythonCmd = getDynamicPythonCommand();
      const verifyResult = spawnSync(pythonCmd, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
      if (verifyResult.status !== 0) {
        return { success: false, error: new Error('Python not available.') };
      }

      console.log('Creating OVMS virtual environment...');
      let venvCreated = false;

      try {
        await spawnCommand(pythonCmd, ['-m', 'venv', 'venv']);
        venvCreated = true;
        console.log('OVMS virtual environment created successfully.');
      } catch (err) {
        console.warn(`Standard venv failed (code: ${err.code}), trying --copies...`);
      }

      if (!venvCreated) {
        try {
          await spawnCommand(pythonCmd, ['-m', 'venv', '--copies', 'venv']);
          venvCreated = true;
          console.log('OVMS virtual environment created with --copies flag.');
        } catch (err) {
          console.warn(`Venv --copies failed (code: ${err.code}), trying --without-pip...`);
        }
      }

      if (!venvCreated) {
        console.log('Creating OVMS venv without pip, will bootstrap manually...');
        await spawnCommand(pythonCmd, ['-m', 'venv', '--without-pip', 'venv']);

        const venvPythonPath = path.join(venvPath, 'bin', 'python');
        const getPipScript = path.join(venvPath, 'get-pip.py');

        console.log('Downloading get-pip.py for OVMS venv...');
        await spawnCommand('curl', [
          '--fail', '--location', '--retry', '3', '--retry-delay', '5',
          '--connect-timeout', '30', '--max-time', '120',
          '--output', getPipScript,
          'https://bootstrap.pypa.io/get-pip.py',
        ]);

        console.log('Bootstrapping pip into OVMS virtual environment...');
        await new Promise((resolve, reject) => {
          const proc = spawn(venvPythonPath, [getPipScript], {
            stdio: 'inherit',
            shell: false,
          });
          proc.on('close', (code) => {
            if (code === 0) resolve({ success: true });
            else reject({ success: false, code });
          });
          proc.on('error', (err) => reject({ success: false, error: err }));
        });

        if (fs.existsSync(getPipScript)) fs.unlinkSync(getPipScript);
        venvCreated = true;
        console.log('OVMS virtual environment created with manual pip bootstrap.');
      }

      const pipCommand = isWindows
        ? path.join(venvPath, 'Scripts', 'pip.exe')
        : path.join(venvPath, 'bin', 'pip');
      await spawnCommand(pipCommand, ['install', '-r', 'requirements.txt']);

      console.log('OVMS backend environment setup completed.');
      return { success: true };
    } catch (error) {
      console.error('Failed to setup OVMS backend environment:', error);
      return { success: false, error };
    } finally {
      process.chdir(root);
    }
  } catch (error) {
    console.error('Failed to setup OVMS:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function startOvms() {
  console.log('Starting OpenVINO Model Server (OVMS)...');
  const { ovms, ovmsBackend, ovmsVenv, root } = resolvePaths();
  const ovmsPath = ovms;
  const ovmsBackendPath = ovmsBackend;
  const venvPath = ovmsVenv;

  if (!fs.existsSync(ovmsPath)) {
    const setupResult = await setupOvms(false);
    if (!setupResult.success) throw new Error('Failed to setup OVMS');
  }
  if (!fs.existsSync(venvPath)) {
    const setupResult = await setupOvms(false);
    if (!setupResult.success) throw new Error('Failed to setup OVMS backend environment');
  }

  try {
    const envVars = getOvmsEnvironmentVariables(root);
    const venvPythonPath = isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');

    const ovmsPort = parsePortFromProviderHost(envVars.PROVIDER_HOST, 5950);
    const namespace = getProcessManagerNamespace();

    const scriptArgs = ['--port', String(ovmsPort)];
    if (envVars.OVMS_LOG_LEVEL) {
      scriptArgs.push('--log-level', envVars.OVMS_LOG_LEVEL);
    }

    console.log('Starting OVMS backend service with process manager...');
    const result = await startProcess({
      name: 'ovms',
      script: path.join(ovmsBackendPath, 'ovms_start.py'),
      interpreter: venvPythonPath,
      args: scriptArgs,
      cwd: ovmsBackendPath,
      namespace,
      env: { ...process.env, ...envVars },
    });

    if (!result.success) throw new Error(result.error || 'Failed to start OVMS');

    console.log('OVMS started successfully.');
    console.log(`OVMS REST API available at: http://${envVars.PROVIDER_HOST}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to start OVMS:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function setupOllama(force = false) {
  console.log('Setting up Ollama...');
  const { thirdparty, ollama, root } = resolvePaths();
  const ollamaPath = ollama;

  try {
    const version = readEnvVariable('OLLAMA_VERSION', '2.2.0');
    const archiveExtension = isWindows ? 'zip' : 'tgz';
    const ollamaArchive = `ollama-ipex-llm-${version}-${isWindows ? 'win' : 'ubuntu'}.${archiveExtension}`;
    const ollamaDownloadUrl = `https://github.com/ipex-llm/ipex-llm/releases/download/v${version}/${ollamaArchive}`;

    const ollamaParentDir = path.dirname(ollamaPath);
    if (!fs.existsSync(ollamaParentDir)) fs.mkdirSync(ollamaParentDir, { recursive: true });
    if (!fs.existsSync(ollamaPath)) fs.mkdirSync(ollamaPath, { recursive: true });

    process.chdir(ollamaPath);

    const ollamaBinPath = isWindows
      ? path.join(ollamaPath, 'ollama.exe')
      : path.join(ollamaPath, 'ollama');
    const startScriptPath = isWindows
      ? path.join(ollamaPath, 'ollama.exe')
      : path.join(ollamaPath, 'start-ollama.sh');

    if (fs.existsSync(ollamaBinPath) && fs.existsSync(startScriptPath)) {
      console.log('Ollama is already downloaded and extracted. Skipping download.');
      if (!isWindows) {
        await spawnCommand('chmod', ['+x', ollamaBinPath]);
        await spawnCommand('chmod', ['+x', startScriptPath]);
      }
      return { success: true };
    }

    console.log(`Downloading Ollama from ${ollamaDownloadUrl}...`);

    if (isWindows) {
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      await spawnCommand(powerShellPath, [
        '-Command',
        `Invoke-WebRequest -Uri "${ollamaDownloadUrl}" -OutFile "${ollamaArchive}" -UseBasicParsing -TimeoutSec 600`,
      ], { timeout: 650000 });
    } else {
      await spawnCommand('curl', [
        '--fail', '--location', '--retry', '5', '--retry-delay', '10',
        '--connect-timeout', '60', '--max-time', '600',
        '--progress-bar', '--output', ollamaArchive, ollamaDownloadUrl,
      ], { timeout: 650000 });
    }

    if (isWindows) {
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      await spawnCommand(powerShellPath, ['-Command', `Expand-Archive -Path "${ollamaArchive}" -DestinationPath "." -Force`]);
      if (fs.existsSync(ollamaArchive)) fs.unlinkSync(ollamaArchive);

      const ollamaServeBatPath = path.join(ollamaPath, 'ollama-serve.bat');
      if (fs.existsSync(ollamaServeBatPath)) {
        const envVars = getOllamaEnvironmentVariables(root);
        const providerHost = envVars.PROVIDER_HOST || '127.0.0.1:5950';
        let batchContent = fs.readFileSync(ollamaServeBatPath, 'utf8');
        if (!batchContent.includes('OLLAMA_HOST')) {
          batchContent = batchContent.replace(/@echo off/i, `@echo off\r\nset OLLAMA_HOST=${providerHost}\r\n`);
          fs.writeFileSync(ollamaServeBatPath, batchContent, 'utf8');
        }
      }
    } else {
      await spawnCommand('tar', ['-xzf', ollamaArchive, '--strip-components=1']);
      if (!fs.existsSync('ollama')) throw new Error('Ollama binary not found after extraction');
      await spawnCommand('chmod', ['+x', 'ollama']);

      if (!fs.existsSync('start-ollama.sh')) {
        throw new Error('start-ollama.sh script not found after extraction.');
      }
      await spawnCommand('chmod', ['+x', 'start-ollama.sh']);

      const envVars = getOllamaEnvironmentVariables(root);
      const providerHost = envVars.PROVIDER_HOST || '127.0.0.1:5950';
      let scriptContent = fs.readFileSync('start-ollama.sh', 'utf8');
      if (!scriptContent.includes('OLLAMA_HOST')) {
        scriptContent = scriptContent.replace(/\.\/ollama serve/, `export OLLAMA_HOST=${providerHost}\n./ollama serve`);
        fs.writeFileSync('start-ollama.sh', scriptContent, 'utf8');
      }

      if (fs.existsSync(ollamaArchive)) fs.unlinkSync(ollamaArchive);
    }

    console.log('Ollama setup completed successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to setup Ollama:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function startOllama() {
  console.log('Starting Ollama...');
  const { ollama, root } = resolvePaths();
  const ollamaPath = ollama;

  if (!fs.existsSync(ollamaPath)) {
    const setupResult = await setupOllama(false);
    if (!setupResult.success) throw new Error('Failed to setup Ollama');
  }

  try {
    process.chdir(ollamaPath);
    const envVars = getOllamaEnvironmentVariables(root);
    const namespace = getProcessManagerNamespace();

    if (isWindows) {
      console.log('Starting Ollama with process manager on Windows...');
      const result = await startProcess({
        name: 'ollama',
        script: path.join(ollamaPath, 'ollama.exe'),
        args: ['serve'],
        cwd: ollamaPath,
        namespace,
        env: { ...process.env, ...envVars },
      });
      if (!result.success) throw new Error(result.error || 'Failed to start Ollama');
    } else {
      const startOllamaScriptPath = path.join(ollamaPath, 'start-ollama.sh');
      if (!fs.existsSync(startOllamaScriptPath)) {
        throw new Error('start-ollama.sh script not found.');
      }
      console.log('Starting Ollama with process manager on Linux...');
      const result = await startProcess({
        name: 'ollama',
        script: startOllamaScriptPath,
        cwd: ollamaPath,
        namespace,
        env: { ...process.env, ...envVars },
      });
      if (!result.success) throw new Error(result.error || 'Failed to start Ollama');
    }

    console.log('Ollama started successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start Ollama:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function startFrontend(persona) {
  console.log(`Starting frontend for persona: ${persona}`);
  const { root } = resolvePaths({ persona });

  try {
    const standaloneDir = path.join(root, `next-${persona.toLowerCase()}`, 'standalone');
    if (!fs.existsSync(standaloneDir)) {
      throw new Error(`Standalone directory not found for persona ${persona} at ${standaloneDir}`);
    }
    if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
      throw new Error(`server.js not found in standalone directory for persona ${persona}`);
    }

    const namespace = getProcessManagerNamespace();

    console.log('Starting frontend with process manager...');
    const result = await startProcess({
      name: 'frontend',
      script: path.join(standaloneDir, 'server.js'),
      cwd: standaloneDir,
      namespace,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PERSONA: persona.toLowerCase(),
        PORT: '3000',
      },
    });

    if (!result.success) throw new Error(result.error || 'Failed to start frontend');

    console.log('Frontend started successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start frontend:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

export async function startServicesNoProvider(persona) {
  console.log(`Starting frontend and backend services only for persona: ${persona}`);
  console.log('Note: AI Provider services (Ollama/OVMS) will not be started.');

  try {
    console.log('Killing all managed processes to ensure a clean state...');
    await killDaemon();
    console.log('All managed processes killed successfully.');
  } catch (err) {
    console.warn('Failed to kill managed processes (they may not be running):', err);
  }

  const {
    isDistPackage, isRootRepo, root, venv, backend,
    ecosystem, dist, frontend,
  } = resolvePaths({ persona });

  try {
    const packageJsonPath = path.join(frontend, 'package.json');
    let packageName    = 'university-curriculum-enabling-tool';
    let packageVersion = '';
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName    = packageJson.name    || packageName;
        packageVersion = packageJson.version || '';
      } catch (_) {}
    }

    const versionString = packageVersion ? `-${packageVersion}` : '';
    const distPackage =
      persona.toLowerCase() === 'faculty'
        ? path.join(dist, `${packageName}${versionString}`)
        : path.join(dist, `${packageName}${versionString}-${persona}`);
    const distVersionFile = path.join(distPackage, '.version');

    let useDistPackage    = false;
    let distEcosystemConfig = null;

    if (isRootRepo) {
      if (fs.existsSync(distPackage) && fs.existsSync(distVersionFile)) {
        useDistPackage      = true;
        distEcosystemConfig = path.join(distPackage, 'ecosystem.config.cjs');
      } else {
        console.error('ERROR: No valid distribution package found.');
        process.exit(1);
      }
    } else if (!isDistPackage) {
      if (!fs.existsSync(distPackage) || !fs.existsSync(distVersionFile)) {
        console.error('ERROR: No valid distribution package found.');
        process.exit(1);
      }
    }

    let venvPath = venv;
    if (useDistPackage) {
      venvPath = path.join(distPackage, 'backend', 'venv');
    }

    if (!fs.existsSync(venvPath)) {
      const setupResult = await setupBackend(false);
      if (!setupResult.success) console.warn('Failed to setup backend, but continuing...');
    }

    process.env.PERSONA = persona.toLowerCase();
    const namespace     = getProcessManagerNamespace();

    const configToUse = useDistPackage ? distEcosystemConfig : ecosystem;
    console.log(`Using ecosystem config at: ${configToUse}`);

    if (useDistPackage && isSafeRelativePath(distPackage)) {
      process.chdir(fileURLToPath(new URL(`file://${path.resolve(distPackage)}`)));
    }

    console.log('Starting backend service...');
    await startEcosystem(configToUse, { only: 'backend', namespace });

    console.log(`Starting frontend service for persona: ${persona}...`);
    await startEcosystem(configToUse, { only: 'frontend', namespace });

    const stable = await waitForProcesses(2, namespace, 5000);
    if (!stable) {
      const logDir = path.join(__dirname, '..', '.process-manager', 'logs');
      throw new Error(
        `Services failed to start: expected 2 processes but none are running. ` +
        `Check logs at: ${logDir}`
      );
    }

    console.log(`Backend and frontend services started successfully for persona: ${persona}`);

    const serviceStatus = checkServicesStatus();
    if (serviceStatus.success) {
      console.log(`Services status: ${serviceStatus.running ? 'Running' : 'Not running'}`);
      if (serviceStatus.servicesCount > 0) {
        console.log(`Total services:  ${serviceStatus.servicesCount}`);
        console.log(`Online services: ${serviceStatus.onlineCount}`);
        if (serviceStatus.errorCount > 0) {
          console.warn(`Error services: ${serviceStatus.errorCount} (${serviceStatus.errorNames})`);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to start services for persona ${persona}:`, error);
    return { success: false, error };
  }
}

export async function startServices(persona) {
  console.log(`Starting all services for persona: ${persona}`);

  try {
    console.log('Killing all managed processes to ensure a clean state...');
    await killDaemon();
  } catch (err) {
    console.warn('Failed to kill managed processes:', err);
  }

  const {
    isDistPackage, isRootRepo, root, isOllamaOrOvms,
    ollama, venv, ovms, ovmsVenv, ovmsBackend,
    backend, ecosystem, dist, frontend,
  } = resolvePaths({ persona });

  try {
    const packageJsonPath = path.join(frontend, 'package.json');
    let packageName    = 'university-curriculum-enabling-tool';
    let packageVersion = '';
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName    = packageJson.name    || packageName;
        packageVersion = packageJson.version || '';
      } catch (_) {}
    }

    const versionString = packageVersion ? `-${packageVersion}` : '';
    const distPackage =
      persona.toLowerCase() === 'faculty'
        ? path.join(dist, `${packageName}${versionString}`)
        : path.join(dist, `${packageName}${versionString}-${persona}`);
    const distVersionFile = path.join(distPackage, '.version');

    let useDistPackage    = false;
    let distEcosystemConfig = null;

    if (isRootRepo) {
      if (fs.existsSync(distPackage) && fs.existsSync(distVersionFile)) {
        useDistPackage      = true;
        distEcosystemConfig = path.join(distPackage, 'ecosystem.config.cjs');
      } else {
        console.error('ERROR: No valid distribution package found.');
        process.exit(1);
      }
    } else if (!isDistPackage) {
      if (!fs.existsSync(distPackage) || !fs.existsSync(distVersionFile)) {
        console.error('ERROR: No valid distribution package found.');
        process.exit(1);
      }
    }

    let backendPath = backend;
    let venvPath    = venv;

    console.log(`Model serve using ${isOllamaOrOvms} service`);

    if (isOllamaOrOvms === 'ollama') {
      let ollamaPath = ollama;
      if (useDistPackage) {
        backendPath = path.join(distPackage, 'backend');
        ollamaPath  = path.join(distPackage, 'thirdparty', 'ollama');
        venvPath    = path.join(distPackage, 'backend', 'venv');
      }

      if (!fs.existsSync(venvPath)) {
        const r = await setupBackend(false);
        if (!r.success) console.warn('Failed to setup backend, but continuing...');
      }

      const ollamaBinPath    = isWindows
        ? path.join(ollamaPath, 'ollama.exe')
        : path.join(ollamaPath, 'ollama');
      const ollamaStartScript = isWindows
        ? path.join(ollamaPath, 'ollama.exe')
        : path.join(ollamaPath, 'start-ollama.sh');

      if (
        !fs.existsSync(ollamaPath) ||
        !fs.existsSync(ollamaBinPath) ||
        !fs.existsSync(ollamaStartScript)
      ) {
        const r = await setupOllama(false);
        if (!r.success) console.warn('Failed to setup Ollama, but continuing...');
      }
    } else if (isOllamaOrOvms === 'ovms') {
      let ovmsPath        = ovms;
      let ovmsVenvPath    = ovmsVenv;
      let ovmsBackendPath = ovmsBackend;

      if (useDistPackage) {
        venvPath        = path.join(distPackage, 'backend', 'venv');
        backendPath     = path.join(distPackage, 'backend');
        ovmsBackendPath = path.join(distPackage, 'backend', 'ovms_service');
        ovmsPath        = path.join(distPackage, 'thirdparty', 'ovms');
        ovmsVenvPath    = path.join(distPackage, 'backend', 'ovms_service', 'venv');
      }

      if (!fs.existsSync(venvPath)) {
        const r = await setupBackend(false);
        if (!r.success) console.warn('Failed to setup backend, but continuing...');
      }

      const ovmsBinPath = isWindows
        ? path.join(ovmsPath, 'ovms.exe')
        : path.join(ovmsPath, 'bin', 'ovms');

      if (!fs.existsSync(ovmsPath) || !fs.existsSync(ovmsBinPath)) {
        const r = await setupOvms(false);
        if (!r.success) console.warn('Failed to setup OVMS, but continuing...');
      }
    } else {
      throw new Error(`Unable to start service: ${isOllamaOrOvms}`);
    }

    process.env.PERSONA = persona.toLowerCase();
    const namespace     = getProcessManagerNamespace();

    const configToUse = useDistPackage ? distEcosystemConfig : ecosystem;
    console.log(`Using ecosystem config at: ${configToUse}`);

    if (useDistPackage && isSafeRelativePath(distPackage)) {
      process.chdir(fileURLToPath(new URL(`file://${path.resolve(distPackage)}`)));
    }

    console.log('Starting all services using ecosystem config...');
    await startEcosystem(configToUse, { namespace });

    const expectedCount = isOllamaOrOvms === 'ollama' ? 3 : isOllamaOrOvms === 'ovms' ? 3 : 2;
    const stable = await waitForProcesses(expectedCount, namespace, 5000);

    if (!stable) {
      const logDir = path.join(__dirname, '..', '.process-manager', 'logs');
      throw new Error(
        `Services failed to start: expected ${expectedCount} processes but none are running. ` +
        `Check logs at: ${logDir}`
      );
    }

    console.log(`All services started successfully for persona: ${persona}`);

    const serviceStatus = checkServicesStatus();
    if (serviceStatus.success) {
      console.log(`Services status: ${serviceStatus.running ? 'Running' : 'Not running'}`);
      if (serviceStatus.servicesCount > 0) {
        console.log(`Total services:  ${serviceStatus.servicesCount}`);
        console.log(`Online services: ${serviceStatus.onlineCount}`);
        if (serviceStatus.errorCount > 0) {
          console.warn(`Error services: ${serviceStatus.errorCount} (${serviceStatus.errorNames})`);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to start services for persona ${persona}:`, error);
    return { success: false, error };
  }
}

export async function stopServices(force = false) {
  console.log(`${force ? 'Removing' : 'Stopping'} all services...`);

  try {
    const { success, running, namespace, servicesNames } = checkServicesStatus();

    if (!success || !running) {
      console.log(`No managed services found to stop. Skipping...`);
      return { success: true };
    }
    console.log(`Found running services: ${servicesNames}`);

    if (force) {
      await deleteProcess('all', { namespace });
    } else {
      await stopProcess('all', { namespace });
    }

    console.log(`All services ${force ? 'removed' : 'stopped'} successfully.`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to ${force ? 'remove' : 'stop'} services:`, error);
    return { success: false, error };
  }
}

export function getServiceList() {
  console.log('Getting list of services...');

  try {
    const namespace = getProcessManagerNamespace();
    console.log(`Filtering services by namespace: ${namespace}`);

    const allProcesses = listProcesses();

    const filtered = allProcesses.filter(
      (p) => p.pm2_env?.namespace === namespace
    );

    const services = filtered.map((p) => ({
      name: p.name,
      id: p.pm_id,
      pid: p.pid,
      status: p.pm2_env?.status || 'unknown',
      namespace: p.pm2_env?.namespace || '',
      uptime: p.pm2_env?.pm_uptime || 0,
      memory: p.monit?.memory || 0,
      cpu: p.monit?.cpu || 0,
      created_at: p.pm2_env?.created_at || 0,
    }));

    const serviceCount = services.length;
    const serviceNames = services.map((s) => s.name).join(', ');

    console.log(`Found ${serviceCount} services with namespace '${namespace}': ${serviceNames || 'none'}`);

    if (serviceCount === 0) {
      const knownServiceNames = ['frontend', 'backend', 'ollama', 'ovms', 'faculty', 'lecturer', 'student'];
      const byName = allProcesses
        .filter((p) => knownServiceNames.some((n) => (p.name || '').includes(n)))
        .map((p) => ({
          name: p.name,
          id: p.pm_id,
          pid: p.pid,
          status: p.pm2_env?.status || 'unknown',
          namespace: p.pm2_env?.namespace || '',
          uptime: p.pm2_env?.pm_uptime || 0,
          memory: p.monit?.memory || 0,
          cpu: p.monit?.cpu || 0,
          created_at: p.pm2_env?.created_at || 0,
        }));

      if (byName.length > 0) {
        return {
          success: true,
          services: byName,
          serviceCount: byName.length,
          serviceNames: byName.map((s) => s.name).join(', '),
          namespace: 'any',
        };
      }
    }

    return { success: true, services, serviceCount, serviceNames, namespace };
  } catch (error) {
    console.warn('Error getting service list:', error);
    return { success: false, error: error.message, services: [] };
  }
}

export function checkServicesStatus() {
  console.log('Checking services status...');
  try {
    const { success, services, serviceCount, serviceNames, namespace, error } = getServiceList();

    if (!success) {
      console.warn('Failed to get service list:', error);
      return { success: false, error, running: false };
    }

    if (serviceCount === 0) {
      return {
        success: true,
        running: false,
        message: `No services found with namespace '${namespace}'`,
      };
    }

    const errorServices = services.filter((s) => s.status === 'errored');
    const onlineServices = services.filter((s) => s.status === 'online');

    return {
      success: true,
      running: serviceCount > 0,
      servicesCount: serviceCount,
      servicesNames: serviceNames,
      errorCount: errorServices.length,
      errorNames: errorServices.map((s) => s.name).join(', '),
      onlineCount: onlineServices.length,
      services,
      namespace,
    };
  } catch (error) {
    console.warn('Error checking services status:', error);
    return { success: false, error: error.message, running: false };
  }
}

function isSafeEnvVarName(name) {
  return /^[A-Z_][A-Z0-9_]{0,200}$/.test(name);
}

function readEnvVariable(varName, defaultValue = '') {
  if (process.env[varName] !== undefined) return process.env[varName];
  try {
    const dotenvPath = path.join(ROOT_DIR, '.env');
    if (fs.existsSync(dotenvPath)) {
      const envContent = fs.readFileSync(dotenvPath, 'utf8');
      if (!isSafeEnvVarName(varName)) {
        console.warn(`Unsafe environment variable name: ${varName}.`);
        return defaultValue;
      }
      const lines = envContent.split('\n');
      for (const line of lines) {
        const cleanLine = line.split('#')[0].trim();
        if (!cleanLine) continue;
        const [key, ...rest] = cleanLine.split('=');
        if (key && key.trim() === varName) {
          let value = rest.join('=').trim();
          value = value.replace(/^["'](.*)["']$/, '$1').trim();
          return value;
        }
      }
    }
  } catch (error) {
    console.warn(`Error reading ${varName} from .env:`, error);
  }
  return defaultValue;
}

function getProcessManagerNamespace() {
  const namespace = readEnvVariable('PROCESS_NAMESPACE', 'latest');
  console.log(`Using process namespace: ${namespace}`);
  return namespace;
}

function delay(ms) {
  const safeMs = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(ms))));
  return new Promise((resolve) => {
    setTimeout(() => { resolve(); }, safeMs);
  });
}

async function waitForProcesses(expectedCount, namespace, timeoutMs = 5000) {
  const pollInterval = 300;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await delay(pollInterval);

    const processes = listProcesses({ namespace });
    const onlineCount = processes.filter(
      (p) => p.pm2_env?.status === 'online'
    ).length;

    if (onlineCount >= expectedCount) return true;
  }
  return false;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const normalizedFilename = __filename.replace(/\\/g, '/');
const linuxMetaUrl = `file://${normalizedFilename}`;

if (
  import.meta.url === linuxMetaUrl ||
  import.meta.url === `file:///${normalizedFilename}`
) {
  async function runCLI() {
    try {
      const command = process.argv[2];
      const personaArg = process.argv[3];
      const persona = allowedPersonaMap[personaArg] || 'faculty';
      const safePersona = getPersonaFromKey(persona);
      const force = process.argv.includes('--force');

      switch (command) {
        case 'build':
          await buildPersona(safePersona, force);
          break;
        case 'create-package':
          await createDistPackage(safePersona, force);
          break;
        case 'setup-backend':
          await setupBackend(force);
          break;
        case 'start-backend':
          await startBackend();
          break;
        case 'setup-ollama':
          await setupOllama(force);
          break;
        case 'start-ollama':
          await startOllama();
          break;
        case 'setup-ovms':
          await setupOvms(force);
          break;
        case 'start-ovms':
          await startOvms();
          break;
        case 'start':
          await startServices(safePersona);
          break;
        case 'start-no-provider':
          await startServicesNoProvider(safePersona);
          break;
        case 'stop': {
          const forceStop =
            process.argv.includes('--force') ||
            process.argv.includes('-f') ||
            process.env.FORCE === 'true';
          await stopServices(forceStop);
          break;
        }
        case 'status': {
          try {
            const jsonFormat = process.argv.includes('--json') || process.argv.includes('-j');
            const quietMode = process.argv.includes('--quiet') || process.argv.includes('-q');
            const humanReadable = process.argv.includes('--human') || process.argv.includes('-h');

            let status;
            if (quietMode) {
              const origLog = console.log;
              const origWarn = console.warn;
              console.log = () => {};
              console.warn = () => {};
              status = checkServicesStatus();
              console.log = origLog;
              console.warn = origWarn;
            } else {
              status = checkServicesStatus();
            }

            const formatUptime = (uptime) => {
              if (!uptime || typeof uptime !== 'number') return 'Unknown';
              const secs = Math.max(0, (Date.now() - uptime) / 1000);
              if (secs < 60) return `${Math.floor(secs)} seconds`;
              if (secs < 3600) {
                const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
                return `${m} minute${m !== 1 ? 's' : ''} ${s} second${s !== 1 ? 's' : ''}`;
              }
              if (secs < 86400) {
                const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
                return `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
              }
              const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
              return `${d} day${d !== 1 ? 's' : ''} ${h} hour${h !== 1 ? 's' : ''}`;
            };

            const printHuman = (status) => {
              if (status.success && status.running) {
                console.log(`Status: ${status.servicesCount} services running (namespace: '${status.namespace}')`);
                console.log(`Services: ${status.servicesNames}`);
                console.log(`Online: ${status.onlineCount}, Error: ${status.errorCount}`);
                if (status.services?.length > 0) {
                  console.log('\nService details:');
                  console.log('---------------------------------------------');
                  status.services.forEach((svc) => {
                    console.log(`Name:   ${svc.name}`);
                    console.log(`Status: ${svc.status}`);
                    console.log(`Uptime: ${formatUptime(svc.uptime)}`);
                    console.log(`Memory: ${Math.floor((svc.memory || 0) / 1024 / 1024)} MB`);
                    console.log(`CPU:    ${svc.cpu || 0}%`);
                    console.log('---------------------------------------------');
                  });
                  if (status.errorCount > 0) console.log(`Error services: ${status.errorNames}`);
                }
              } else if (status.success) {
                console.log(`No services found running (namespace: '${status.namespace}')`);
              } else {
                console.log(`Failed to check service status: ${status.error}`);
              }
            };

            if (humanReadable || (!jsonFormat && !quietMode)) {
              printHuman(status);
            } else {
              console.log(JSON.stringify(status, null, 2));
            }
          } catch (error) {
            console.log(JSON.stringify({
              success: false,
              error: error.message,
              running: false,
              timestamp: new Date().toISOString(),
            }, null, 2));
          }
          break;
        }
        case 'test':
          console.log('Test command working');
          break;
        case 'uninstall':
          console.log('Uninstall functionality not yet implemented');
          break;
        default:
          console.log(`
Usage: node utils.mjs <command> [persona] [--force] [options]

Commands:
  build <persona>          Build a specific persona (faculty, lecturer, student)
  create-package <persona> Create a distribution package for a specific persona
  setup-backend            Setup backend environment
  start-backend            Start backend server
  setup-ollama             Setup Ollama
  start-ollama             Start Ollama
  setup-ovms               Setup OpenVINO Model Server (OVMS)
  start-ovms               Start OpenVINO Model Server (OVMS)
  start <persona>          Start all services for a specific persona
  start-no-provider        Start frontend and backend only (no AI provider)
  stop                     Stop all services
  status                   Check status of all services

Options:
  --force                  Force rebuild/recreate
  --json, -j               Output status in JSON format
  --quiet, -q              Suppress logging, output only JSON
  --human, -h              Human-readable status output
`);
      }
    } catch (error) {
      console.error(`Error executing command: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      process.exit(1);
    }
  }

  runCLI().catch((error) => {
    console.error('Unhandled error in CLI:', error);
    process.exit(1);
  });
}