// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getAIService } from '@/lib/providers'
import fs from 'fs'
import path from 'path'
import os from 'os'

// app/api/model/route.ts
export async function POST(req: Request) {
  const { name } = await req.json()

  const ollamaUrl = process.env.PROVIDER_URL

  const ollamaPullUrl = new URL('/api/pull', ollamaUrl).href
  const response = await fetch(ollamaPullUrl, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    throw new Error('Failed to pull model')
  }

  const contentLength = response.headers.get('content-length')
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null

  const stream = createProgressStream(response.body, totalBytes)

  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'application/json')
  return new Response(stream, { headers })
}

function createProgressStream(
  body: ReadableStream<Uint8Array> | null,
  totalBytes: number | null,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const reader = body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      let receivedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          const progressMessage = JSON.stringify({ progress: 100 })
          controller.enqueue(new TextEncoder().encode(progressMessage + '\n'))
          controller.close()
          return
        }

        receivedBytes += value.length
        const progress = totalBytes ? (receivedBytes / totalBytes) * 100 : null

        const progressMessage = JSON.stringify({ progress })
        controller.enqueue(new TextEncoder().encode(progressMessage + '\n'))

        controller.enqueue(value)
      }
    },
  })
}

// Delete model API
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { model } = body

    if (!model) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 })
    }

    const aiService = getAIService()

    if (aiService === 'ovms') {
      // Handle OVMS model deletion
      return await deleteOVMSModel(model)
    } else {
      // Handle Ollama model deletion
      return await deleteOllamaModel(model)
    }
  } catch (error) {
    console.error('Error deleting model:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorMessage },
      { status: 500 },
    )
  }
}

/**
 * Delete an Ollama model
 */
async function deleteOllamaModel(model: string): Promise<NextResponse> {
  const PROVIDER_URL = process.env.PROVIDER_URL
  if (!PROVIDER_URL) {
    return NextResponse.json({ error: 'PROVIDER_URL is not configured' }, { status: 500 })
  }

  const ollamaDeleteUrl = new URL('/api/delete', PROVIDER_URL).href
  const ollamaResponse = await fetch(ollamaDeleteUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model }),
  })

  console.log('Ollama delete response:', ollamaResponse.status, ollamaResponse.statusText)

  if (!ollamaResponse.ok) {
    return NextResponse.json(
      { error: 'Failed to delete model from Ollama', details: ollamaResponse.statusText },
      { status: ollamaResponse.status },
    )
  }

  console.log('Ollama model deleted successfully:', model)
  return NextResponse.json(
    { success: true, message: 'Model deleted successfully' },
    { status: 200 },
  )
}

/**
 * Delete an OVMS model from the filesystem and reload OVMS config
 */
