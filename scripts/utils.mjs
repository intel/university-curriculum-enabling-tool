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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const allowedPersonaMap = {
  faculty: 'faculty',
  lecturer: 'lecturer',
  student: 'student',
};

// Get the persona from command line or default to 'faculty'
const personaArg = process.argv[3];
const persona = allowedPersonaMap[personaArg] || 'faculty';

// Use path resolver to get paths based on environment
const paths = resolvePaths({ persona });

// Destructure paths for easier access
const {
  root: WORKING_DIR,
  frontend: FRONTEND_DIR,
  backend: BACKEND_DIR,
  thirdparty: THIRDPARTY_DIR,
  node: NODE_DIR,
  ollama: OLLAMA_DIR,
  data: DATA_DIR,
  venv: VENV_DIR,
  ecosystem: ECOSYSTEM_CONFIG,
  dist: DIST_DIR,
  isDistPackage: IS_DIST_PACKAGE,
  isDevelopmentMode: IS_DEV_MODE,
  isRootRepo: IS_ROOT_REPO
} = paths;

// Platform detection
const isWindows = process.platform === 'win32';

/**
 * Find available Python command on the system - Simplified
 */
function getPythonCommand() {
  if (isWindows) {
    // Just try the most common commands, let the shell handle the rest
    const pythonCommands = ['python', 'python3', 'py'];
    for (const cmd of pythonCommands) {
      try {
        const result = spawnSync(cmd, ['--version'], { 
          stdio: 'ignore',
        });
        if (result.status === 0) {
          return cmd;
        }
      } catch (error) {
        // Continue to next command
      }
    }
    return 'python'; // fallback - let it fail naturally if not found
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

// PowerShell path for Windows
const powerShellCommand = isWindows ? 'powershell' : null;

// Use local Node.js binaries if available
const nodeBin = isWindows 
  ? path.join(NODE_DIR, 'node.exe')
  : path.join(NODE_DIR, 'bin', 'node');

const npmBin = isWindows
  ? path.join(NODE_DIR, 'npm.cmd') 
  : path.join(NODE_DIR, 'bin', 'npm');

const npmCommand = fs.existsSync(npmBin) ? npmBin : (isWindows ? 'npm.cmd' : 'npm');
const nodePath = fs.existsSync(nodeBin) ? nodeBin : (isWindows ? 'node.exe' : 'node');
const pm2Command = isWindows
  ? (fs.existsSync(nodeBin) ? path.join(NODE_DIR, 'npx.cmd') : 'npx.cmd')
  : (fs.existsSync(nodeBin) ? path.join(NODE_DIR, 'bin', 'npx') : 'npx');

// Allow list of characters for directory names and filenames for security purposes (i.e. to prevent directory traversal attacks)
const ALLOWED_PATH_REGEX = /^[a-zA-Z0-9_\-\.\/]+$/;

// Allow list of safe characters for command arguments (including Windows paths)
const SAFE_ARG_REGEX = /^[a-zA-Z0-9_\-\/\.=:@+\\]+$/;

// Allow URLs for curl
const SAFE_URL_REGEX = /^https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;


/**
 * Safely validate a Python executable path to prevent command injection
 */
function isValidPythonPath(pythonPath) {
  if (!pythonPath || typeof pythonPath !== 'string') return false;
  
  // Check for basic path safety - no command injection characters
  const dangerousChars = /[;&|`$(){}[\]<>]/;
  if (dangerousChars.test(pythonPath)) return false;
  
  // Must be an absolute path on Windows
  if (isWindows && !path.isAbsolute(pythonPath)) return false;
  
  // Must end with python.exe on Windows or python/python3 on Unix
  const validEndings = isWindows 
    ? [/python\.exe$/i, /python3\.exe$/i]
    : [/\/python$/, /\/python3$/];
  
  if (!validEndings.some(pattern => pattern.test(pythonPath))) return false;
  
  // Path must exist
  if (!fs.existsSync(pythonPath)) return false;
  
  // Additional Windows-specific validation
  if (isWindows) {
    // Must be in expected locations
    const allowedPrefixes = [
      'C:\\Python',
      'C:\\Program Files\\Python',
      'C:\\Program Files (x86)\\Python',
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\Python') : null,
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps') : null
    ].filter(Boolean);
    
    const isInAllowedLocation = allowedPrefixes.some(prefix => 
      pythonPath.toLowerCase().startsWith(prefix.toLowerCase())
    );
    
    if (!isInAllowedLocation) {
      console.log(`Python path not in allowed location: ${pythonPath}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Get Python command dynamically at runtime
 */
function getDynamicPythonCommand() {
  if (isWindows) {
    console.log('Searching for Python installation...');
    
    // First try to get the full path using 'where' command
    try {
      const whereResult = spawnSync('where', ['python'], { 
        encoding: 'utf8',
      });
      
      if (whereResult.status === 0 && whereResult.stdout) {
        const pythonPaths = whereResult.stdout.trim().split('\n').map(p => p.trim()).filter(Boolean);
        
        // Validate each path returned by 'where' command
        for (const pythonPath of pythonPaths) {
          if (isValidPythonPath(pythonPath)) {
            console.log(`Found Python with 'where python': ${pythonPath}`);
            // Test if it actually works using spawn instead of execSync for safety
            try {
              const result = spawnSync(pythonPath, ['--version'], { 
                stdio: ['ignore', 'pipe', 'pipe'],
                encoding: 'utf8',
              });
              if (result.status === 0) {
                console.log(`Verified Python works: ${pythonPath}`);
                return pythonPath;
              }
            } catch (testError) {
              console.log(`Python path failed verification: ${pythonPath} - ${testError.message}`);
            }
          } else {
            console.log(`Skipping invalid Python path: ${pythonPath}`);
          }
        }
      }
    } catch (error) {
      console.log(`'where python' failed: ${error.message}`);
    }
    
    const pythonCommands = [
      'python', 
      'python3', 
      'py'
    ];
    
    // Allow list of python paths
    const userProfile = process.env.USERPROFILE || '';
    const pythonPathPatterns = [
      'C:\\Python*\\python.exe',  // System root
      'C:\\Program Files\\Python*\\python.exe', // 64-bit
      'C:\\Program Files (x86)\\Python*\\python.exe'  // 32-bit
    ];
    
    // Add user-specific patterns if userProfile is available
    if (userProfile) {
      pythonPathPatterns.push(
        path.join(userProfile, 'AppData\\Local\\Programs\\Python\\Python*\\python.exe'),  // User installation
        path.join(userProfile, 'AppData\\Local\\Microsoft\\WindowsApps\\python*.exe') // Microsoft store
      );
    }
    
    for (const pattern of pythonPathPatterns) {
      try {
        // Extract base directory and pattern from the path
        const basePath = pattern.substring(0, pattern.lastIndexOf('\\'));
        const baseDir = basePath.substring(0, basePath.lastIndexOf('\\'));
        
        if (fs.existsSync(baseDir)) {
          const entries = fs.readdirSync(baseDir);
          
          // Different matching logic based on the pattern
          let matchingEntries;
          if (pattern.includes('WindowsApps')) {
            // For Microsoft Store: match python*.exe files directly
            matchingEntries = entries
              .filter(file => /^python(3(\.\d+)?)?\.exe$/i.test(file))
              .map(file => path.join(baseDir, file));
          } else {
            // For other patterns: match Python* directories containing python.exe
            matchingEntries = entries
              .filter(dir => /^Python(\d+(\.\d+)?)?$/i.test(dir))
              .map(dir => path.join(baseDir, dir, 'python.exe'))
              .filter(pythonExe => fs.existsSync(pythonExe));
          }
          
          pythonCommands.push(...matchingEntries);
        }
      } catch (error) {
        // Continue if we can't read the directory
      }
    }
    
    for (const cmd of pythonCommands) {
      try {
        // Check if the command exists as a file
        if (cmd.includes(path.sep) && isValidPythonPath(cmd)) {
          console.log(`Found Python executable at: ${cmd}`);
          // Test if it actually works using spawn for safety
          const result = spawnSync(cmd, ['--version'], { 
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
          });
          if (result.status === 0) {
            console.log(`Verified Python works: ${cmd}`);
            return cmd;
          }
        } else if (!cmd.includes(path.sep)) {
          // Test command in PATH using spawn for safety
          console.log(`Testing Python command in PATH: ${cmd}`);
          const result = spawnSync(cmd, ['--version'], { 
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf8',
          });
          if (result.status === 0) {
            console.log(`Verified Python works from PATH: ${cmd}`);
            return cmd;
          }
        }
      } catch (error) {
        console.log(`Python command failed: ${cmd} - ${error.message || 'Command not found'}`);
        // Continue to next command
      }
    }
    
    console.warn('No working Python installation found!');
    console.warn('Tried the following commands:');
    pythonCommands.forEach(cmd => console.warn(`  - ${cmd}`));
    console.warn('Please install Python using setup.ps1 or manually install Python 3.12+');
    
    return 'python'; // fallback
  } else {
    return 'python3';
  }
}

// Define a whitelist of allowed commands
export const ALLOWED_COMMANDS_CONFIG = {
  npm: {
    path: npmCommand,
    aliases: ['npm', npmCommand],
    allowedArgs: new Set([
      'install', 'run', 'list',
      'build:faculty', 'build:lecturer', 'build:student',
      '--no-progress', '--no-color'
    ]),
  },
  pm2: {
    path: pm2Command,
    aliases: ['pm2', pm2Command],
    allowedArgs: new Set([
      'jlist', 'start', 'stop', 'delete', 'restart', 'reload',
      '--silent', '--namespace', 'all', 'update', 'test', 'test-suite'
    ]),
  },
  npx: {
    path: pm2Command,
    aliases: ['npx', pm2Command],
    allowedArgs: new Set([
      'pm2', 'start', 'stop', 'delete', 'restart', 'reload',
      'jlist', '--silent', '--namespace', 'all', 'ecosystem.config.cjs', 'latest', 'test', 'test-suite'
    ]),
  },
  python3: {
    path: getDynamicPythonCommand(),
    aliases: ['python', 'python3', pythonCommand],
    allowedArgs: new Set(['-m', 'pip', 'install', 'venv']),
  },
  pip: {
    path: venvPip,
    aliases: ['pip', 'pip3', venvPip],
    allowedArgs: new Set(['install', '-r', 'requirements.txt']),
  },
  node: {
    path: nodePath,
    aliases: ['node', nodePath],
    allowedArgs: new Set(['jlist', 'start', 'stop', 'delete', 'restart', 'reload', '--silent', '--namespace', 'all', 'update', 'test', 'test-suite']),
  },
  curl: {
    path: 'curl',
    aliases: ['curl'],
    allowedArgs: new Set([
      '-L', '-o', '--location', '--output', '--fail', '--retry', '--retry-delay',
      '--connect-timeout', '--max-time', '--progress-bar'
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
    path: isWindows ? (() => {
      // Try multiple PowerShell locations
      const powerShellPaths = [
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe', 
        'powershell.exe',
        'powershell'
      ];

      for (const psPath of powerShellPaths) {
        if (psPath.includes('\\') && fs.existsSync(psPath)) {
          return psPath;
        } else if (!psPath.includes('\\')) {
          // Try to find in PATH
          try {
            const result = spawnSync('where', [psPath], { 
              stdio: 'ignore',
            });
            if (result.status === 0) {
              return psPath;
            }
          } catch (error) {
            // Continue to next path
          }
        }
      }
      return 'powershell'; // fallback
    })() : null,
    aliases: ['powershell'],
    allowedArgs: new Set(['-Command', 'Expand-Archive', '-Path', '-DestinationPath', '-Force', 'Invoke-WebRequest', '-Uri', '-OutFile']),
  },
  cmd: {
    path: isWindows ? 'cmd' : null,
    aliases: ['cmd'],
    allowedArgs: new Set(['/c', '/k', 'npx', 'pm2', 'jlist', '--silent', 'start', 'stop', 'delete', 'all', '--namespace']),
  },
  pm2bin: {
    path: path.join(WORKING_DIR, 'node_modules', 'pm2', 'bin', 'pm2'),
    aliases: [path.join(WORKING_DIR, 'node_modules', 'pm2', 'bin', 'pm2')],
    allowedArgs: new Set(['jlist', 'start', 'stop', 'delete', 'restart', 'reload', '--silent', '--namespace', 'all', 'update', 'test', 'test-suite']),
  }
};

/**
 * Finds the ALLOWED_COMMANDS_CONFIG entry that has the given alias.
 */
export function lookupCommandInfo(cmdAlias) {
  // For Python commands, refresh the path dynamically
  if (['python', 'python3'].includes(cmdAlias) || 
      (cmdAlias.toLowerCase().includes('python') && cmdAlias.toLowerCase().endsWith('.exe'))) {
    const pythonPath = getDynamicPythonCommand();
    return {
      path: pythonPath,
      aliases: ['python', 'python3', pythonPath],
      allowedArgs: new Set(['-m', 'pip', 'install', 'venv'])
    };
  }
  
  // Special handling for PowerShell full paths on Windows
  if (isWindows && cmdAlias.toLowerCase().includes('powershell.exe')) {
    const powerShellConfig = ALLOWED_COMMANDS_CONFIG.powershell;
    if (powerShellConfig && powerShellConfig.path) {
      return {
        path: cmdAlias, // Use the full path as provided
        aliases: [cmdAlias, 'powershell.exe', 'powershell'],
        allowedArgs: powerShellConfig.allowedArgs
      };
    }
  }
  
  // Special handling for Node.js full paths
  if (cmdAlias.toLowerCase().includes('node.exe') || cmdAlias.toLowerCase().endsWith('node')) {
    const nodeConfig = ALLOWED_COMMANDS_CONFIG.node;
    if (nodeConfig && nodeConfig.path) {
      return {
        path: cmdAlias, // Use the full path as provided
        aliases: [cmdAlias, 'node.exe', 'node', nodeConfig.path],
        allowedArgs: nodeConfig.allowedArgs
      };
    }
  }
  
  return Object.values(ALLOWED_COMMANDS_CONFIG).find((entry) =>
    entry.aliases.includes(cmdAlias)
  ) || null;
}

/**
 * Path resolver function to read environment variables. 
 * Checks if a path is within the project root directory. 
 * Disallows '..' in the path & only allows safe characters.
 */
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
    if (segment && !ALLOWED_PATH_REGEX.test(segment)) {
      return false;
    }
  }
  return true;
}


function getPersonaFromKey(persona) {
  const normalized = persona.toLowerCase().trim();
  const safePersona = allowedPersonaMap[normalized];
  if (!safePersona) {
    throw new Error(`Invalid persona: ${persona}`);
  }
  return safePersona;
}


/**
 * Get environment variables for Ollama from root .env file
 */
function getOllamaEnvironmentVariables(rootDir) {
  // Default environment variables
  const envVars = {
    OLLAMA_NUM_GPU: 999,
    no_proxy: 'localhost,127.0.0.1',
    ZES_ENABLE_SYSMAN: 1,
    SYCL_CACHE_PERSISTENT: 1,
    OLLAMA_KEEP_ALIVE: '10m',
    SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS: 1,
    ONEAPI_DEVICE_SELECTOR: 'level_zero:0'
  };
  
  // Define all Ollama-related environment variables to look for
  const ollamaEnvVars = [
    'OLLAMA_NUM_GPU',
    'no_proxy',
    'ZES_ENABLE_SYSMAN',
    'SYCL_CACHE_PERSISTENT',
    'OLLAMA_KEEP_ALIVE',
    'SYCL_PI_LEVEL_ZERO_USE_IMMEDIATE_COMMANDLISTS',
    'ONEAPI_DEVICE_SELECTOR',
    'OLLAMA_HOST',
    'OLLAMA_MODELS',
    'OLLAMA_DEBUG',
    'http_proxy',
    'https_proxy',
    'OLLAMA_ORIGINS'
  ];
  
  // Read each environment variable using the shared function
  ollamaEnvVars.forEach(varName => {
    const defaultValue = envVars[varName];
    const value = readEnvVariable(varName, defaultValue);
    if (value !== undefined) {
      console.log(`Using ${varName}: ${value}`);
      envVars[varName] = value;
    }
  });
  
  return envVars;
}

/**
 * Final validation of command path before execution (for Coverity taint analysis)
 */
function validateExecutablePath(commandPath) {
  if (!commandPath || typeof commandPath !== 'string') {
    throw new Error('Invalid command path: must be a non-empty string');
  }
  
  // Check for dangerous characters that could enable command injection
  const dangerousChars = /[;&|`$(){}[\]<>]/;
  if (dangerousChars.test(commandPath)) {
    throw new Error(`Invalid command path: contains dangerous characters: ${commandPath}`);
  }
  
  // For absolute paths, ensure they're in safe locations
  if (path.isAbsolute(commandPath)) {
    // Use static project paths based on __dirname to avoid process.cwd() dependency
    const projectBasePaths = [
      ROOT_DIR, // Project root directory (statically defined)
      path.dirname(ROOT_DIR), // Allow parent of project root for workspace scenarios
    ];
    
    const safePrefixes = isWindows ? [
      'C:\\Windows\\System32\\',
      'C:\\Windows\\SysWOW64\\',
      'C:\\Program Files\\',
      'C:\\Program Files (x86)\\',
      'C:\\Python',
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\') : null,
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps\\') : null,
      ...projectBasePaths, // Add static project paths
    ].filter(Boolean) : [
      '/usr/bin/',
      '/usr/local/bin/',
      '/bin/',
      '/opt/',
      ...projectBasePaths, // Add static project paths
    ];
    
    const isInSafeLocation = safePrefixes.some(prefix => 
      commandPath.toLowerCase().startsWith(prefix.toLowerCase())
    );
    
    if (!isInSafeLocation) {
      throw new Error(`Invalid command path: not in safe location: ${commandPath}`);
    }
  }
  
  return true;
}

/**
 * Sanitized command path wrapper to break taint flow for Coverity
 * This function validates the path and returns a clean object
 */
function getSanitizedCommandPath(commandPath) {
  // First validate the path through our existing validation
  validateExecutablePath(commandPath);
  
  // Explicit whitelist check
  if (!validateCommandPath(commandPath)) {
    throw new Error(`Command path not in whitelist: ${commandPath}`);
  }
  
  // Return a clean path object that breaks the taint flow
  // Using a simple object wrapper to contain the validated path
  return {
    executablePath: String(commandPath), // Create a new string to break taint
    isValidated: true
  };
}

/**
 * Function to validate executable command paths
 */
function validateCommandPath(commandPath) {
  // Explicit hardcoded whitelist of allowed command paths
  const ALLOWED_COMMAND_PATHS = [
    // System commands (Windows)
    'C:\\Windows\\System32\\cmd.exe',
    'C:\\Windows\\SysWOW64\\cmd.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
    'powershell.exe',
    'powershell',
    'cmd',
    'curl',
    'tar',
    'chmod',
    'where',
    'robocopy',
    
    // Node.js commands
    'node',
    'node.exe',
    'npm',
    'npm.cmd',
    'npx',
    'npx.cmd',
    
    // Python commands
    'python',
    'python3',
    'python.exe',
    'python3.exe',
    'py',
    'pip',
    'pip3',
    'pip.exe',
    
    // PM2 commands
    'pm2',
    
    // Unix/Linux system commands
    '/usr/bin/python3',
    '/usr/bin/python',
    '/usr/local/bin/python3',
    '/usr/local/bin/python',
    '/bin/bash',
    '/bin/sh',
    '/usr/bin/curl',
    '/usr/bin/tar',
    '/usr/bin/chmod'
  ];
  
  // Check if the command path is in our explicit whitelist
  if (ALLOWED_COMMAND_PATHS.includes(commandPath)) {
    return true;
  }
  
  // Check if it's a path within our project directories
  const projectBasePaths = [
    ROOT_DIR,
    path.dirname(ROOT_DIR)
  ];
  
  for (const basePath of projectBasePaths) {
    if (commandPath.startsWith(basePath)) {
      return true;
    }
  }
  
  // Check if it's in standard system directories
  const systemPrefixes = isWindows ? [
    'C:\\Windows\\System32\\',
    'C:\\Windows\\SysWOW64\\',
    'C:\\Program Files\\',
    'C:\\Program Files (x86)\\',
    'C:\\Python',
  ] : [
    '/usr/bin/',
    '/usr/local/bin/',
    '/bin/',
    '/opt/',
  ];
  
  for (const prefix of systemPrefixes) {
    if (commandPath.startsWith(prefix)) {
      return true;
    }
  }
  
  // Check user directories (Python installations)
  if (isWindows && process.env.USERPROFILE) {
    const userPrefixes = [
      path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\'),
      path.join(process.env.USERPROFILE, 'AppData\\Local\\Microsoft\\WindowsApps\\')
    ];
    
    for (const prefix of userPrefixes) {
      if (commandPath.startsWith(prefix)) {
        return true;
      }
    }
  }
  
  return false;
}

function execCommand(command, options = {}) {
  try {
    // Ensure NODE_DIR is in the PATH environment variable
    const env = { ...process.env };
    if (fs.existsSync(NODE_DIR)) {
      const nodeBinPath = isWindows ? NODE_DIR : path.join(NODE_DIR, 'bin');

      env.PATH = nodeBinPath + (isWindows ? ';' : ':') + (env.PATH || '');
    }

    let cmd, args;
    if (Array.isArray(command)) {
      [cmd, ...args] = command;
    } else {
      [cmd, ...args] = command.split(' ');
    }
    
    // Filter to only run allowed commands
    const commandInfo = lookupCommandInfo(cmd);
    if (!commandInfo) {
      throw new Error(`Blocked execution: command '${cmd}' is not allowed.`);
    }    

    // Explicitly check all arguments with SAFE_ARG_REGEX
    if (!Array.isArray(args)){
      throw new Error('Arguments must be in an array');
    }
    for (const arg of args) {
      if (typeof arg !== 'string' || !SAFE_ARG_REGEX.test(arg)) {
        throw new Error(`Blocked execution: unsafe argument '${arg}'`);
      }
    }

    // Final validation of executable commands and its respective paths to prevent command injection
    const sanitizedCommand = getSanitizedCommandPath(commandInfo.path);

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

/**
 * Strictly validate if an argument is safe to use in a command.
 */
function isSafeArg(command, commandInfo, arg, index, args) {
  if (typeof arg !== 'string') return false;
  if (command === 'curl' && SAFE_URL_REGEX.test(arg)) return true;
  if (command === 'curl' && args && (args[index - 1] === '-o' || args[index - 1] === '--output')) {
    return SAFE_ARG_REGEX.test(arg);
  }
  if (command === 'curl' && (
    arg === '-L' || arg === '-o' || arg === '--location' || arg === '--output' ||
    arg === '--fail' || arg === '--retry' || arg === '--retry-delay' ||
    arg === '--connect-timeout' || arg === '--max-time' || arg === '--progress-bar'
  )) return true;

  // Allow numeric values for timeout and retry arguments
  if (command === 'curl' && args && (
    args[index - 1] === '--retry' || args[index - 1] === '--retry-delay' ||
    args[index - 1] === '--connect-timeout' || args[index - 1] === '--max-time'
  ) && /^\d+$/.test(arg)) return true;

  // PowerShell command validation - check both command name and path
  const isPowerShellCommand = command === 'powershell' || 
                              command.toLowerCase().includes('powershell.exe') ||
                              path.basename(command).toLowerCase() === 'powershell.exe';

  if (isPowerShellCommand) {
    // Allow URLs for Invoke-WebRequest
    if (SAFE_URL_REGEX.test(arg)) return true;
    // Allow file paths
    if (arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:]+$/)) return true;
    // Allow PowerShell command strings with comprehensive character set
    if (arg.includes('Invoke-WebRequest') || arg.includes('Expand-Archive')) {
      // Allow PowerShell commands with all necessary characters: letters, numbers, spaces, quotes, 
      // paths, URLs, parameters, equals signs, colons, periods, hyphens, slashes, backslashes
      if (arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:\"'=@+\?\&\[\](){}]+$/)) return true;
    }
    // Allow individual PowerShell parameters (like -Command, -Uri, -OutFile, etc.)
    if (arg.match(/^-[a-zA-Z0-9]+$/)) return true;
    // Allow quoted strings and file paths
    if (arg.match(/^\"[^\"]*\"$/) || arg.match(/^'[^']*'$/)) return true;
    // Allow simple PowerShell parameter values
    if (arg.match(/^[a-zA-Z0-9_\-\.\\\/\s\:]+$/)) return true;
    // If none of the PowerShell-specific patterns match, check allowedArgs
    if (commandInfo.allowedArgs && !commandInfo.allowedArgs.has(arg)) return false;
    // For PowerShell, return false if it doesn't match any allowed pattern
    return false;
  }
  
  if (commandInfo.allowedArgs && arg.startsWith('-')) {
    // If the argument is in allowedArgs, allow it; if not, reject it
    return commandInfo.allowedArgs.has(arg);
  }
  if (!SAFE_ARG_REGEX.test(arg)) return false;
  if (command === 'tar' && (arg === '-xzf' || arg === '--strip-components=1')) return true;
  if (
    (command === 'npx' || path.basename(commandInfo.path) === 'npx' || commandInfo.aliases.includes('npx')) &&
    ((index === 0 && arg === 'pm2') || (index > 0 && (arg.endsWith('ecosystem.config.cjs') || arg === 'latest')))
  ) return true;
  if ((command === 'pm2' || command === 'npx') && args && args[index - 1] === '--namespace') {
    return SAFE_ARG_REGEX.test(arg);
  }
  return true;
}

/**
 * Sanitize command arguments to ensure they are safe and allowed.
 */
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

/**
 * Execute a command with real-time output - Uses lookupCommandInfo and sanitizeArgs
 */
function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Use the system's default PATH environment
    const env = { ...process.env };
    
    // Only add Node.js to PATH if we have local installation
    if (fs.existsSync(NODE_DIR)) {
      const nodeBinPath = isWindows ? NODE_DIR : path.join(NODE_DIR, 'bin');
      env.PATH = nodeBinPath + (isWindows ? ';' : ':') + (env.PATH || '');
    }

    // Validate command with list of allowed commands
    const commandInfo = lookupCommandInfo(command);
    if (!commandInfo) {
      return reject(new Error(`Blocked execution: command '${command}' is not allowed.`));
    }

    // Sanitize arguments using the existing sanitizeArgs function
    let sanitizedArgs;
    try {
      sanitizedArgs = sanitizeArgs(command, commandInfo, args || []);
    } catch (error) {
      return reject(error);
    }

    // Handle Windows .cmd/.bat files securely without shell injection
    let finalCommand = commandInfo.path;
    let finalArgs = sanitizedArgs;

    if (isWindows && (commandInfo.path.endsWith('.cmd') || commandInfo.path.endsWith('.bat'))) {
      // Use hardcoded cmd.exe path to avoid environment variable injection
      // Common safe locations for cmd.exe on Windows
      const safeCmdPaths = [
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\Windows\\SysWOW64\\cmd.exe'
      ];

      let cmdPath = 'cmd.exe'; // fallback
      for (const safePath of safeCmdPaths) {
        if (fs.existsSync(safePath)) {
          cmdPath = safePath;
          break;
        }
      }

      finalCommand = cmdPath;
      finalArgs = ['/d', '/s', '/c', commandInfo.path, ...sanitizedArgs];
    }

    // Final validation of executable commands and its respective paths to prevent command injection
    const sanitizedCommand = getSanitizedCommandPath(finalCommand);

    const proc = spawn(sanitizedCommand.executablePath, finalArgs, {
      stdio: 'inherit',
      shell: false,
      env,
      ...options,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject({ success: false, code });
      }
    });

    proc.on('error', (err) => {
      reject({ success: false, error: err });
    });
  });
}

/**
 * Execute a PM2 command with proper Windows/Linux compatibility
 */
function executePM2Command(pm2Args, options = {}) {
  if (isWindows) {
    // On Windows, try to run PM2 directly using Node.js
    const nodePath = fs.existsSync(path.join(NODE_DIR, 'node.exe')) ? path.join(NODE_DIR, 'node.exe') : 'node';
    const pm2BinPath = path.join(WORKING_DIR, 'node_modules', 'pm2', 'bin', 'pm2');
    
    if (fs.existsSync(pm2BinPath)) {
      // Use Node.js to run PM2 directly
      return spawnCommand(nodePath, [pm2BinPath, ...pm2Args], options);
    } else {
      // Fallback to npx using cmd.exe
      return spawnCommand('cmd', ['/c', 'npx', 'pm2', ...pm2Args], options);
    }
  } else {
    return spawnCommand(pm2Command, ['pm2', ...pm2Args], options);
  }
}

/**
 * Check if a persona build exists
 */
function checkBuildExists(persona) {
  // Get fresh paths for the specified persona
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

/**
 * Check if a distribution package exists
 */
function checkDistExists(persona) {
  // Get fresh paths with the specific persona
  const { dist, frontend } = resolvePaths({ persona });
  
  // Get the name and version from frontend package.json
  const packageJsonPath = path.join(frontend, 'package.json');
  let packageName = 'university-curriculum-enabling-tool';
  let packageVersion = '';
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      packageName = packageJson.name || packageName;
      packageVersion = packageJson.version || '';
    } catch (error) {
      console.warn(`Failed to parse package.json: ${error.message}. Using default package name.`);
    }
  }
  
  // Create dist directory name with name and version from package.json
  const versionString = packageVersion ? `-${packageVersion}` : '';
  // For faculty persona, don't append the persona label
  const distDir = persona.toLowerCase() === 'faculty' 
    ? path.join(dist, `${packageName}${versionString}`) 
    : path.join(dist, `${packageName}${versionString}-${persona}`);
  const zipFile = `${distDir}.zip`;
  
  return fs.existsSync(distDir) && fs.existsSync(zipFile);
}

/**
 * Build a specific persona
 */
export async function buildPersona(persona, force = false) {
  console.log(`Building for persona: ${persona}`);
  
  // Get fresh paths for the specified persona
  const { isDistPackage, frontend, root } = resolvePaths({ persona });
  
  // Skip building if in distribution package mode
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

    // Install dependencies if needed
    if (!fs.existsSync(path.join(frontend, 'node_modules'))) {
      console.log('Installing frontend dependencies...');
      await spawnCommand(npmCommand, ['install', '--no-progress', '--no-color']);
    }
    
    // Run the appropriate build command based on persona
    let buildCommand;
    switch (persona.toLowerCase()) {
      case 'faculty':
        buildCommand = ['run', 'build:faculty', '--no-progress', '--no-color'];
        break;
      case 'lecturer':
        buildCommand = ['run', 'build:lecturer', '--no-progress', '--no-color'];
        break;
      case 'student':
        buildCommand = ['run', 'build:student', '--no-progress', '--no-color'];
        break;
      default:
        throw new Error(`Unknown persona: ${persona}`);
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

/**
 * Create a distribution package for a specific persona
 */
export async function createDistPackage(persona, force = false) {
  console.log(`\n=== Creating Distribution Package ===`);
  console.log(`Persona: ${persona}`);
  console.log(`Force rebuild: ${force}`);

  // Validate persona before proceeding
  const safePersona = getPersonaFromKey(persona);

  // Get fresh paths for the specified persona
  const { isDistPackage, isRootRepo, root } = resolvePaths({ safePersona });
  
  // Skip package creation if in distribution package mode
  if (isDistPackage) {
    console.log(`✓ Running in distribution package mode - package creation skipped for ${safePersona}`);
    return { success: true, skipped: true };
  }
  
  // Only proceed with package creation if in root repository or forced
  if (!isRootRepo && !force) {
    console.log(`✓ Not running from root repository - skipping package creation for ${safePersona}`);
    return { success: true, skipped: true };
  }
  
  if (!force && checkDistExists(safePersona)) {
    console.log(`✓ Distribution package for ${safePersona} already exists. Use --force to recreate.`);
    return { success: true, skipped: true };
  }
  
  try {
    // Step 1: Build the persona first
    console.log(`\n[1/12] Building persona ${safePersona}...`);
    const buildResult = await buildPersona(safePersona, force);
    if (!buildResult.success) {
      throw new Error(`Build failed for persona ${safePersona}`);
    }
    
    // Step 2: Get fresh paths for the specified persona
    console.log(`[2/12] Resolving paths for ${safePersona}...`);
    const { frontend, backend, dist, ecosystem } = resolvePaths({ safePersona });
    
    // Step 3: Get the name and version from frontend package.json
    console.log(`[3/12] Reading package information...`);
    const packageJsonPath = path.join(frontend, 'package.json');
    let packageName = 'university-curriculum-enabling-tool';
    let packageVersion = '';
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName = packageJson.name || packageName;
        packageVersion = packageJson.version || '';
        console.log(`Using package name: ${packageName}, version: ${packageVersion} from package.json`);
      } catch (error) {
        console.warn(`Failed to parse package.json: ${error.message}. Using default package name.`);
      }
    } else {
      console.warn(`package.json not found at ${packageJsonPath}. Using default package name.`);
    }
    
    // Step 4: Create dist directory structure with name and version
    console.log(`Step 4: Creating distribution directory structure...`);
    const versionString = packageVersion ? `-${packageVersion}` : '';
    // For faculty persona, don't append the persona label
    const distDir = persona.toLowerCase() === 'faculty' 
      ? path.join(dist, `${packageName}${versionString}`) 
      : path.join(dist, `${packageName}${versionString}-${safePersona}`);
    const zipFile = `${distDir}.zip`;

    
    fs.mkdirSync(distDir, { recursive: true });
    
    // Step 4.1: Copy thirdparty dependencies (Node.js, jq, pm2, Ollama)
    console.log(`Step 4.1: Copying thirdparty dependencies...`);
    fs.mkdirSync(path.join(distDir, 'thirdparty'), { recursive: true });
    
    // Copy Node.js if it exists
    const sourceNodeDir = path.join(root, 'thirdparty', 'node');
    if (fs.existsSync(sourceNodeDir)) {
      console.log(`Copying Node.js from ${sourceNodeDir}...`);
      const targetNodeDir = path.join(distDir, 'thirdparty', 'node');
      
      // Use robocopy on Windows for better handling of long paths
      if (isWindows) {
        try {
          const robocopyArgs = [
            sourceNodeDir,     // Source directory (unquoted for spawnSync)
            targetNodeDir,     // Target directory (unquoted for spawnSync)
            '/E',    // Copy subdirectories, including empty ones
            '/R:3',  // Retry 3 times on failed copies
            '/W:1',  // Wait 1 second between retries
            '/NFL',  // No file list (reduce output)
            '/NDL',  // No directory list
            '/NJH',  // No job header
            '/NJS',  // No job summary
            '/NC',   // No class
            '/NS',   // No size
            '/NP'    // No progress
          ];
          
          const robocopyResult = spawnSync('robocopy', robocopyArgs, { 
            stdio: ['ignore', 'ignore', 'pipe'], 
            encoding: 'utf8',
            timeout: 60000 // 60 second timeout for large copy operations
          });
          // Robocopy exit codes 0-7 are success, 8+ are errors
          const exitCode = robocopyResult.status || 0;
          if (exitCode >= 8) {
            console.warn(`Warning: Robocopy failed with exit code ${exitCode}, falling back to fs.copySync`);
            fs.copySync(sourceNodeDir, targetNodeDir);
          } else {
            console.log(`Node.js copied successfully using robocopy (exit code: ${exitCode})`);
          }
        } catch (error) {
          console.warn(`Warning: Robocopy command failed, falling back to fs.copySync: ${error.message}`);
          fs.copySync(sourceNodeDir, targetNodeDir);
        }
      } else {
        // Use standard copy on non-Windows systems
        fs.copySync(sourceNodeDir, targetNodeDir);
      }
    } else {
      console.log(`Node.js not found at ${sourceNodeDir}, will be downloaded during installation`);
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'node'), { recursive: true });
    }
    
    // Copy jq if it exists
    const sourceJqDir = path.join(root, 'thirdparty', 'jq');
    if (fs.existsSync(sourceJqDir)) {
      console.log(`Copying jq from ${sourceJqDir}...`);
      fs.copySync(sourceJqDir, path.join(distDir, 'thirdparty', 'jq'));
    } else {
      console.log(`jq not found at ${sourceJqDir}, will be downloaded during installation`);
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'jq'), { recursive: true });
    }
    
    // Copy pm2 directory (create empty if not exists)
    fs.mkdirSync(path.join(distDir, 'thirdparty', 'pm2'), { recursive: true });
    
    // Copy Ollama if it exists
    const sourceOllamaDir = path.join(root, 'thirdparty', 'ollama');
    if (fs.existsSync(sourceOllamaDir)) {
      console.log(`Copying Ollama from ${sourceOllamaDir}...`);
      fs.copySync(sourceOllamaDir, path.join(distDir, 'thirdparty', 'ollama'));
    } else {
      console.log(`Ollama not found at ${sourceOllamaDir}, will be downloaded during installation`);
      fs.mkdirSync(path.join(distDir, 'thirdparty', 'ollama'), { recursive: true });
    }

    // Step 5: Clean up existing dist package if force is true
    if (force) {
      console.log(`Step 5: Cleaning up existing distribution package...`);
      if (isSafeRelativePath(distDir) &&  fs.existsSync(distDir)) {
        fs.removeSync(fileURLToPath(new URL(`file://${path.resolve(distDir)}`)));
      }
      if (isSafeRelativePath(zipFile) && fs.existsSync(zipFile)) {
        fs.removeSync(fileURLToPath(new URL(`file://${path.resolve(zipFile)}`)));
      }
    }
    
    // Create dist directory
    fs.mkdirSync(distDir, { recursive: true });
    
    // Step 6: Create assets directory structure for deployment personas (faculty only)
    if (safePersona.toLowerCase() === 'faculty') {
      console.log(`Step 6: Creating assets directory structure for faculty...`);
      const assetsDir = path.join(distDir, 'assets');
      const deploymentDir = path.join(assetsDir, 'deployment');
      const personasDir = path.join(deploymentDir, 'personas');
      
      // Create directories for lecturer and student personas
      fs.mkdirSync(path.join(personasDir, 'lecturer'), { recursive: true });
      fs.mkdirSync(path.join(personasDir, 'student'), { recursive: true });
      
      console.log('Created assets/deployment/personas structure for faculty distribution package');
    }
    
    // Step 7: Get Next.js build directory for the specific persona
    console.log(`Step 7: Copying Next.js build for ${safePersona}...`);
    const nextPersonaDir = path.join(frontend, `next-${safePersona.toLowerCase()}`);
    if (!fs.existsSync(nextPersonaDir)) {
      throw new Error(`Next.js build directory for persona '${persona}' not found at ${nextPersonaDir}`);
    }
    
    // Create target directories in dist package
    const distNextDir = path.join(distDir, `next-${safePersona.toLowerCase()}`);
    fs.mkdirSync(path.join(distNextDir, 'standalone'), { recursive: true });
    
    // Copy the entire standalone folder from the Next.js build for this persona,
    // but exclude any next-<other_persona> directories.
    console.log(`Copying Next.js standalone build for persona: ${safePersona}...`);
    const standaloneDir = path.join(nextPersonaDir, 'standalone');
    if (!fs.existsSync(standaloneDir)) {
      throw new Error(`Next.js standalone build directory not found at ${standaloneDir}`);
    }

    // Only copy the next-<persona> directory inside standalone
    const personaStandaloneDir = path.join(standaloneDir, `next-${safePersona.toLowerCase()}`);
    if (!fs.existsSync(personaStandaloneDir)) {
      throw new Error(`Standalone directory for persona '${safePersona}' not found at ${personaStandaloneDir}`);
    }
    fs.copySync(
      personaStandaloneDir,
      path.join(distNextDir, 'standalone', `next-${safePersona.toLowerCase()}`)
    );

    // Copy any other files or folders in standalone except next-<other_persona> directories
    const entries = fs.readdirSync(standaloneDir);
    for (const entry of entries) {
      const entryPath = path.join(standaloneDir, entry);
      // Skip next-<other_persona> directories
      if (
      entry.startsWith('next-') &&
      entry !== `next-${safePersona.toLowerCase()}` &&
      fs.statSync(entryPath).isDirectory()
      ) {
      continue;
      }
      // Skip the persona directory (already copied)
      if (entry === `next-${safePersona.toLowerCase()}`) continue;

      const destPath = path.join(distNextDir, 'standalone', entry);
      fs.copySync(entryPath, destPath);
    }
    
    // Copy static folder from Next.js build to the dist package's standalone folder
    console.log(`Copying Next.js static assets for persona: ${safePersona}...`);
    const staticDir = path.join(nextPersonaDir, 'static');
    if (fs.existsSync(staticDir)) {
      fs.copySync(staticDir, path.join(distNextDir, 'standalone', `next-${safePersona.toLowerCase()}`, 'static'));
    } else {
      console.warn(`Static directory not found at ${staticDir}`);
    }
    
    // List of scripts to include in the dist package
    const scriptsToInclude = [
      'setup.sh', 'install.sh', 'run.sh', 'stop.sh', 'uninstall.sh',
      'setup_win.bat', 'install_win.bat', 'run_win.bat', 'stop_win.bat', 'uninstall_win.bat',
      'setup.ps1', 'install.ps1', 'run.ps1', 'stop.ps1', 'uninstall.ps1'
    ];
    // Step 8: For faculty persona, populate the assets/deployment/personas directories
    if (safePersona.toLowerCase() === 'faculty') {
      console.log(`Step 8: Populating deployment assets for other personas...`);
      const assetsDir = path.join(distDir, 'assets');
      const deploymentDir = path.join(assetsDir, 'deployment');
      const personasDir = path.join(deploymentDir, 'personas');
      
      // Define the personas to include
      const otherPersonas = ['lecturer', 'student'];
      
      for (const otherPersona of otherPersonas) {
        console.log(`Step 8.1: Setting up deployment files for ${otherPersona} persona...`);
        const personaDir = path.join(personasDir, otherPersona);
        
        // Step 8.2: Copy scripts for this persona
        console.log(`Step 8.2: Copying scripts for ${otherPersona} persona...`);
        for (const script of scriptsToInclude) {
          let sourcePath;
          if (script.endsWith('.ps1')) {
            continue;
          } else if (script.endsWith('.sh') || script.endsWith('.bat')) {
            // Bash and batch scripts: copy from project root
            sourcePath = path.join(root, script);
          } else {
            // Fallback: project root
            sourcePath = path.join(root, script);
          }
          if (fs.existsSync(sourcePath)) {
            fs.copySync(sourcePath, path.join(personaDir, script));
            // Make shell scripts executable
            if (!isWindows && script.endsWith('.sh')) {
              fs.chmodSync(path.join(personaDir, script), '755');
            }
          }
        }

        // Step 8.3: Create placeholder .version file for the persona
        console.log(`Step 8.3: Creating version file for ${otherPersona} persona...`);
        const date = new Date().toISOString().split('T')[0];
        const personaVersion = `${date}-${otherPersona.toLowerCase()}`;
        fs.writeFileSync(path.join(personaDir, '.version'), personaVersion);
        
        // Step 8.4: Create scripts directory with utils
        console.log(`Step 8.4: Creating scripts directory for ${otherPersona} persona...`);
        fs.mkdirSync(path.join(personaDir, 'scripts'), { recursive: true });
        fs.copySync(__dirname, path.join(personaDir, 'scripts'));
        
        // Step 8.5: Create backend directory
        console.log(`Step 8.5: Creating backend directory for ${otherPersona} persona...`);
        fs.mkdirSync(path.join(personaDir, 'backend'), { recursive: true });
        const backendDest = path.join(personaDir, 'backend');
        if (isSafeRelativePath(backendDest)) {
          const backendUrl = fileURLToPath(new URL(`file://${path.resolve(backend)}`));
          const backendDestUrl = fileURLToPath(new URL(`file://${path.resolve(backendDest)}`));
          fs.copySync(backendUrl, backendDestUrl);
        } else {
          console.warn(`Refused to copy backend to unsafe path: ${backendDest}`);
        }

        // Step 8.6: Create required empty directories
        console.log(`Step 8.6: Creating supporting directories for ${otherPersona} persona...`);
        fs.mkdirSync(path.join(personaDir, 'thirdparty'), { recursive: true });
        
        // Step 8.7: Create next-<persona> directory for this persona deployment
        console.log(`Step 8.7: Creating Next.js directories for ${otherPersona} persona...`);
        const personaNextDir = path.join(personaDir, `next-${otherPersona.toLowerCase()}`);
        fs.mkdirSync(path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`), { recursive: true });
        
        // Step 8.8: Get the appropriate next-<persona> build from the frontend directory
        console.log(`Step 8.8: Copying Next.js build for ${otherPersona} persona...`);
        const sourceNextPersonaDir = path.join(frontend, `next-${otherPersona.toLowerCase()}`);
        if (fs.existsSync(sourceNextPersonaDir)) {
          console.log(`Copying Next.js build for ${otherPersona} persona to deployment assets...`);
          
          // Copy standalone directory for this persona
          const sourceStandaloneDir = path.join(sourceNextPersonaDir, 'standalone');
          if (fs.existsSync(sourceStandaloneDir)) {
            // Get source next-persona directory from standalone
            const sourcePersonaStandaloneDir = path.join(sourceStandaloneDir, `next-${otherPersona.toLowerCase()}`);
            
            if (fs.existsSync(sourcePersonaStandaloneDir)) {
              // Copy the persona-specific standalone directory
              fs.copySync(
                sourcePersonaStandaloneDir,
                path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`)
              );
              
              // Copy other non-persona specific files from standalone
              const entries = fs.readdirSync(sourceStandaloneDir);
              for (const entry of entries) {
                const entryPath = path.join(sourceStandaloneDir, entry);
                // Skip next-<other_persona> directories
                if (
                  entry.startsWith('next-') &&
                  entry !== `next-${otherPersona.toLowerCase()}` &&
                  fs.statSync(entryPath).isDirectory()
                ) {
                  continue;
                }
                // Skip the persona directory (already copied)
                if (entry === `next-${otherPersona.toLowerCase()}`) continue;

                const destPath = path.join(personaNextDir, 'standalone', entry);
                fs.copySync(entryPath, destPath);
              }
            } else {
              console.warn(`Standalone directory for persona '${otherPersona}' not found at ${sourcePersonaStandaloneDir}`);
              // Fallback to copying the entire standalone directory
              fs.copySync(sourceStandaloneDir, path.join(personaNextDir, 'standalone'));
            }
          } else {
            console.warn(`Standalone directory not found for ${otherPersona} at ${sourceStandaloneDir}`);
          }
          
          // Copy static directory for this persona if it exists
          const sourceStaticDir = path.join(sourceNextPersonaDir, 'static');
          if (fs.existsSync(sourceStaticDir)) {
            // Copy static assets to the correct location: next-<persona>/standalone/next-<persona>/static
            fs.copySync(sourceStaticDir, path.join(personaNextDir, 'standalone', `next-${otherPersona.toLowerCase()}`, 'static'));
          }
        } else {
          console.warn(`No Next.js build found for ${otherPersona} persona at ${sourceNextPersonaDir}`);
        }
        
        // Step 8.9: Copy and modify ecosystem config
        console.log(`Step 8.9: Setting up ecosystem config for ${otherPersona} persona...`);
        if (fs.existsSync(ecosystem)) {
          const ecosystemDestPath = path.join(personaDir, 'ecosystem.config.cjs');
          fs.copySync(ecosystem, ecosystemDestPath);
          
          // Modify the ecosystem config to use this persona as the default
          try {
            let ecosystemContent = fs.readFileSync(ecosystemDestPath, 'utf8');
            
            // Replace the default persona in the ecosystem config
            ecosystemContent = ecosystemContent.replace(
              /const persona = process\.env\.PERSONA \|\| ['"]faculty['"]/g,
              `const persona = process.env.PERSONA || '${otherPersona}'`
            );
            
            fs.writeFileSync(ecosystemDestPath, ecosystemContent);
            console.log(`Updated ecosystem.config.cjs to default to ${otherPersona} persona`);
          } catch (err) {
            console.warn(`Failed to update ecosystem config for ${otherPersona}: ${err.message}`);
          }
        } else {
          console.warn(`Ecosystem config not found at ${ecosystem}. No ecosystem config will be included.`);
        }
      
        // Step 8.10: Create a persona-specific .env.template
        console.log(`Step 8.10: Creating environment template for ${otherPersona} persona...`);
        const rootEnvTemplateFile = path.join(ROOT_DIR, '.env.template');
        if (fs.existsSync(rootEnvTemplateFile)) {
          console.log(`Creating persona-specific .env.template for ${otherPersona}...`);
          
          // Read the template content
          let envContent = fs.readFileSync(rootEnvTemplateFile, 'utf8');
          
          // Add PERSONA environment variable to the template if it doesn't exist
          if (!/^PERSONA=/m.test(envContent)) {
            // Add PERSONA to the beginning of the file after the first comment block
            const commentSection = 
              "# =============================================\n" +
              "# Persona Configuration\n" +
              "# =============================================\n";
            
            envContent = commentSection + 
              `PERSONA=${otherPersona}             # Default persona for this deployment\n\n` + 
              envContent;
          } else {
            // Update existing PERSONA variable
            envContent = envContent.replace(
              /^PERSONA=.*$/m, 
              `PERSONA=${otherPersona}             # Default persona for this deployment`
            );
          }
          
          // Write the modified template to the persona directory
          fs.writeFileSync(path.join(personaDir, '.env.template'), envContent);
          console.log(`Created persona-specific .env.template for ${otherPersona}`);
        } else {
          console.warn(`Root .env.template file not found at ${rootEnvTemplateFile}. No environment template will be included.`);
        }
        
        // Step 8.11: Update all scripts to use the correct persona by default
        console.log(`Step 8.11: Updating all scripts for ${otherPersona} persona...`);
        const scriptsToUpdate = ['setup.sh', 'install.sh', 'run.sh', 'stop.sh', 'uninstall.sh',
             'setup_win.bat', 'install_win.bat', 'run_win.bat', 'stop_win.bat', 'uninstall_win.bat',
             'setup.ps1', 'install.ps1', 'run.ps1', 'stop.ps1', 'uninstall.ps1'];
        
        for (const script of scriptsToUpdate) {
          const scriptPath = path.join(personaDir, script);
          if (fs.existsSync(scriptPath)) {
            try {
              let scriptContent = fs.readFileSync(scriptPath, 'utf8');
              
              if (script.endsWith('.sh')) {
                // Update Linux shell script
                scriptContent = scriptContent.replace(
                  /PERSONA=\${1:-faculty}/g,
                  `PERSONA=\${1:-${otherPersona}}`
                );
              } else if (script.endsWith('.bat')) {
                // Update Windows batch script - handle multiple patterns
                // Pattern 1: set "Persona=faculty" 
                scriptContent = scriptContent.replace(
                  /set "Persona=faculty"/g,
                  `set "Persona=${otherPersona}"`
                );
                // Pattern 2: if "%Persona%"=="" set "Persona=faculty"
                scriptContent = scriptContent.replace(
                  /if "%Persona%"=="" set "Persona=faculty"/g,
                  `if "%Persona%"=="" set "Persona=${otherPersona}"`
                );
                // Pattern 3: Legacy formats without quotes
                scriptContent = scriptContent.replace(
                  /if "%PERSONA%"=="" set PERSONA=faculty/g,
                  `if "%PERSONA%"=="" set PERSONA=${otherPersona}`
                );
              } else if (script.endsWith('.ps1')) {
                // Update PowerShell script - handle multiple patterns
                // Pattern 1: Single line format (install.ps1, uninstall.ps1)
                scriptContent = scriptContent.replace(
                  /\$Persona = if \(\$args\[0\]\) \{ \$args\[0\] \} else \{ "faculty" \}/g,
                  `$Persona = if ($args[0]) { $args[0] } else { "${otherPersona}" }`
                );
                // Pattern 2: Multi-line if/else format (run.ps1 final fallback)
                scriptContent = scriptContent.replace(
                  /Write-Host "No persona indicators found, defaulting to faculty"\s*"faculty"/g,
                  `Write-Host "No persona indicators found, defaulting to ${otherPersona}"\n            "${otherPersona}"`
                );
                // Pattern 3: Default persona in multi-line auto-detection fallback
                scriptContent = scriptContent.replace(
                  /} else \{\s*Write-Host "No persona indicators found, defaulting to faculty"\s*"faculty"\s*\}/g,
                  `} else {\n            Write-Host "No persona indicators found, defaulting to ${otherPersona}"\n            "${otherPersona}"\n        }`
                );
              }
              
              fs.writeFileSync(scriptPath, scriptContent);
              console.log(`Updated ${script} to default to ${otherPersona} persona`);
            } catch (err) {
              console.warn(`Failed to update ${script} for ${otherPersona}: ${err.message}`);
            }
          }
        }
      }
    }
    
    // Step 9: Create .env.template for main distribution package
    console.log(`Step 9: Creating environment template...`);
    const rootEnvTemplateFile = path.join(ROOT_DIR, '.env.template');
    
    if (fs.existsSync(rootEnvTemplateFile)) {
      console.log('Creating persona-specific .env.template for main distribution package...');
      
      // Read the template content
      let envContent = fs.readFileSync(rootEnvTemplateFile, 'utf8');
      
      // Make sure the PERSONA environment variable is set to the current persona
      if (!/^PERSONA=/m.test(envContent)) {
        // Add PERSONA to the beginning of the file after the first comment block
        const commentSection = 
          "# =============================================\n" +
          "# Persona Configuration\n" +
          "# =============================================\n";
        
        envContent = commentSection + 
          `PERSONA=${safePersona}             # Default persona for this deployment\n\n` + 
          envContent;
      } else {
        // Update existing PERSONA variable
        envContent = envContent.replace(
          /^PERSONA=.*$/m, 
          `PERSONA=${safePersona}             # Default persona for this deployment`
        );
      }
      
      // Write the modified template to the distribution package
      fs.writeFileSync(path.join(distDir, '.env.template'), envContent);
      console.log(`Created persona-specific .env.template for ${safePersona} distribution package`);
    } else {
      console.warn(`Root .env.template file not found at ${rootEnvTemplateFile}. No environment template will be included.`);
    }
    
    // Step 10: Copy backend, scripts and configuration files
    console.log(`Step 10: Copying backend, scripts and configuration files...`);
    fs.copySync(backend, path.join(distDir, 'backend'));
    fs.copySync(__dirname, path.join(distDir, 'scripts'));

    // Copy shell and batch scripts to root of dist (but keep PowerShell scripts in powershell folder)
    for (const script of scriptsToInclude) {
      let sourcePath;
      if (script.endsWith('.ps1')) {
        // PowerShell scripts are now only in the powershell folder, not root
        continue;
      } else if (script.endsWith('.sh') || script.endsWith('.bat')) {
        // Bash and batch scripts: copy from project root
        sourcePath = path.join(root, script);
      } else {
        // Fallback: project root
        sourcePath = path.join(root, script);
      }
      if (fs.existsSync(sourcePath)) {
        fs.copySync(sourcePath, path.join(distDir, script));
      }
    }
    
    // Copy ecosystem config
    if (fs.existsSync(ecosystem)) {
      fs.copySync(ecosystem, path.join(distDir, 'ecosystem.config.cjs'));
    }
    
    // Step 10.1: Update main distribution package scripts to use correct persona defaults
    console.log(`Step 10.1: Updating main distribution package scripts for ${safePersona} persona...`);
    const mainScriptsToUpdate = ['setup.sh', 'install.sh', 'run.sh', 'stop.sh', 'uninstall.sh',
         'setup_win.bat', 'install_win.bat', 'run_win.bat', 'stop_win.bat', 'uninstall_win.bat',
         'setup.ps1', 'install.ps1', 'run.ps1', 'stop.ps1', 'uninstall.ps1'];
    
    for (const script of mainScriptsToUpdate) {
      const scriptPath = path.join(distDir, script);
      if (fs.existsSync(scriptPath)) {
        try {
          let scriptContent = fs.readFileSync(scriptPath, 'utf8');
          if (script.endsWith('.sh')) {
            // Update Linux shell script
            scriptContent = scriptContent.replace(
              /PERSONA=\${1:-faculty}/g,
              `PERSONA=\${1:-${safePersona}}`
            );
          } else if (script.endsWith('.bat')) {
            // Update Windows batch script - handle multiple patterns
            scriptContent = scriptContent.replace(
              /set "Persona=faculty"/g,
              `set "Persona=${safePersona}"`
            );
            scriptContent = scriptContent.replace(
              /if "%Persona%"=="" set "Persona=faculty"/g,
              `if "%Persona%"=="" set "Persona=${safePersona}"`
            );
            scriptContent = scriptContent.replace(
              /if "%PERSONA%"=="" set PERSONA=faculty/g,
              `if "%PERSONA%"=="" set PERSONA=${safePersona}`
            );
          } else if (script.endsWith('.ps1')) {
            // Update PowerShell script - handle multiple patterns
            scriptContent = scriptContent.replace(
              /\$Persona = if \(\$args\[0\]\) \{ \$args\[0\] \} else \{ "faculty" \}/g,
              `$Persona = if ($args[0]) { $args[0] } else { "${safePersona}" }`
            );
            scriptContent = scriptContent.replace(
              /"faculty"/g,
              `"${safePersona}"`
            );
          }
          fs.writeFileSync(scriptPath, scriptContent);
          console.log(`Updated main distribution ${script} to default to ${safePersona} persona`);
        } catch (err) {
          console.warn(`Failed to update main distribution ${script} for ${safePersona}: ${err.message}`);
        }
      }
    }
    
    // Step 11: Create version file
    console.log(`Step 11: Creating version file...`);
    const date = new Date().toISOString().split('T')[0];
    const version = `${date}-${safePersona.toLowerCase()}`;
    fs.writeFileSync(path.join(distDir, '.version'), version);
    
    // Double-check that the version file was created
    if (!fs.existsSync(path.join(distDir, '.version'))) {
      console.error('Failed to create .version file in distribution package');
      throw new Error('Failed to create .version file in distribution package');
    }
    
    // Make shell scripts executable
    if (!isWindows) {
      for (const script of scriptsToInclude.filter(s => s.endsWith('.sh'))) {
        const scriptPath = path.join(distDir, script);
        if (fs.existsSync(scriptPath)) {
          fs.chmodSync(scriptPath, '755');
        }
      }
    }
    
    // Step 12: Create zip archive
    console.log(`Step 12: Creating zip archive...`);
    const appName = path.basename(distDir);
    console.log(`Creating zip archive with app name: ${appName}`);
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

