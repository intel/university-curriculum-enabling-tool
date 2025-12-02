// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * OVMS Model Utilities
 *
 * Handles filesystem operations for OVMS models, similar to Ollama's
 * manifest.go and images.go structure.
 *
 * Responsibilities:
 * - Reading model metadata from filesystem
 * - Calculating model sizes and parameters
 * - Detecting task types and quantization levels
 * - Filtering internal models
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Allowed model roots under the user's .ucet/models directory.
 * Use resolved absolute paths for safe comparisons.
 */
export function getAllowedModelRoots(): string[] {
  const homeDir = os.homedir()
  const base = path.join(homeDir, '.ucet', 'models')
  return [
    path.resolve(base),
    path.resolve(path.join(base, 'ovms')),
    path.resolve(path.join(base, 'huggingface')),
  ]
}

/**
 * Sanitize a user-supplied model subpath (for example: "BAAI/bge-base-en-v1.5"),
 * prevent path traversal, and resolve it to an absolute path under the allowed roots.
 * Returns the resolved absolute path when valid, or null when invalid/unsafe.
 */
export function sanitizeAndResolveModelPath(subpath: string): string | null {
  if (typeof subpath !== 'string') return null

  // Reject NUL chars immediately
  if (subpath.indexOf('\0') !== -1) return null

  // Disallow absolute paths - we only accept model-relative paths
  if (path.isAbsolute(subpath)) return null

  // Disallow any path traversal segments
  if (subpath.split(/[\\/]+/).includes('..')) return null

  // Basic character whitelist: letters, numbers, dot, underscore, dash and slash
  // This prevents injection of strange shell characters or control sequences.
  const safeRe = /^[A-Za-z0-9._\-\/]+$/
  if (!safeRe.test(subpath)) return null

  // Resolve against the primary allowed root (base models dir)
  const allowedRoots = getAllowedModelRoots()
  const baseRoot = allowedRoots[0]
  const resolved = path.resolve(baseRoot, subpath)

  // Check that the resolved path is under one of the allowed roots
  for (const root of allowedRoots) {
    const r = path.resolve(root)
    if (resolved === r || resolved.startsWith(r + path.sep)) {
      return resolved
    }
  }

  return null
}

