// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '..');

function readEnvFromFile(envFilePath, varName, defaultValue = '') {
  if (fs.existsSync(envFilePath)) {
    try {
      const lines = fs.readFileSync(envFilePath, 'utf8').split('\n');
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
    } catch (_) {}
  }
  // fallback to process.env
  if (process.env[varName] !== undefined) return process.env[varName];
  return defaultValue;
}

export function resolvePaths(args = {}) {
  const persona         = args.persona || 'faculty';
  const isDevelopmentMode = process.env.DEV_MODE === 'true';

  // Detect dist package
  const versionFileExists = fs.existsSync(path.join(ROOT_DIR, '.version'));
  const isDistPackage     = process.env.IS_DIST_PACKAGE === 'true' || versionFileExists;
  const isRootRepo        = fs.existsSync(path.join(ROOT_DIR, 'frontend', 'src'));

  // ── Determine working directory ───────────────────────────────────────────
  let workingDir = ROOT_DIR;

  if (!isDistPackage && !isDevelopmentMode && !isRootRepo) {
    const distDir       = path.join(ROOT_DIR, 'dist');
    const packageJsonPath = path.join(ROOT_DIR, 'frontend', 'package.json');
    let packageName     = 'university-curriculum-enabling-tool';
    let packageVersion  = '';

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packageName    = packageJson.name    || packageName;
        packageVersion = packageJson.version || '';
      } catch (error) {
        console.warn(`Failed to parse package.json: ${error.message}.`);
      }
    }

    const versionString  = packageVersion ? `-${packageVersion}` : '';
    const distPackageName = persona.toLowerCase() === 'faculty'
      ? `${packageName}${versionString}`
      : `${packageName}${versionString}-${persona}`;
    const distPackage = path.join(distDir, distPackageName);

    if (
      !isDevelopmentMode &&
      fs.existsSync(distPackage) &&
      fs.existsSync(path.join(distPackage, '.version'))
    ) {
      console.log(`Using distribution package at: ${distPackage}`);
      workingDir = distPackage;
    } else if (isDevelopmentMode) {
      console.log('Development mode: Using repository root directory');
    } else if (isRootRepo) {
      console.log('Running from root repository. Using repository paths for build.');
    } else {
      console.warn('WARNING: Not in a distribution package or repository.');
    }
  }

  const envFilePath  = path.join(workingDir, '.env');
  const isOllamaOrOvms = readEnvFromFile(envFilePath, 'PROVIDER', 'ollama');

  console.log(`Using PROVIDER: ${isOllamaOrOvms} (from ${envFilePath})`);

  return {
    root:             workingDir,
    frontend:         path.join(workingDir, 'frontend'),
    backend:          path.join(workingDir, 'backend'),
    thirdparty:       path.join(workingDir, 'thirdparty'),
    node:             path.join(workingDir, 'thirdparty', 'node'),
    ollama:           path.join(workingDir, 'thirdparty', 'ollama'),
    ovms:             path.join(workingDir, 'thirdparty', 'ovms'),
    data:             path.join(workingDir, 'data'),
    venv:             path.join(workingDir, 'backend', 'venv'),
    ovmsBackend:      path.join(workingDir, 'backend', 'ovms_service'),
    ovmsVenv:         path.join(workingDir, 'backend', 'ovms_service', 'venv'),
    ecosystem:        path.join(workingDir, 'ecosystem.config.cjs'),
    dist:             path.join(ROOT_DIR, 'dist'),
    isDistPackage,
    isDevelopmentMode,
    isOllamaOrOvms,
    isRootRepo,
  };
}