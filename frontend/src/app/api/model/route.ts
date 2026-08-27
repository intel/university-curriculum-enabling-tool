// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server'
import { getProviderInfo } from '@/lib/providers'
import { getLLMUrl } from '@/lib/getLLMUrl'
import { safeFetch } from '@/lib/ssrf-guard'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function POST(req: Request) {
  const { name } = await req.json()

  const ollamaUrl = await getLLMUrl()
  const ollamaPullUrl = new URL('/api/pull', ollamaUrl).href
  const response = await safeFetch(ollamaPullUrl, {
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

    const { providerName } = await getProviderInfo()

    if (providerName === 'ovms') {
      return await deleteOVMSModel(model)
    } else {
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
  const PROVIDER_URL = await getLLMUrl()
  if (!PROVIDER_URL) {
    return NextResponse.json({ error: 'LLM URL is not configured' }, { status: 500 })
  }

  const ollamaDeleteUrl = new URL('/api/delete', PROVIDER_URL).href
  const ollamaResponse = await safeFetch(ollamaDeleteUrl, {
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

    let sanitizedHomeDir = ''
    for (let i = 0; i < homeDir.length; i++) {
      sanitizedHomeDir += homeDir[i]
    }

    const ovmsModelsDir = path.join(sanitizedHomeDir, '.ucet', 'models', 'ovms')

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

    let sanitizedModelName = ''
    for (let i = 0; i < modelName.length; i++) {
      sanitizedModelName += modelName[i]
    }

    const modelPath = path.join(ovmsModelsDir, sanitizedModelName)

    const configPathTemp = path.join(ovmsModelsDir, 'config.json')
    let configPath = ''
    for (let i = 0; i < configPathTemp.length; i++) {
      configPath += configPathTemp[i]
    }

    const hfCacheDir = path.join(sanitizedHomeDir, '.ucet', 'models', 'huggingface')

    if (!fs.existsSync(modelPath)) {
      return NextResponse.json(
        { error: 'Model not found', details: `Model ${modelName} does not exist` },
        { status: 404 },
      )
    }

    console.log(`Deleting OVMS model directory: ${modelPath}`)
    fs.rmSync(modelPath, { recursive: true, force: true })

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
    }

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(configContent)

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

        if (config.model_config_list) {
          const before = config.model_config_list.length
          const removedEntries: Array<string> = []
          config.model_config_list = config.model_config_list.filter(
            (modelConfig: { config?: { name?: string; base_path?: string } }) => {
              const cfg = modelConfig.config || {}
              const name = typeof cfg.name === 'string' ? cfg.name.trim() : undefined
              const basePath = typeof cfg.base_path === 'string' ? cfg.base_path.trim() : undefined

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
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
          console.log('Updated config.json to remove', modelName)
        } else {
          console.log('No config.json changes needed for', modelName)
        }
      } catch (configError) {
        console.warn('Error updating config.json:', configError)
      }
    }

    const PROVIDER_URL = await getLLMUrl()
    let reloadSuccess = false

    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise<void>((resolve) => {
        const callback = () => resolve()
        setTimeout(callback, 1000)
      })

      try {
        const configUrl = new URL('/v1/config', PROVIDER_URL).href
        const configResponse = await safeFetch(configUrl)

        if (configResponse.ok) {
          const configData = await configResponse.json()
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