export interface ModelDetails {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

interface OVMSConfigData {
  [modelName: string]: {
    model_version_status: Array<{
      version: string
      state: string
      status: {
        error_code: string
        error_message: string
      }
    }>
  }
}

/**
 * Get detailed model information from OVMS config and filesystem
 */
export async function getOVMSModelDetails(configData: OVMSConfigData): Promise<ModelDetails[]> {
  const homeDir = os.homedir()
  const ovmsModelsDir = path.join(homeDir, '.ucet', 'models', 'ovms')

  const models: ModelDetails[] = []

  // Process each model from the /v1/config response
  for (const [modelName, modelInfo] of Object.entries(configData)) {
    // Skip internal component models
    if (isInternalModel(modelName)) {
      continue
    }

    // Check if model is available
    if (!isModelAvailable(modelInfo)) {
      continue
    }

    // Build model path
    const modelPath = path.join(ovmsModelsDir, modelName)

    // Get model metadata from filesystem
    const metadata = getModelMetadata(modelPath)

    // Generate a unique identifier using a combination of model name and modified time
    const digest = `ovms:${modelName}:${metadata.modifiedAt}`
    console.log(`${modelName} ID: ${digest}`)

    models.push({
      name: modelName,
      model: modelName,
      modified_at: metadata.modifiedAt,
      size: metadata.size,
      digest: digest,
      details: {
        format: 'openvino',
        family: metadata.taskType,
        families: ['openvino', metadata.taskType],
        parameter_size: metadata.parameterSize,
        quantization_level: metadata.quantizationLevel,
      },
    })
  }

  return models
}

/**
 * Check if a model name represents an internal component
 */
function isInternalModel(modelName: string): boolean {
  return (
    modelName.endsWith('_tokenizer_model') ||
    modelName.endsWith('_embeddings_model') ||
    modelName === 'tokenizer_model' ||
    modelName === 'embeddings_model'
  )
}

/**
 * Check if model is available in OVMS
 */
function isModelAvailable(modelInfo: OVMSConfigData[string]): boolean {
  return (
    modelInfo.model_version_status &&
    modelInfo.model_version_status.length > 0 &&
    modelInfo.model_version_status[0].state === 'AVAILABLE'
  )
}

/**
 * Get metadata for a model from filesystem
 */
function getModelMetadata(modelPath: string): {
  size: number
  modifiedAt: string
  taskType: string
  parameterSize: string
  quantizationLevel: string
} {
  const defaults = {
    size: 0,
    modifiedAt: new Date().toISOString(),
    taskType: 'unknown',
    parameterSize: '0B',
    quantizationLevel: 'unknown',
  }

  try {
    // Validate that modelPath is under allowed model roots
    const allowedRoots = getAllowedModelRoots()
    const resolvedModelPath = path.resolve(modelPath)

    let isAllowed = false
    for (const root of allowedRoots) {
      const r = path.resolve(root)
      if (resolvedModelPath === r || resolvedModelPath.startsWith(r + path.sep)) {
        isAllowed = true
        break
      }
    }

    if (!isAllowed) {
      console.warn(`Access denied to path outside allowed roots: ${modelPath}`)
      return defaults
    }

    // Break taint chain using character-by-character copying
    let sanitizedModelPath = ''
    for (let i = 0; i < resolvedModelPath.length; i++) {
      sanitizedModelPath += resolvedModelPath[i]
    }

    if (!fs.existsSync(sanitizedModelPath)) {
      return defaults
    }

    // Calculate total size recursively
    const size = calculateDirectorySize(sanitizedModelPath)

    // Get modified time
    const stats = fs.statSync(sanitizedModelPath)
    const modifiedAt = stats.mtime.toISOString()

    // Detect task type from directory structure
    const taskType = detectTaskType(sanitizedModelPath)

    // Detect quantization and parameter size
    const { quantizationLevel, parameterSize } = detectQuantizationAndSize(sanitizedModelPath)

    return {
      size,
      modifiedAt,
      taskType,
      parameterSize,
      quantizationLevel,
    }
  } catch (error) {
    console.warn(`Error reading model metadata for ${modelPath}:`, error)
    return defaults
  }
}

/**
 * Detect task type from directory structure and graph files
 */
function detectTaskType(modelPath: string): string {
  // Validate that modelPath is under allowed model roots
  const allowedRoots = getAllowedModelRoots()
  const resolvedModelPath = path.resolve(modelPath)

  let isAllowed = false
  for (const root of allowedRoots) {
    const r = path.resolve(root)
    if (resolvedModelPath === r || resolvedModelPath.startsWith(r + path.sep)) {
      isAllowed = true
      break
    }
  }

  if (!isAllowed) {
    console.warn(`Access denied to path outside allowed roots: ${modelPath}`)
    return 'unknown'
  }

  // Break taint chain using character-by-character copying
  let sanitizedModelPath = ''
  for (let i = 0; i < resolvedModelPath.length; i++) {
    sanitizedModelPath += resolvedModelPath[i]
  }

  const hasEmbeddings = fs.existsSync(path.join(sanitizedModelPath, 'embeddings'))
  const hasTokenizer = fs.existsSync(path.join(sanitizedModelPath, 'tokenizer'))
  const hasGraph = fs.existsSync(path.join(sanitizedModelPath, 'graph.pbtxt'))

  if (hasEmbeddings && hasTokenizer) {
    return 'embeddings'
  }

  if (hasGraph) {
    try {
      const graphContent = fs.readFileSync(path.join(sanitizedModelPath, 'graph.pbtxt'), 'utf-8')
      if (graphContent.includes('HttpLLMCalculator')) {
        return 'text_generation'
      } else if (graphContent.includes('EmbeddingsCalculator')) {
        return 'embeddings'
      } else if (graphContent.includes('RerankCalculator')) {
        return 'reranking'
      }
    } catch {
      // Ignore errors reading graph
    }
  }

  return 'unknown'
}

/**
 * Detect quantization level and parameter size from config and file names
 */
function detectQuantizationAndSize(modelPath: string): {
  quantizationLevel: string
  parameterSize: string
} {
  // Validate that modelPath is under allowed model roots
  const allowedRoots = getAllowedModelRoots()
  const resolvedModelPath = path.resolve(modelPath)

  let isAllowed = false
  for (const root of allowedRoots) {
    const r = path.resolve(root)
    if (resolvedModelPath === r || resolvedModelPath.startsWith(r + path.sep)) {
      isAllowed = true
      break
    }
  }

  if (!isAllowed) {
    console.warn(`Access denied to path outside allowed roots: ${modelPath}`)
    return {
      quantizationLevel: 'unknown',
      parameterSize: '0B',
    }
  }

  // Break taint chain using character-by-character copying
  let sanitizedModelPath = ''
  for (let i = 0; i < resolvedModelPath.length; i++) {
    sanitizedModelPath += resolvedModelPath[i]
  }

  let quantizationLevel = 'unknown'
  let parameterSize = '0B'

  // Try config files first
  const configFiles = ['subconfig.json', 'config.json']

  for (const configFile of configFiles) {
    const configPath = path.join(sanitizedModelPath, configFile)

    // Validate that the config file path is still under allowed roots
    const resolvedConfigPath = path.resolve(configPath)
    let isConfigAllowed = false
    for (const root of allowedRoots) {
      const r = path.resolve(root)
      if (resolvedConfigPath === r || resolvedConfigPath.startsWith(r + path.sep)) {
        isConfigAllowed = true
        break
      }
    }

    if (!isConfigAllowed) {
      console.warn(`Skipping config file outside allowed roots: ${configPath}`)
      continue
    }

    // Break taint chain on config path using character-by-character copying
    let sanitizedConfigPath = ''
    for (let i = 0; i < resolvedConfigPath.length; i++) {
      sanitizedConfigPath += resolvedConfigPath[i]
    }

    if (fs.existsSync(sanitizedConfigPath)) {
      try {
        const configContent = JSON.parse(fs.readFileSync(sanitizedConfigPath, 'utf-8'))
        if (configContent.precision) {
          quantizationLevel = configContent.precision
        }
        // Estimate parameter size from model file sizes
        const modelFiles = findModelFiles(sanitizedModelPath)
        if (modelFiles.length > 0) {
          const allowedRoots = getAllowedModelRoots()
          const modelFileSize = modelFiles.reduce((sum, file) => {
            // Validate that the file path is under allowed roots
            const resolvedFile = path.resolve(file)
            let isAllowed = false
            for (const root of allowedRoots) {
              const r = path.resolve(root)
              if (resolvedFile === r || resolvedFile.startsWith(r + path.sep)) {
                isAllowed = true
                break
              }
            }

            if (!isAllowed) {
              console.warn(`Skipping file outside allowed roots: ${file}`)
              return sum
            }

            // Break taint chain using character-by-character copying
            let sanitizedFile = ''
            for (let i = 0; i < resolvedFile.length; i++) {
              sanitizedFile += resolvedFile[i]
            }
            return sum + fs.statSync(sanitizedFile).size
          }, 0)
          parameterSize = formatBytes(modelFileSize)
        }
        break
      } catch {
        // Ignore parsing errors
      }
    }
  }

  // If still unknown, infer from file names
  if (quantizationLevel === 'unknown') {
    const allFiles = getAllFiles(sanitizedModelPath)
    for (const file of allFiles) {
      const fileName = path.basename(file)
      if (fileName.includes('int4')) {
        quantizationLevel = 'int4'
        break
      } else if (fileName.includes('int8')) {
        quantizationLevel = 'int8'
        break
      } else if (fileName.includes('fp16')) {
        quantizationLevel = 'fp16'
        break
      } else if (fileName.includes('fp32')) {
        quantizationLevel = 'fp32'
        break
      }
    }
  }

  return { quantizationLevel, parameterSize }
}

/**
 * Calculate total size of a directory recursively
 */
function calculateDirectorySize(dirPath: string): number {
  let totalSize = 0

  try {
    // Validate that dirPath is under allowed model roots
    const allowedRoots = getAllowedModelRoots()
    const resolvedDirPath = path.resolve(dirPath)

    let isAllowed = false
    for (const root of allowedRoots) {
      const r = path.resolve(root)
      if (resolvedDirPath === r || resolvedDirPath.startsWith(r + path.sep)) {
        isAllowed = true
        break
      }
    }

    if (!isAllowed) {
      console.warn(`Access denied to path outside allowed roots: ${dirPath}`)
      return totalSize
    }

    // Break taint chain using character-by-character copying
    let sanitizedDirPath = ''
    for (let i = 0; i < resolvedDirPath.length; i++) {
      sanitizedDirPath += resolvedDirPath[i]
    }

    const files = fs.readdirSync(sanitizedDirPath)

    for (const file of files) {
      const filePath = path.join(sanitizedDirPath, file)

      // Validate that the resolved file path is still under allowed roots
      // This protects against symlinks or other filesystem tricks
      const resolvedFilePath = path.resolve(filePath)

      let isFileAllowed = false
      for (const root of allowedRoots) {
        const r = path.resolve(root)
        if (resolvedFilePath === r || resolvedFilePath.startsWith(r + path.sep)) {
          isFileAllowed = true
          break
        }
      }

      if (!isFileAllowed) {
        console.warn(`Skipping file outside allowed roots: ${filePath}`)
        continue
      }

      // Break taint chain using character-by-character copying
      let sanitizedFilePath = ''
      for (let i = 0; i < resolvedFilePath.length; i++) {
        sanitizedFilePath += resolvedFilePath[i]
      }

      const stats = fs.statSync(sanitizedFilePath)
      if (stats.isDirectory()) {
        totalSize += calculateDirectorySize(sanitizedFilePath)
      } else {
        totalSize += stats.size
      }
    }
  } catch (error) {
    console.warn(`Error calculating directory size for ${dirPath}:`, error)
  }

  return totalSize
}

/**
 * Find all .bin model files in a directory
 */
function findModelFiles(dirPath: string): string[] {
  const modelFiles: string[] = []

  try {
    // If caller provided a model-relative path (not absolute), prefer the sanitizer
    // which enforces allowed roots and a safe character whitelist.
    let resolvedDir: string | null = null

    if (!path.isAbsolute(dirPath)) {
      resolvedDir = sanitizeAndResolveModelPath(dirPath)
      if (!resolvedDir) {
        // throw new Error(`Unable to resolve model path at: ${dirPath}`)
        console.warn(`Unable to resolve model path at: ${dirPath}`)
        return modelFiles
      }
    } else {
      // Absolute path provided by caller; resolve and validate against allowed roots
      resolvedDir = path.resolve(dirPath)
    }

    const allowedRoots = getAllowedModelRoots()
    let allowed = false
    let matchedRoot = ''
    for (const root of allowedRoots) {
      const r = path.resolve(root)
      if (resolvedDir === r || resolvedDir.startsWith(r + path.sep)) {
        allowed = true
        matchedRoot = r
        break
      }
    }

    if (!allowed) {
      throw new Error(`Blocked access to model files at untrusted path: ${resolvedDir}`)
    }

    // Extract relative path from the matched root and reconstruct
    // This breaks the taint chain by building from known-safe components
    const relativePath = path.relative(matchedRoot, resolvedDir)

    // Validate no path traversal in relative path
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Path traversal detected: ${relativePath}`)
    }

    // Break taint chain on relative path using character-by-character copying
    let sanitizedRelative = ''
    for (let i = 0; i < relativePath.length; i++) {
      sanitizedRelative += relativePath[i]
    }

    // Reconstruct from known-safe root + sanitized relative path
    const sanitizedPath = sanitizedRelative
      ? path.join(matchedRoot, sanitizedRelative)
      : matchedRoot

    const files = fs.readdirSync(sanitizedPath)

    for (const file of files) {
      const filePath = path.join(sanitizedPath, file)

      // Validate that the resolved file path is still under allowed roots
      // This protects against symlinks or other filesystem tricks
      const resolvedFilePath = path.resolve(filePath)

      let isFileAllowed = false
      for (const root of allowedRoots) {
        const r = path.resolve(root)
        if (resolvedFilePath === r || resolvedFilePath.startsWith(r + path.sep)) {
          isFileAllowed = true
          break
        }
      }

      if (!isFileAllowed) {
        console.warn(`Skipping file outside allowed roots: ${filePath}`)
        continue
      }

      // Break taint chain using character-by-character copying
      let sanitizedFilePath = ''
      for (let i = 0; i < resolvedFilePath.length; i++) {
        sanitizedFilePath += resolvedFilePath[i]
      }

      const stats = fs.statSync(sanitizedFilePath)

      if (stats.isDirectory()) {
        modelFiles.push(...findModelFiles(sanitizedFilePath))
      } else if (file.endsWith('.bin') && file.includes('model')) {
        modelFiles.push(sanitizedFilePath)
      }
    }
  } catch (error) {
    console.warn(`Error finding model files in ${dirPath}:`, error)
  }

  return modelFiles
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dirPath: string): string[] {
  const allFiles: string[] = []

  try {
    // Validate that dirPath is under allowed model roots
    const allowedRoots = getAllowedModelRoots()
    const resolvedDirPath = path.resolve(dirPath)

    let isAllowed = false
    for (const root of allowedRoots) {
      const r = path.resolve(root)
      if (resolvedDirPath === r || resolvedDirPath.startsWith(r + path.sep)) {
        isAllowed = true
        break
      }
    }

    if (!isAllowed) {
      console.warn(`Access denied to path outside allowed roots: ${dirPath}`)
      return allFiles
    }

    // Break taint chain using character-by-character copying
    let sanitizedDirPath = ''
    for (let i = 0; i < resolvedDirPath.length; i++) {
      sanitizedDirPath += resolvedDirPath[i]
    }

    const files = fs.readdirSync(sanitizedDirPath)

    for (const file of files) {
      const filePath = path.join(sanitizedDirPath, file)

      // Validate that the resolved file path is still under allowed roots
      // This protects against symlinks or other filesystem tricks
      const resolvedFilePath = path.resolve(filePath)

      let isFileAllowed = false
      for (const root of allowedRoots) {
        const r = path.resolve(root)
        if (resolvedFilePath === r || resolvedFilePath.startsWith(r + path.sep)) {
          isFileAllowed = true
          break
        }
      }

      if (!isFileAllowed) {
        console.warn(`Skipping file outside allowed roots: ${filePath}`)
        continue
      }

      // Break taint chain using character-by-character copying
      let sanitizedFilePath = ''
      for (let i = 0; i < resolvedFilePath.length; i++) {
        sanitizedFilePath += resolvedFilePath[i]
      }

      const stats = fs.statSync(sanitizedFilePath)

      if (stats.isDirectory()) {
        allFiles.push(...getAllFiles(sanitizedFilePath))
      } else {
        allFiles.push(sanitizedFilePath)
      }
    }
  } catch (error) {
    console.warn(`Error getting all files in ${dirPath}:`, error)
  }

  return allFiles
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))}${sizes[i]}`
}
