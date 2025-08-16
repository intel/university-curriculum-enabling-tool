// filepath: /home/user/workspaces/ai/rag/academic/dev/dev-linux-script/ecosystem.config.cjs

const path = require('path');
const fs = require('fs');
const { hostname } = require("os");

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
        PORT: readEnvVariable('FRONTEND_PORT', 8080)
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
    {
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
        OLLAMA_HOST: readEnvVariable('OLLAMA_HOST', '127.0.0.1:11434'),
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
    }
  ]
};
