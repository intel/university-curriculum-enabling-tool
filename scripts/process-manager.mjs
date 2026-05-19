// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { spawn, spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const isWindows  = process.platform === 'win32';

// ── State persistence ─────────────────────────────────────────────────────────
const STATE_DIR  = path.join(__dirname, '..', '.process-manager');
const STATE_FILE = path.join(STATE_DIR, 'processes.json');
const LOG_DIR    = path.join(STATE_DIR, 'logs');

function ensureDirectories() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR,   { recursive: true });
}

function readState() {
  ensureDirectories();
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn(`[ProcessManager] Failed to read state file: ${err.message}`);
  }
  return {};
}

function writeState(state) {
  ensureDirectories();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ── PID helpers ───────────────────────────────────────────────────────────────
function isPidRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function getLogPaths(name) {
  const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return {
    out: path.join(LOG_DIR, `${safeName}.out.log`),
    err: path.join(LOG_DIR, `${safeName}.err.log`),
  };
}

function getProcessMemory(pid) {
  if (!pid || !isPidRunning(pid)) return 0;
  if (isWindows) return 0;
  try {
    const statusPath = `/proc/${pid}/status`;
    if (fs.existsSync(statusPath)) {
      const content = fs.readFileSync(statusPath, 'utf8');
      const match   = content.match(/VmRSS:\s+(\d+)\s+kB/);
      if (match) return parseInt(match[1], 10) * 1024;
    }
  } catch (_) {}
  return 0;
}

// ── Windows kill ──────────────────────────────────────────────────────────────
function killWindowsPid(pid, name) {
  console.log(`[ProcessManager] Killing '${name}' (PID: ${pid}) via taskkill`);
  const result = spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
    stdio: 'ignore',
    shell: false,
  });
  if (result.status !== 0 && result.status !== 128) {
    console.warn(
      `[ProcessManager] taskkill returned ${result.status} for '${name}' (PID: ${pid})`
    );
  }
}

// ── Graceful kill ─────────────────────────────────────────────────────────────
function killPidGracefully(pid, name) {
  if (isWindows) {
    killWindowsPid(pid, name);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 5000;
    console.log(`[ProcessManager] Sending SIGTERM to '${name}' (PID: ${pid})`);

    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      if (err.code === 'ESRCH') return resolve();
      return reject(err);
    }

    const start = Date.now();
    const poll  = setInterval(() => {
      if (!isPidRunning(pid)) {
        clearInterval(poll);
        console.log(`[ProcessManager] '${name}' stopped gracefully`);
        return resolve();
      }
      if (Date.now() - start > TIMEOUT_MS) {
        clearInterval(poll);
        console.warn(`[ProcessManager] '${name}' did not stop in time, sending SIGKILL`);
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
        resolve();
      }
    }, 200);
  });
}