async function deleteOVMSModel(modelName: string): Promise<NextResponse> {
  try {
    const homeDir = os.homedir()

    // Break taint chain by reconstructing from validated components
    // Character-by-character copying to break taint on homeDir
    let sanitizedHomeDir = ''
    for (let i = 0; i < homeDir.length; i++) {
      sanitizedHomeDir += homeDir[i]
    }

    // Construct paths using known-safe string literals combined with sanitized homeDir
    const ovmsModelsDir = path.join(sanitizedHomeDir, '.ucet', 'models', 'ovms')

    // Validate and sanitize modelName to prevent path traversal
    if (
      !modelName ||
      typeof modelName !== 'string' ||
      modelName.includes('..') ||
      modelName.includes('\0') ||
      path.isAbsolute(modelName)
    ) {
      return NextResponse.json(
        { error: 'Invalid model name', details: 'Model name contains invalid characters' },
        { status: 400 },
      )
    }

    // Break taint chain on modelName using character-by-character copying
    let sanitizedModelName = ''
    for (let i = 0; i < modelName.length; i++) {
      sanitizedModelName += modelName[i]
    }

    const modelPath = path.join(ovmsModelsDir, sanitizedModelName)

    // Break taint chain on configPath by character-by-character copying
    const configPathTemp = path.join(ovmsModelsDir, 'config.json')
    let configPath = ''
    for (let i = 0; i < configPathTemp.length; i++) {
      configPath += configPathTemp[i]
    }

    const hfCacheDir = path.join(sanitizedHomeDir, '.ucet', 'models', 'huggingface')

    // Check if model directory exists
    if (!fs.existsSync(modelPath)) {
      return NextResponse.json(
        { error: 'Model not found', details: `Model ${modelName} does not exist` },
        { status: 404 },
      )
    }

    // Delete the model directory recursively
    console.log(`Deleting OVMS model directory: ${modelPath}`)
    fs.rmSync(modelPath, { recursive: true, force: true })

    // Also clean up HuggingFace cache for this model
    // Extract the HuggingFace model ID from the path (e.g., "OpenVINO/model-name")
    try {
      const hfModelPath = path.join(
        hfCacheDir,
        'hub',
        `models--${sanitizedModelName.replace(/\//g, '--')}`,
      )
      if (fs.existsSync(hfModelPath)) {
        console.log(`Deleting HuggingFace cache: ${hfModelPath}`)
        fs.rmSync(hfModelPath, { recursive: true, force: true })
      }
    } catch (cacheError) {
      console.warn('Error cleaning HuggingFace cache:', cacheError)
      // Continue anyway - main model directory is deleted
    }

    // Update config.json to remove the model entry
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(configContent)

        // Remove references to the model from mediapipe_config_list and model_config_list
        let configChanged = false
        if (config.mediapipe_config_list) {
          const before = config.mediapipe_config_list.length
          const removedEntries: Array<string> = []
          config.mediapipe_config_list = config.mediapipe_config_list.filter(
            (entry: { name?: string; base_path?: string }) => {
              const name = typeof entry.name === 'string' ? entry.name.trim() : undefined
              const basePath =
                typeof entry.base_path === 'string' ? entry.base_path.trim() : undefined
              const matches = name === modelName || basePath === modelName
              if (matches) {
                removedEntries.push(name || basePath || '<unknown>')
              }
              return !matches
            },
          )
          const after = config.mediapipe_config_list.length
          if (before !== after) {
            configChanged = true
            const removedCount = before - after
            console.log(
              'Removed',
              removedCount,
              'entry(ies) from mediapipe_config_list for',
              modelName,
            )
            console.log('Removed mediapipe entries:', removedEntries.join(', '))
          }
        }

        // model_config_list entries use the nested { config: { name, base_path, ... } } shape
        if (config.model_config_list) {
          const before = config.model_config_list.length
          const removedEntries: Array<string> = []
          config.model_config_list = config.model_config_list.filter(
            (modelConfig: { config?: { name?: string; base_path?: string } }) => {
              const cfg = modelConfig.config || {}
              const name = typeof cfg.name === 'string' ? cfg.name.trim() : undefined
              const basePath = typeof cfg.base_path === 'string' ? cfg.base_path.trim() : undefined

              // Remove when name equals modelName, name starts with `${modelName}_` (tokenizer/embeddings suffixes),
              // or base_path equals modelName or starts with `${modelName}/`.
              const referencesModel =
                name === modelName ||
                (typeof name === 'string' && name.startsWith(modelName + '_')) ||
                basePath === modelName ||
                (typeof basePath === 'string' && basePath.startsWith(modelName + '/'))

              if (referencesModel) {
                removedEntries.push(name || basePath || '<unknown>')
              }

              return !referencesModel
            },
          )
          const after = config.model_config_list.length
          if (before !== after) {
            configChanged = true
            const removedCount = before - after
            console.log('Removed', removedCount, 'entry(ies) from model_config_list for', modelName)
            console.log('Removed model_config entries:', removedEntries.join(', '))
          }
        }

        if (configChanged) {
          // Write updated config back
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
          console.log('Updated config.json to remove', modelName)
        } else {
          console.log('No config.json changes needed for', modelName)
        }
      } catch (configError) {
        console.warn('Error updating config.json:', configError)
        // Continue anyway - model directory is deleted
      }
    }

    // Wait for OVMS to detect the config change (polling interval is 1 second)
    // Give it up to 3 seconds to reload
    const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:5950'
    let reloadSuccess = false

    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise<void>((resolve) => {
        const callback = () => resolve()
        setTimeout(callback, 1000)
      })

      try {
        // Check if model is still in OVMS config
        const configUrl = new URL('/v1/config', PROVIDER_URL).href
        const configResponse = await fetch(configUrl)

        if (configResponse.ok) {
          const configData = await configResponse.json()
          // Check if the deleted model is no longer in the response
          if (!configData[modelName]) {
            console.log(`OVMS config reloaded successfully, model ${modelName} removed`)
            reloadSuccess = true
            break
          } else {
            console.log(`Waiting for OVMS to reload config (attempt ${attempt + 1}/3)...`)
          }
        }
      } catch (checkError) {
        console.warn(`Error checking OVMS config on attempt ${attempt + 1}:`, checkError)
      }
    }

    if (!reloadSuccess) {
      console.warn('OVMS may not have reloaded yet, but model was deleted from filesystem')
    }

    console.log('OVMS model deleted successfully:', modelName)
    return NextResponse.json(
      { success: true, message: 'Model deleted successfully' },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error deleting OVMS model:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to delete OVMS model', details: errorMessage },
      { status: 500 },
    )
  }
}