/**
 * Create a zip archive from a directory
 */
async function createZipArchive(sourceDir, outputZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      console.log(`Archive created: ${outputZip} (${archive.pointer()} bytes)`);
      resolve();
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    // Get the directory name to use as the base folder inside the zip
    const dirName = path.basename(sourceDir);
    
    archive.pipe(output);
    // Using dirName as the top-level directory in the zip file
    archive.directory(sourceDir, dirName);
    archive.finalize();
  });
}

/**
 * Setup backend environment
 * @param {boolean} force - Force recreation of environment
 */
export async function setupBackend(force = false) {
  console.log('Setting up backend environment...');
  
  // Get fresh paths
  const { venv, backend, root } = resolvePaths();
  
  const backendPath = backend;
  const venvPath = venv;
  
  console.log(`Using backend path: ${backendPath}`);
  console.log(`Using venv path: ${venvPath}`);
  
  if (!force && fs.existsSync(venvPath)) {
    console.log('Backend environment already exists. Use --force to recreate.');
    return { success: true };
  }
  
  try {
    // Remove existing venv if forcing
    if (isSafeRelativePath(venvPath)) {
      const resolvedVenvPath = path.resolve(ROOT_DIR, venvPath);
      fs.removeSync(resolvedVenvPath);
    } else {
      throw new Error('Venv path is invalid');
    }    

    // Ensure the parent directory exists
    const venvParentDir = path.dirname(venvPath);
    if (!fs.existsSync(venvParentDir)) {
      fs.mkdirSync(venvParentDir, { recursive: true });
    }
    
    process.chdir(backendPath);
    
    // Get the appropriate Python command dynamically
    const pythonCmd = getDynamicPythonCommand();
    console.log(`Using Python command: ${pythonCmd}`);
    
    // Verify Python is available
    try {
      console.log(`Verifying Python is available...`);
      const result = spawnSync(pythonCmd, ['--version'], { 
        stdio: 'pipe',
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(`Python version check failed with exit code ${result.status}`);
      }
    } catch (error) {
      console.error(`Python not found using command: ${pythonCmd}`);
      console.error(`Error details: ${error.message}`);
      console.error(`\nTo install Python on Windows:`);
      console.error(`1. Download Python from https://python.org/downloads/`);
      console.error(`2. Or install from Microsoft Store: run 'python' in PowerShell and follow prompts`);
      console.error(`3. Ensure Python is added to your PATH during installation`);
      console.error(`4. Or run setup.ps1 to install Python automatically`);
      return { success: false, error: new Error(`Python not available.`) };
    }
    
    // Create virtual environment
    console.log('Creating Python virtual environment...');
    await spawnCommand(pythonCmd, ['-m', 'venv', 'venv']);
    
    // Install requirements
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

/**
 * Start backend server
 */
export async function startBackend() {
  console.log('Starting backend server...');
  
  // Get fresh paths
  const { venv, backend, root } = resolvePaths();

  const backendPath = backend;
  const venvPath = venv;
    
  console.log(`Using backend path: ${backendPath}`);
  console.log(`Using venv path: ${venvPath}`);
  
  if (!fs.existsSync(venvPath)) {
    console.log('Backend environment not found. Setting up...');
    const setupResult = await setupBackend(false, backendPath, venvPath);
    if (!setupResult.success) {
      throw new Error('Failed to setup backend environment');
    }
  }
  
  try {
    process.chdir(backendPath);
    
    // Start backend with PM2
    console.log('Starting backend with PM2...');
    
    // Get the venv Python path based on the venv path
    const venvPythonPath = isWindows 
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
      
    await executePM2Command([
      'start', 'main.py',
      '--name', 'backend',
      '--interpreter', venvPythonPath
    ]);
    
    console.log('Backend server started successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start backend server:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

/**
 * Setup Ollama
 * @param {boolean} force - Force recreation of environment
 */
export async function setupOllama(force = false) {
  console.log('Setting up Ollama...');
  
  // Get fresh paths
  const { thirdparty, ollama, root } = resolvePaths();
  
  // Use custom paths if provided, otherwise use defaults
  const ollamaPath = ollama;
  console.log(`Using Ollama path: ${ollamaPath}`);
  
  try {
    const version = readEnvVariable('OLLAMA_VERSION', "2.2.0");
    const archiveExtension = isWindows ? "zip" : "tgz";
    const ollamaArchive = `ollama-ipex-llm-${version}-${isWindows ? "win" : "ubuntu"}.${archiveExtension}`;
    const ollamaDownloadUrl = `https://github.com/ipex-llm/ipex-llm/releases/download/v${version}/ollama-ipex-llm-${version}-${isWindows ? "win" : "ubuntu"}.${archiveExtension}`;
    
    // Ensure parent directory exists
    const ollamaParentDir = path.dirname(ollamaPath);
    if (!fs.existsSync(ollamaParentDir)) {
      fs.mkdirSync(ollamaParentDir, { recursive: true });
    }
    
    if (!fs.existsSync(ollamaPath)) {
      fs.mkdirSync(ollamaPath, { recursive: true });
    }
    
    process.chdir(ollamaPath);
    
    // Check if Ollama is already extracted - look for key files directly in the ollama directory
    const ollamaBinPath = isWindows 
      ? path.join(ollamaPath, 'ollama.exe')
      : path.join(ollamaPath, 'ollama');
    
    const startScriptPath = isWindows
      ? path.join(ollamaPath, 'ollama.exe') // Windows uses exe directly
      : path.join(ollamaPath, 'start-ollama.sh');
    
    if (fs.existsSync(ollamaBinPath) && fs.existsSync(startScriptPath)) {
      console.log('Ollama is already downloaded and extracted. Skipping download.');
      
      // Make sure the binaries are executable on Linux
      if (!isWindows) {
        await spawnCommand('chmod', ['+x', ollamaBinPath]);
        await spawnCommand('chmod', ['+x', startScriptPath]);
        console.log('Ensured Ollama binaries are executable');
      }
      
      console.log('Ollama setup completed successfully.');
      return { success: true };
    } else {
      console.log('Ollama installation not found or incomplete. Downloading...');
    }

    // Download Ollama
    console.log(`Downloading Ollama from ${ollamaDownloadUrl}...`);
    console.log(`This may take a few minutes depending on your internet connection...`);

    /**
     * File downloads are handled directly by system tools:
     * - Windows: PowerShell Invoke-WebRequest
     * - Linux: curl (native system command)
     */
    if (isWindows) {
      // Get the proper PowerShell path
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      console.log(`Using PowerShell at: ${powerShellPath}`);

      await spawnCommand(powerShellPath, [
        '-Command',
        `Invoke-WebRequest -Uri "${ollamaDownloadUrl}" -OutFile "${ollamaArchive}" -UseBasicParsing -TimeoutSec 600`
      ], { timeout: 650000 }); // 10+ minute timeout
      console.log('PowerShell download completed successfully');
    } else {
      // On Linux, use curl
      await spawnCommand('curl', [
        '--fail', '--location', '--retry', '5', '--retry-delay', '10',
        '--connect-timeout', '60', '--max-time', '600', // 10 minute max time
        '--progress-bar', '--output', ollamaArchive, ollamaDownloadUrl
      ], { timeout: 650000 }); // 10+ minute timeout
      console.log('Curl download completed successfully');
    }

    console.log('Extracting Ollama archive...');
    
    if (isWindows) {
      // Extract directly into the current directory (ollama)
      const powerShellPath = ALLOWED_COMMANDS_CONFIG.powershell.path;
      await spawnCommand(powerShellPath, ['-Command', `Expand-Archive -Path "${ollamaArchive}" -DestinationPath "." -Force`]);
      
      // Clean up the downloaded archive file to save space
      if (fs.existsSync(ollamaArchive)) {
        console.log(`Cleaning up downloaded archive: ${ollamaArchive}`);
        fs.unlinkSync(ollamaArchive);
      }
    } else {
      // Extract directly into the current directory (ollama)
      await spawnCommand('tar', ['-xzf', ollamaArchive, '--strip-components=1']);
      
      // Make the ollama binary executable
      if (fs.existsSync('ollama')) {
        await spawnCommand('chmod', ['+x', 'ollama']);
      } else {
        throw new Error('Ollama binary not found after extraction');
      }
      
      // Make the start-ollama.sh script executable
      if (fs.existsSync('start-ollama.sh')) {
        await spawnCommand('chmod', ['+x', 'start-ollama.sh']);
        console.log('Made start-ollama.sh executable');
      } else {
        const errorMessage = 'start-ollama.sh script not found after extraction. Please ensure you have the correct version of Ollama with the start-ollama.sh script.';
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      // Clean up the downloaded archive file to save space
      if (fs.existsSync(ollamaArchive)) {
        console.log(`Cleaning up downloaded archive: ${ollamaArchive}`);
        fs.unlinkSync(ollamaArchive);
      }
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

/**
 * Start Ollama
 */
export async function startOllama() {
  console.log('Starting Ollama...');
  
  // Get fresh paths
  const { ollama, root } = resolvePaths();
  
  // Use custom path if provided
  const ollamaPath = ollama;
  console.log(`Using Ollama path: ${ollamaPath}`);
  
  if (!fs.existsSync(ollamaPath)) {
    console.log('Ollama not found. Setting up...');
    const setupResult = await setupOllama(false, ollamaPath);
    if (!setupResult.success) {
      throw new Error('Failed to setup Ollama');
    }
  }
  
  try {
    // Ollama files are now directly in the ollama directory
    process.chdir(ollamaPath);
    
    // Start Ollama with PM2
    if (isWindows) {
      // On Windows, start the ollama.exe directly
      console.log('Starting Ollama with PM2 on Windows...');
      
      // Set environment variables for Ollama
      const envVars = getOllamaEnvironmentVariables(root);
      
      await executePM2Command([
        'start', 'ollama.exe',
        '--name', 'ollama',
        '--env', JSON.stringify(envVars)
      ]);
    } else {
      // On Linux, use the start-ollama.sh script
      const startOllamaScriptPath = path.join(ollama, 'start-ollama.sh');
      
      if (!fs.existsSync(startOllamaScriptPath)) {
        const errorMessage = 'start-ollama.sh script not found in the Ollama directory. Please ensure you have the correct version of Ollama with the start-ollama.sh script.';
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      // Set environment variables for Ollama
      const envVars = getOllamaEnvironmentVariables(root);
      
      console.log('Starting Ollama with PM2 on Linux using start-ollama.sh...');
      await executePM2Command([
        'start', './start-ollama.sh',
        '--name', 'ollama',
        '--env', JSON.stringify(envVars)
      ]);
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

/**
 * Start frontend for a specific persona
 */
export async function startFrontend(persona) {
  console.log(`Starting frontend for persona: ${persona}`);
  
  // Get fresh paths
  const { root } = resolvePaths({ persona });
  
  try {
    // Get the standalone directory path for this persona
    const standaloneDir = path.join(root, `next-${persona.toLowerCase()}`, 'standalone');
    
    if (!fs.existsSync(standaloneDir)) {
      throw new Error(`Standalone directory not found for persona ${persona} at ${standaloneDir}`);
    }
    
    if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
      throw new Error(`server.js not found in standalone directory for persona ${persona}`);
    }
    
    if (isSafeRelativePath(standaloneDir)) {
      process.chdir(fileURLToPath(new URL(`file://${path.resolve(standaloneDir)}`)));
    } else {
      throw new Error(`Unsafe standalone directory detected: ${standaloneDir}`);
    }
    

    // Start frontend with PM2 using the standalone server.js
    console.log('Starting frontend with PM2 using standalone server.js...');
    
    await executePM2Command([
      'start', 'server.js',
      '--name', 'frontend',
      '--env', JSON.stringify({
        NODE_ENV: 'production',
        PERSONA: persona.toLowerCase(),
        PORT: 3000
      })
    ]);

    console.log('Frontend started successfully.');
    return { success: true };
  } catch (error) {
    console.error('Failed to start frontend:', error);
    return { success: false, error };
  } finally {
    process.chdir(root);
  }
}

/**
 * Start all services for a specific persona
 */
export async function startServices(persona) {
  console.log(`Starting all services for persona: ${persona}`);

  // Kill PM2 daemon to avoid stale state or path issues
  try {
    console.log('Killing PM2 daemon to ensure a clean state...');
    await executePM2Command(['kill']);
    console.log('PM2 daemon killed successfully.');
  } catch (err) {
    console.warn('Failed to kill PM2 daemon (it may not be running):', err);
  }

  // Get fresh paths with specified persona
  const { isDistPackage, isRootRepo, root, ollama, venv, backend, ecosystem, dist, frontend } = resolvePaths({ persona });
  
  try {
    // Get the name and version from frontend package.json
    const packageJsonPath = path.join(frontend, 'package.json');
    let packageName = 'university-curriculum-enabling-tool';
    let packageVersion = '';
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName = packageJson.name || packageName;
        packageVersion = packageJson.version || '';
      } catch (error) {
        console.warn(`Failed to parse package.json: ${error.message}. Using default package name.`);
      }
    }
    
    // Create package directory name with name and version from package.json
    const versionString = packageVersion ? `-${packageVersion}` : '';
    // For faculty persona, don't append the persona label
    const distPackage = persona.toLowerCase() === 'faculty' 
      ? path.join(dist, `${packageName}${versionString}`) 
      : path.join(dist, `${packageName}${versionString}-${persona}`);
    const distVersionFile = path.join(distPackage, '.version');
    
    // For repository environment, especially root repo, try to use the distribution package
    let useDistPackage = false;
    let distEcosystemConfig = null;
    
    // If we're in the root repository, we should use the dist package for services
    if (isRootRepo) {
      console.log('Running from root repository. Checking for distribution package...');
      
      // Check if we have a valid distribution package
      if (fs.existsSync(distPackage) && fs.existsSync(distVersionFile)) {
        console.log(`Found distribution package at ${distPackage}. Will use it for services.`);
        useDistPackage = true;
        distEcosystemConfig = path.join(distPackage, 'ecosystem.config.cjs');
      } else {
        console.error('ERROR: No valid distribution package found when running from root repository.');
        console.error('Please run install.sh/install.cmd to create a distribution package first.');
        process.exit(1);
      }
    } 
    // For non-root, non-dist package environments
    else if (!isDistPackage) {
      // If we don't have a distribution package with a .version file, refuse to continue
      if (!fs.existsSync(distPackage) || !fs.existsSync(distVersionFile)) {
        console.error('ERROR: No valid distribution package found.');
        console.error('Please run install.sh/install.cmd to create a distribution package first.');
        process.exit(1);
      } else {
        console.log(`Found distribution package at ${distPackage}. Continuing...`);
      }
    }

    // Get the backend and Ollama paths
    // If using distribution package from root repo, use the paths from distPackage
    let backendPath = backend;
    let ollamaPath = ollama;
    let venvPath = venv;
    
    if (useDistPackage) {
      console.log('Using backend and Ollama from distribution package...');
      backendPath = path.join(distPackage, 'backend');
      ollamaPath = path.join(distPackage, 'thirdparty', 'ollama');
      venvPath = path.join(distPackage, 'backend', 'venv');
    }
    
    // Setup backend if needed - always check the correct path based on our environment
    if (!fs.existsSync(venvPath)) {
      console.log('Backend environment not found. Setting up...');
      const setupResult = await setupBackend(false, backendPath, venvPath);
      if (!setupResult.success) {
        console.warn('Failed to setup backend, but continuing...');
      }
    }

    // Setup Ollama if needed - always check the correct path based on our environment
    const ollamaBinPath = isWindows 
      ? path.join(ollamaPath, 'ollama.exe')
      : path.join(ollamaPath, 'ollama');
    const ollamaStartScript = isWindows
      ? path.join(ollamaPath, 'ollama.exe')
      : path.join(ollamaPath, 'start-ollama.sh');
      
    if (!fs.existsSync(ollamaPath) || !fs.existsSync(ollamaBinPath) || !fs.existsSync(ollamaStartScript)) {
      console.log(ollamaPath)
      console.log('Ollama not found or missing key files. Setting up...');
      const setupResult = await setupOllama(false, ollamaPath);
      if (!setupResult.success) {
        console.warn('Failed to setup Ollama, but continuing...');
      }
    }
    
    // Start all services using the ecosystem config
    console.log('Starting all services using PM2 ecosystem config...');
    console.log(`Current working directory: ${process.cwd()}`);
    
    // Set the persona in the environment
    process.env.PERSONA = persona.toLowerCase();
    
    // Get PM2 namespace
    const projectTag = getPM2Namespace();
    console.log(`Using PM2 namespace: ${projectTag}`);
    
    // Use the distribution package ecosystem config if we're in root repo
    const configToUse = useDistPackage ? distEcosystemConfig : ecosystem;
    console.log(`Using ecosystem config at: ${configToUse}`);
    
    // If using distribution package from root repo, we need to change to that directory
    if (useDistPackage) {
      console.log(`Changing directory to distribution package: ${distPackage}`);
      if (isSafeRelativePath(distPackage)) {
        process.chdir(fileURLToPath(new URL(`file://${path.resolve(distPackage)}`)));
        console.log(`New working directory: ${process.cwd()}`);
      } else {
        throw new Error(`Unsafe distribution package directory detected: ${distPackage}`);
      }
    }
    // Start PM2 services
    await executePM2Command(['start', configToUse, '--namespace', projectTag]); // !DEBUG
    console.log(`All services started successfully for persona: ${persona}`);
    
    // Check and display service status using checkServicesStatus instead of running pm2 list directly
    const serviceStatus = checkServicesStatus();
    
    if (serviceStatus.success) {
      console.log(`Services status: ${serviceStatus.running ? 'Running' : 'Not running'}`);
      
      if (serviceStatus.servicesCount > 0) {
        console.log(`Total services: ${serviceStatus.servicesCount}`);
        console.log(`Online services: ${serviceStatus.onlineCount}`);
        
        if (serviceStatus.errorCount > 0) {
          console.warn(`Error services: ${serviceStatus.errorCount} (${serviceStatus.errorNames})`);
        }
      }
    } else {
      console.warn('Failed to check services status:', serviceStatus.error);
    }
    
    return { success: true };
  } catch (error) {
    console.error(`Failed to start services for persona ${persona}:`, error);
    return { success: false, error };
  }
}

/**
 * Stop all services
 */
export async function stopServices(force = false) {
  console.log(`${force ? 'Removing' : 'Stopping'} all services...`);
  
  // Get fresh paths
  const { ecosystem } = resolvePaths();
  
  try {
    // Check if any PM2 processes exist using the service status check
    const { success, running, namespace, servicesNames } = checkServicesStatus();
    
    if (!success || !running) {
      console.log(`No PM2 services found with namespace '${namespace}' to stop. Skipping...`);
      return { success: true };
    } else {
      console.log(`Found running PM2 services: ${servicesNames}`);
    }
    
    // Use the ecosystem config if it exists
    if (fs.existsSync(ecosystem)) {
      console.log(`${force ? 'Removing' : 'Stopping'} all services using PM2 ecosystem config...`);
      await executePM2Command([force ? 'delete' : 'stop', 'all', '--namespace', namespace]);
    } else {
      // Fallback to stopping all services manually by namespace
      console.log(`${force ? 'Removing' : 'Stopping'} all services manually by namespace...`);
      await executePM2Command([force ? 'delete' : 'stop', 'all', '--namespace', namespace]);
    }
    
    console.log(`All services ${force ? 'removed' : 'stopped'} successfully.`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to ${force ? 'remove' : 'stop'} services:`, error);
    return { success: false, error };
  }
}

/**
 * Get the list of PM2 services filtered by namespace
 */
export function getServiceList() {
  console.log('Getting list of services...');
  
  try {
    // Get the namespace
    const namespace = getPM2Namespace();
    console.log(`Filtering PM2 services by namespace: ${namespace}`);

    // Fix PM2 command execution for Windows
    let listResult;
    if (isWindows) {
      // On Windows, try to run PM2 directly using Node.js
      const nodePath = fs.existsSync(path.join(NODE_DIR, 'node.exe')) ? path.join(NODE_DIR, 'node.exe') : 'node';
      const pm2BinPath = path.join(WORKING_DIR, 'node_modules', 'pm2', 'bin', 'pm2');
      
      if (fs.existsSync(pm2BinPath)) {
        // Use Node.js to run PM2 directly
        listResult = execCommand([nodePath, pm2BinPath, 'jlist', '--silent']);
      } else {
        // Fallback to npx, but use cmd.exe as shell
        listResult = execCommand(['cmd', '/c', 'npx', 'pm2', 'jlist', '--silent']);
      }
    } else {
      // On Linux, use the original approach
      listResult = execCommand([pm2Command, 'pm2', 'jlist', '--silent']);
    }
    
    if (!listResult.success) {
      const exitCode = listResult.code || 'unknown';
      const errorMessage = listResult.error || 'Unknown error';
      const stderrOutput = listResult.stderr || '';
      
      console.warn(`Failed to get PM2 process list (exit code: ${exitCode}):`);
      console.warn(`Error message: ${errorMessage}`);
      if (stderrOutput) console.warn(`Error details: ${stderrOutput}`);
      
      return { 
      success: false, 
      error: errorMessage,
      exitCode: exitCode,
      stderr: stderrOutput,
      services: [] 
      };
    }
    
    try {
      // Parse the JSON output
      const allProcesses = JSON.parse(listResult.output);
      console.log(`Found ${allProcesses.length} total PM2 processes`);

      // For debugging - save to a cross-platform temp location
      const tempDir = isWindows ? process.env.TEMP || 'C:\\temp' : '/tmp';
      const debugFile = path.join(tempDir, 'pm2_all_processes.json');
      try {
        fs.writeFileSync(debugFile, JSON.stringify(allProcesses, null, 2));
        console.log(`Saved all PM2 processes to ${debugFile} for debugging`);
      } catch (err) {
        console.warn('Failed to save debug file:', err.message);
      }

      // Filter processes by namespace
      const fullServices = allProcesses.filter(process => {
        const processNamespace = process.pm2_env?.namespace || '';
        console.log(`Process ${process.name}, namespace: ${processNamespace}`);
        return process.pm2_env && processNamespace === namespace;
      });

      // Create simplified service objects without pm2_env
      const services = fullServices.map(process => {
        // Get the current timestamp for reference
        const now = Date.now();
        const uptime = process.pm2_env?.pm_uptime || 0;

        // Log uptime details for debugging
        console.log(`Process ${process.name}: Raw uptime value = ${uptime}, Current time = ${now}`);

        return {
          name: process.name,
          id: process.pm_id,
          pid: process.pid,
          status: process.pm2_env?.status || 'unknown',
          namespace: process.pm2_env?.namespace || '',
          uptime: uptime,
          memory: process.monit?.memory || 0,
          cpu: process.monit?.cpu || 0,
          created_at: process.pm2_env?.created_at || 0
        };
      });

      const serviceCount = services.length;
      const serviceNames = services.map(p => p.name).join(', ');
      
      console.log(`Found ${serviceCount} services with namespace '${namespace}': ${serviceNames || 'none'}`);
      
      // If no services found with namespace, check for any relevant service names
      if (serviceCount === 0) {
        console.log('No services found with specified namespace, checking for known service names...');
        
        // Known service names we might be looking for
        const knownServiceNames = ['frontend', 'backend', 'ollama', 'faculty', 'lecturer', 'student'];
        
        const fullServicesByName = allProcesses.filter(process => {
          const name = process.name || '';
          return knownServiceNames.some(knownName => name.includes(knownName));
        });

        // Create simplified service objects for services by name
        const servicesByName = fullServicesByName.map(process => {
          // Get the current timestamp for reference
          const now = Date.now();
          const uptime = process.pm2_env?.pm_uptime || 0;
          
          // Log uptime details for debugging
          console.log(`Process ${process.name}: Raw uptime value = ${uptime}, Current time = ${now}`);
          
          return {
            name: process.name,
            id: process.pm_id,
            pid: process.pid,
            status: process.pm2_env?.status || 'unknown',
            namespace: process.pm2_env?.namespace || '',
            uptime: uptime,
            memory: process.monit?.memory || 0,
            cpu: process.monit?.cpu || 0,
            created_at: process.pm2_env?.created_at || 0
          };
        });
        
        if (servicesByName.length > 0) {
          console.log(`Found ${servicesByName.length} services matching known service names`);
          return { 
            success: true, 
            services: servicesByName, 
            serviceCount: servicesByName.length, 
            serviceNames: servicesByName.map(p => p.name).join(', '),
            namespace: 'any'
          };
        }
      }
      
      return { 
        success: true, 
        services, 
        serviceCount, 
        serviceNames,
        namespace
      };
    } catch (parseError) {
      console.warn('Failed to parse PM2 JSON output:', parseError);
      return { success: false, error: parseError.message, services: [] };
    }
  } catch (error) {
    console.warn('Error getting service list:', error);
    return { success: false, error: error.message, services: [] };
  }
}

/**
 * Check the status of services
 */
export function checkServicesStatus() {
  console.log('Checking services status...');
  
  try {
    const { success, services, serviceCount, serviceNames, namespace, error } = getServiceList();
    
    if (!success) {
      console.warn('Failed to get service list:', error);
      return { success: false, error, running: false };
    }
    
    // Save service details to a file for debugging
    try {
      const tempDir = isWindows ? process.env.TEMP || 'C:\\temp' : '/tmp';
      const statusFile = path.join(tempDir, 'service_status.json');
      fs.writeFileSync(statusFile, JSON.stringify({
        success, 
        serviceCount, 
        serviceNames, 
        namespace
      }, null, 2));
      console.log(`Saved service status to ${statusFile} for debugging`);
    } catch (err) {
      console.warn('Failed to save service status to file:', err.message);
    }
    
    if (serviceCount === 0) {
      console.log(`No services found with namespace '${namespace}' or matching known service names`);
      return { 
        success: true, 
        running: false, 
        message: `No services found with namespace '${namespace}' or matching known service names` 
      };
    }
    
    // Check for services in error state
    const errorServices = services.filter(service => service.status === 'errored');
    const errorCount = errorServices.length;
    const errorNames = errorServices.map(p => p.name).join(', ');
    
    // Check for services in online state
    const onlineServices = services.filter(service => service.status === 'online');
    const onlineCount = onlineServices.length;
    
    console.log(`Found ${serviceCount} services: ${serviceNames}`);
    console.log(`Online: ${onlineCount}, Error: ${errorCount}`);
    
    if (errorCount > 0) {
      console.warn(`Services in error state: ${errorNames}`);
    }
    
    return {
      success: true,
      running: serviceCount > 0,
      servicesCount: serviceCount,
      servicesNames: serviceNames,
      errorCount,
      errorNames,
      onlineCount,
      services,
      namespace
    };
  } catch (error) {
    console.warn('Error checking services status:', error);
    return { success: false, error: error.message, running: false };
  }
}

// Helper function to escape special characters in regex
function isSafeEnvVarName(name) {
  return /^[A-Z_][A-Z0-9_]{0,200}$/.test(name);
}

// Helper function to read environment variable from .env file
function readEnvVariable(varName, defaultValue = '') {
  // First check environment variable
  if (process.env[varName] !== undefined) {
    return process.env[varName];
  }

  // Then try reading from .env file
  try {
    const dotenvPath = path.join(ROOT_DIR, '.env');
    if (fs.existsSync(dotenvPath)) {
      const envContent = fs.readFileSync(dotenvPath, 'utf8');
      if (!isSafeEnvVarName(varName)) {
        console.warn(`Unsafe environment variable name: ${varName}. Using default value.`);
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
          return value;
        }
      }
    }
  } catch (error) {
    console.warn(`Error reading ${varName} from .env:`, error);
  }
  
  return defaultValue;
}

function getPM2Namespace() {
  const namespace = readEnvVariable('PM2_NAMESPACE', 'latest');
  console.log(`Using PM2_NAMESPACE: ${namespace}`);
  return namespace;
}

// Command line interface
const normalizedFilename = __filename.replace(/\\/g, '/');
const linuxMetaUrl = `file://${normalizedFilename}`

if (import.meta.url === linuxMetaUrl || import.meta.url === `file:///${normalizedFilename}` ) {
  async function runCLI() {
    try {
      const command = process.argv[2];
      const personaArg = process.argv[3];
      const persona = allowedPersonaMap[personaArg] || 'faculty';
      const safePersona = getPersonaFromKey(persona);
      const force = process.argv.includes('--force');
      
      // Update paths whenever the CLI is invoked directly
      const { root } = resolvePaths({ persona });
      
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
        case 'start':
          await startServices(safePersona);
          break;
        case 'stop':
          // Check for force flag (either as --force or -f)
          const forceStop = process.argv.includes('--force') || process.argv.includes('-f') || process.env.FORCE === 'true';
          await stopServices(forceStop);
          break;
        case 'status':
      try {
        // Check for output format options
        const jsonFormat = process.argv.includes('--json') || process.argv.includes('-j');
        const quietMode = process.argv.includes('--quiet') || process.argv.includes('-q');
        const humanReadable = process.argv.includes('--human') || process.argv.includes('-h');
        
        // In quiet mode, disable console logging temporarily
        if (quietMode) {
          // Save the original console.log and console.warn functions
          const originalConsoleLog = console.log;
          const originalConsoleWarn = console.warn;
          
          // Temporarily disable console output for getting service status
          console.log = () => {};
          console.warn = () => {};
          
          // Get service status silently
          const status = checkServicesStatus();
          
          // Restore console functions
          console.log = originalConsoleLog;
          console.warn = originalConsoleWarn;
          
          // Output based on format requested
          if (humanReadable) {
            // Output human-readable format for service details
            if (status.success && status.running) {
              console.log(`Status: ${status.servicesCount} services running with namespace '${status.namespace}'`);
              console.log(`Services: ${status.servicesNames}`);
              console.log(`Online: ${status.onlineCount}, Error: ${status.errorCount}`);
              
              if (status.services && status.services.length > 0) {
                console.log("\nService details:");
                console.log("---------------------------------------------");
                
                status.services.forEach(service => {
                  // Calculate uptime more reliably
                  let uptimeStr = 'Unknown';
                  const now = Date.now();
                  
                  if (service.uptime && typeof service.uptime === 'number') {
                    // PM2 uptime is typically the timestamp when the process was started
                    const uptimeSeconds = Math.max(0, (now - service.uptime) / 1000);
                    
                    // Format the uptime in a human-readable way
                    if (uptimeSeconds < 60) {
                      uptimeStr = `${Math.floor(uptimeSeconds)} seconds`;
                    } else if (uptimeSeconds < 3600) {
                      const minutes = Math.floor(uptimeSeconds / 60);
                      const seconds = Math.floor(uptimeSeconds % 60);
                      uptimeStr = `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
                    } else if (uptimeSeconds < 86400) {
                      const hours = Math.floor(uptimeSeconds / 3600);
                      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                      uptimeStr = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
                    } else {
                      const days = Math.floor(uptimeSeconds / 86400);
                      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                      uptimeStr = `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
                    }
                  }
                  
                  // Convert memory to MB
                  const memoryMB = Math.floor((service.memory || 0) / 1024 / 1024);
                  
                  console.log(`Name: ${service.name}`);
                  console.log(`Status: ${service.status}`);
                  console.log(`Uptime: ${uptimeStr}`);
                  console.log(`Memory: ${memoryMB} MB`);
                  console.log(`CPU: ${service.cpu || 0}%`);
                  console.log("---------------------------------------------");
                });
                
                if (status.errorCount > 0) {
                  console.log(`Services in error state: ${status.errorNames}`);
                }
              }
            } else if (status.success) {
              console.log(`No services found running with namespace '${status.namespace}' or matching known service names`);
            } else {
              console.log(`Failed to check service status: ${status.error}`);
            }
          } else {
            // Output only the JSON with no other logging
            console.log(JSON.stringify(status, null, 2));
          }
        } else {
          // Normal mode with logging
          const status = checkServicesStatus();
          
          if (jsonFormat) {
            // Only print JSON output for programmatic consumption (tests, etc.)
            console.log(JSON.stringify(status, null, 2));
          } else {
            // Human-readable output
            if (status.success) {
              if (status.running) {
                console.log(`Status: ${status.servicesCount} services running with namespace '${status.namespace}'`);
                console.log(`Services: ${status.servicesNames}`);
                console.log(`Online: ${status.onlineCount}, Error: ${status.errorCount}`);
                
                // Display detailed service information
                console.log("\nDetailed service information:");
                console.log("---------------------------------------------");
                
                status.services.forEach(service => {
                  // Calculate uptime more reliably
                  let uptimeStr = 'Unknown';
                  const now = Date.now();
                  
                  if (service.uptime && typeof service.uptime === 'number') {
                    // PM2 uptime is typically the timestamp when the process was started
                    const uptimeSeconds = Math.max(0, (now - service.uptime) / 1000);
                    
                    // Format the uptime in a human-readable way
                    if (uptimeSeconds < 60) {
                      uptimeStr = `${Math.floor(uptimeSeconds)} seconds`;
                    } else if (uptimeSeconds < 3600) {
                      const minutes = Math.floor(uptimeSeconds / 60);
                      const seconds = Math.floor(uptimeSeconds % 60);
                      uptimeStr = `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
                    } else if (uptimeSeconds < 86400) {
                      const hours = Math.floor(uptimeSeconds / 3600);
                      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                      uptimeStr = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
                    } else {
                      const days = Math.floor(uptimeSeconds / 86400);
                      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                      uptimeStr = `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
                    }
                  }
                  
                  // Convert memory to MB
                  const memoryMB = Math.floor((service.memory || 0) / 1024 / 1024);
                  
                  console.log(`Name: ${service.name}`);
                  console.log(`Status: ${service.status}`);
                  console.log(`Uptime: ${uptimeStr}`);
                  console.log(`Memory: ${memoryMB} MB`);
                  console.log(`CPU: ${service.cpu || 0}%`);
                  console.log("---------------------------------------------");
                });
                
                if (status.errorCount > 0) {
                  console.log(`Services in error state: ${status.errorNames}`);
                }
              } else {
                console.log(`No services found running with namespace '${status.namespace}' or matching known service names`);
              }
            } else {
              console.log(`Failed to check service status: ${status.error}`);
            }
          }
        }
      } catch (error) {
        // Check if we're in quiet mode
        const quietMode = process.argv.includes('--quiet') || process.argv.includes('-q');
        
        // Ensure we always output valid JSON in case of unexpected errors
        const errorOutput = {
          success: false,
          error: error.message,
          running: false,
          timestamp: new Date().toISOString()
        };
        
        // Output the JSON error
        console.log(JSON.stringify(errorOutput, null, 2));
        
        // Only show error message if not in quiet mode
        if (!quietMode) {
          console.error(`Error during status check: ${error.message}`);
        }
      }
      break;
        case 'test':
          console.log('Test command working');
          break;
        case 'uninstall':
          // uninstallServices() - this function doesn't exist, so just log for now
          console.log('Uninstall functionality not yet implemented');
          break;
        default:
          console.log(`
Usage: node utils.mjs <command> [persona] [--force] [options]

Commands:
  build <persona>          Build a specific persona (faculty, lecturer, student)
  create-package <persona> Create a distribution package for a specific persona
  setup-backend            Setup backend environment
  start-backend             Start backend server
  setup-ollama             Setup Ollama 
  start-ollama             Start Ollama 
  start <persona>          Start all services for a specific persona
  stop                     Stop all services
  status                   Check status of all services with configured namespace
  uninstall                Uninstall all services

Options:
  --force                  Force rebuild/recreate even if already exists
                           For 'stop' command: remove services instead of just stopping them
  --json, -j               For 'status' command: Output in JSON format (useful for scripts)
  --quiet, -q              For 'status' command: Suppress all logging, output only JSON
                           (ideal for automated testing and CI/CD pipelines)
  --human, -h              For 'status' command: Display human-readable output
                           Can be combined with --quiet to get clean human-readable output
`);
      }
    } catch (error) {
      console.error(`Error executing command: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      process.exit(1);
    }
  }
  
  // Run the CLI
  runCLI().catch((error) => {
    console.error('Unhandled error in CLI:', error);
    process.exit(1);
  });
}