function loadEcosystemConfig(ecosystemPath) {
  const resolved = path.resolve(ecosystemPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Ecosystem config not found: ${resolved}`);
  }

  // Anchor require to the config file itself so __dirname inside
  // the config = the directory containing the config file
  const requireFromConfig = createRequire(resolved);

  // Bust require cache so changes are picked up on re-runs
  if (requireFromConfig.cache) {
    delete requireFromConfig.cache[resolved];
  }

  const mod = requireFromConfig(resolved);
  if (!mod || !Array.isArray(mod.apps)) {
    throw new Error(`Invalid ecosystem config: missing apps array in ${resolved}`);
  }
  return mod;
}

// ── startProcess ──────────────────────────────────────────────────────────────
export function startProcess(options) {
  return new Promise((resolve) => {
    const {
      name,
      script,
      interpreter,
      args      = [],
      cwd       = process.cwd(),
      env       = {},
      namespace = 'default',
    } = options;

    if (!name || !script) {
      return resolve({ success: false, error: 'name and script are required' });
    }

    const state = readState();

    // Already running - skip
    if (state[name] && isPidRunning(state[name].pid)) {
      console.log(
        `[ProcessManager] '${name}' already running (PID: ${state[name].pid})`
      );
      return resolve({ success: true, pid: state[name].pid, alreadyRunning: true });
    }

    const isJsFile = typeof script === 'string' && script.endsWith('.js');
    const defaultInterpreter = isJsFile ? process.execPath : null;
    const resolvedInterpreter = interpreter || defaultInterpreter;

    const executable = resolvedInterpreter || script;
    const spawnArgs  = resolvedInterpreter ? [script, ...args] : [...args];
    const mergedEnv  = { ...process.env, ...env };

    const { out: outLog, err: errLog } = getLogPaths(name);

    let outFd, errFd;
    try {
      outFd = fs.openSync(outLog, 'a');
      errFd = fs.openSync(errLog, 'a');
    } catch (e) {
      return resolve({ success: false, error: `Failed to open log files: ${e.message}` });
    }

    let child;
    try {
      child = spawn(executable, spawnArgs, {
        cwd,
        env:         mergedEnv,
        stdio:       ['ignore', outFd, errFd],
        detached:    true,
        shell:       false,
        windowsHide: true,
      });
    } catch (e) {
      fs.closeSync(outFd);
      fs.closeSync(errFd);
      return resolve({ success: false, error: `Failed to spawn: ${e.message}` });
    }

    child.unref();
    fs.closeSync(outFd);
    fs.closeSync(errFd);

    const pid = child.pid;
    if (!pid) {
      return resolve({ success: false, error: 'Failed to get PID after spawn' });
    }

    state[name] = {
      name,
      pid,
      script,
      interpreter: interpreter || null,
      args,
      cwd,
      namespace,
      status:     'online',
      pm_uptime:  Date.now(),
      created_at: Date.now(),
      outLog,
      errLog,
    };
    writeState(state);

    console.log(`[ProcessManager] Started '${name}' (PID: ${pid})`);
    resolve({ success: true, pid });
  });
}

// ── stopProcess ───────────────────────────────────────────────────────────────
export async function stopProcess(name, options = {}) {
  const { namespace } = options;
  const state = readState();

  let namesToStop = [];
  if (name === 'all') {
    namesToStop = Object.keys(state).filter(
      (n) => !namespace || state[n].namespace === namespace
    );
  } else {
    if (!state[name]) {
      console.warn(`[ProcessManager] '${name}' not found in state`);
      return { success: true };
    }
    namesToStop = [name];
  }

  if (namesToStop.length === 0) {
    console.log('[ProcessManager] No processes to stop');
    return { success: true };
  }

  const errors = [];

  for (const n of namesToStop) {
    const info = state[n];
    if (!info) continue;

    if (info.pid && isPidRunning(info.pid)) {
      try {
        await killPidGracefully(info.pid, n);
      } catch (err) {
        errors.push(`Failed to stop '${n}': ${err.message}`);
      }
    } else {
      console.log(`[ProcessManager] '${n}' is not running`);
    }

    state[n] = { ...info, status: 'stopped', pid: null };
  }

  writeState(state);
  return errors.length > 0
    ? { success: false, error: errors.join('; ') }
    : { success: true };
}

// ── deleteProcess ─────────────────────────────────────────────────────────────
export async function deleteProcess(name, options = {}) {
  await stopProcess(name, options);

  const state = readState();
  const { namespace } = options;

  if (name === 'all') {
    for (const n of Object.keys(state)) {
      if (!namespace || state[n].namespace === namespace) {
        delete state[n];
      }
    }
  } else {
    delete state[name];
  }

  writeState(state);
  console.log(`[ProcessManager] Deleted '${name}'`);
  return { success: true };
}

// ── killDaemon ────────────────────────────────────────────────────────────────
export async function killDaemon() {
  console.log('[ProcessManager] Killing all managed processes...');

  const state = readState();
  if (Object.keys(state).length === 0) {
    console.log('[ProcessManager] No processes to stop');
    console.log('[ProcessManager] All processes stopped and state cleared.');
    return { success: true };
  }

  await stopProcess('all');
  writeState({});

  console.log('[ProcessManager] All processes stopped and state cleared.');
  return { success: true };
}

// ── listProcesses ─────────────────────────────────────────────────────────────
export function listProcesses(options = {}) {
  const { namespace } = options;
  const state = readState();

  const entries = Object.values(state).filter(
    (info) => !namespace || info.namespace === namespace
  );

  // Reconcile status with actual running PIDs
  let stateChanged = false;
  for (const info of entries) {
    const alive = info.pid ? isPidRunning(info.pid) : false;
    if (info.status === 'online' && !alive) {
      state[info.name].status = 'stopped';
      info.status = 'stopped';
      stateChanged = true;
    }
  }
  if (stateChanged) writeState(state);

  // Return PM2-compatible shape so utils.mjs needs no changes
  return entries.map((info) => ({
    name:    info.name,
    pm_id:   info.pid || 0,
    pid:     info.pid || 0,
    pm2_env: {
      status:          info.status,
      namespace:       info.namespace || 'default',
      pm_uptime:       info.pm_uptime  || 0,
      created_at:      info.created_at || 0,
      pm_out_log_path: info.outLog || '',
      pm_err_log_path: info.errLog || '',
    },
    monit: {
      memory: getProcessMemory(info.pid),
      cpu:    0,
    },
  }));
}

// ── startEcosystem ────────────────────────────────────────────────────────────
export async function startEcosystem(ecosystemPath, options = {}) {
  const { only, namespace: nsOverride } = options;

  let config;
  try {
    config = loadEcosystemConfig(ecosystemPath);
  } catch (err) {
    throw new Error(`Failed to load ecosystem config: ${err.message}`);
  }

  const apps = config.apps || [];
  if (apps.length === 0) {
    throw new Error('No apps defined in ecosystem config');
  }

  const errors = [];

  for (const app of apps) {
    if (only && app.name !== only) continue;

    const namespace  = app.namespace || nsOverride || 'default';
    const cwd        = app.cwd || path.dirname(ecosystemPath);
    const interpreter = app.interpreter || null;
    const script     = app.script;

    const env = {
      ...(app.env || {}),
      NODE_ENV: app.env?.NODE_ENV || 'production',
    };

    const args = app.args
      ? Array.isArray(app.args)
        ? app.args
        : String(app.args).split(' ')
      : [];

    console.log(`[ProcessManager] Starting '${app.name}' from ecosystem config`);

    const result = await startProcess({
      name: app.name,
      script,
      interpreter,
      args,
      cwd,
      env,
      namespace,
    });

    if (!result.success && !result.alreadyRunning) {
      errors.push(`Failed to start '${app.name}': ${result.error}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return { success: true };
}