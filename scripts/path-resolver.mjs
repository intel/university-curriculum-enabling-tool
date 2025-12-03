// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Determines whether we're running in a distribution package or repository
 * and returns the appropriate paths for components
 */
export function resolvePaths(args = {}) {
  // Extract persona from args or default to faculty
  const persona = args.persona || 'faculty';
  
  // Check if we're in development mode
  const isDevelopmentMode = process.env.DEV_MODE === 'true';

  // Check if ollama or OpenVINO Model Server (OVMS) is selected
  const isOllamaOrOvms = process.env.PROVIDER;
  
  // Detect if we're already in a distribution package by checking for .version file
  const versionFileExists = fs.existsSync(path.join(ROOT_DIR, '.version'));
  const isDistPackage = process.env.IS_DIST_PACKAGE === 'true' || versionFileExists;
    
  // Default to using current directory
  let workingDir = ROOT_DIR;
  
  // Check if we're in the root repository by checking for specific directories
  // that would only exist in the root repository
  const isRootRepo = fs.existsSync(path.join(ROOT_DIR, 'frontend', 'src'));
  
  // If we're in repository mode and NOT in development mode, check if a dist package exists
  // but only if we're not explicitly in the root repository or in a distribution package
  if (!isDistPackage && !isDevelopmentMode && !isRootRepo) {
    const distDir = path.join(ROOT_DIR, 'dist');
    
    // Get the name and version from frontend package.json
    const packageJsonPath = path.join(ROOT_DIR, 'frontend', 'package.json');
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
    const distPackageName = persona.toLowerCase() === 'faculty' 
      ? `${packageName}${versionString}` 
      : `${packageName}${versionString}-${persona}`;
    const distPackage = path.join(distDir, distPackageName);
    
    // If a valid dist package exists (with .version file), use it - but only if not in development mode
    if (!isDevelopmentMode && fs.existsSync(distPackage) && fs.existsSync(path.join(distPackage, '.version'))) {
      console.log(`Using distribution package at: ${distPackage}`);
      workingDir = distPackage;
    } else if (isDevelopmentMode) {
      // In development mode, always use repository root
      console.log('Development mode: Using repository root directory');
    } else if (isRootRepo) {
      // We're in the root repository but we're not using a distribution package
      // This is typically when we're running a build or creating a new distribution
      console.log('Running from root repository. Using repository paths for build.');
    } else {
      // Not in a repository and no distribution package - just log a warning
      console.warn('WARNING: Not in a distribution package or repository. Paths may not be correct.');
    }
  }
  
  // Create paths relative to the working directory
  return {
    root: workingDir,
    frontend: path.join(workingDir, 'frontend'),
    backend: path.join(workingDir, 'backend'),
    thirdparty: path.join(workingDir, 'thirdparty'),
    node: path.join(workingDir, 'thirdparty', 'node'),
    ollama: path.join(workingDir, 'thirdparty', 'ollama'),
    ovms: path.join(workingDir, 'thirdparty', 'ovms'),
    data: path.join(workingDir, 'data'),
    venv: path.join(workingDir, 'backend', 'venv'),
    ovmsBackend: path.join(workingDir, 'backend', 'ovms_service'),
    ovmsVenv: path.join(workingDir, 'backend', 'ovms_service', 'venv'),
    ecosystem: path.join(workingDir, 'ecosystem.config.cjs'),
    dist: path.join(ROOT_DIR, 'dist'),
    isDistPackage: isDistPackage,
    isDevelopmentMode: isDevelopmentMode,
    isOllamaOrOvms: isOllamaOrOvms,
    isRootRepo: isRootRepo
  };
}
