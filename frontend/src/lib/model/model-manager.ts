// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProviderInfo } from '@/lib/providers'

/**
 * Model Manager for AI Providers
 *
 * This module handles model availability checking and downloading.
 *
 * **Supported Providers:**
 * - Ollama: Automatic model download via /api/pull (GGUF format)
 * - OVMS: Automatic model download/conversion from HuggingFace (OpenVINO IR format)
 *
 * **OVMS Workflow:**
 * 1. Download model from HuggingFace Hub
 * 2. Convert to OpenVINO IR format (via optimum-intel)
 * 3. Automatically add to config.json
 * 4. OVMS auto-reloads (via --poll-interval flag)
 * 5. Model ready to use
 *
 * **Note on Model Names:**
 * - For embeddings/reranking, model names should be read from environment variables
 * - OLLAMA_EMBEDDING_MODEL, OVMS_EMBEDDING_MODEL, etc.
 * - No hardcoded defaults - let the application fail fast if env is misconfigured
 */

/**
 * Checks if a model is available in the Ollama or OVMS AI provider.
 *
 * @param providerUrl - The base URL of the Ollama or OVMS.
 * @param modelName - The name of the model to check.
 * @returns A promise that resolves to a boolean indicating whether the model is available.
 */
export async function isModelAvailable(providerUrl: string, modelName: string): Promise<boolean> {
  const { service } = getProviderInfo()

  try {
    console.log(`Verifying model: ${modelName} on ${service}`)

    if (service === 'ovms') {
      // OVMS uses /v1/config endpoint
      const configUrl = new URL('/v1/config', providerUrl).href
      const response = await fetch(configUrl)

      if (!response.ok) {
        console.error(`OVMS config endpoint returned ${response.status}`)
        return false
      }

      const data = await response.json()

      // OVMS config format: { "mediapipe_config_list": [...] }
      if (data.mediapipe_config_list && Array.isArray(data.mediapipe_config_list)) {
        // Check if model exists in config
        const modelExists = data.mediapipe_config_list.some(
          (config: { name: string }) => config.name === modelName,
        )

        if (modelExists) {
          console.log(`Model ${modelName} found in OVMS config`)
          return true
        } else {
          console.log(`Model ${modelName} not found in OVMS config`)
          console.log(
            `Available models: ${data.mediapipe_config_list.map((c: { name: string }) => c.name).join(', ')}`,
          )
          return false
        }
      }

      return false
    } else {
      // Ollama uses /api/tags endpoint
      const tagsUrl = new URL('/api/tags', providerUrl).href
      const response = await fetch(tagsUrl)

      if (!response.ok) {
        console.error(`Ollama tags endpoint returned ${response.status}`)
        return false
      }

      const data = await response.json()

      if (!data.models || !Array.isArray(data.models)) {
        console.error('Ollama response missing models array')
        return false
      }

      const hasTag = modelName.includes(':')
      const baseModelName = hasTag ? modelName : `${modelName}:latest`

      const modelExists = data.models.some((model: { name: string }) => {
        if (hasTag) {
          return model.name === modelName
        } else {
          return model.name === baseModelName || model.name === `${modelName}:latest`
        }
      })

      if (modelExists) {
        console.log(`Model ${modelName} found in Ollama`)
      } else {
        console.log(`Model ${modelName} not found in Ollama`)
      }

      return modelExists
    }
  } catch (error) {
    console.error(`Error checking ${service} models:`, error)
    return false
  }
}

/**
 * Creates a readable stream that logs the download progress of a model.
 *
 * @param body - The body of the response as a readable stream.
 * @param totalBytes - The total number of bytes to be downloaded.
 * @returns A readable stream that logs the download progress.
 */
export function createProgressStream(
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
          console.log(`Download progress: 100%`)
          controller.close()
          return
        }

        receivedBytes += value.length
        const progress = totalBytes ? ((receivedBytes / totalBytes) * 100).toFixed(2) : null

        if (progress) {
          console.log(`Download progress: ${progress}%`)
        }

        controller.enqueue(value)
      }
    },
  })
}

/**
 * Downloads a model from the Ollama AI provider if it is not already available.
 *
 * @param ollamaUrl - The base URL of the Ollama API.
 * @param modelName - The name of the model to download.
 * @returns A promise that resolves to a boolean indicating whether the download was successful.
 */
export async function downloadModel(ollamaUrl: string, modelName: string): Promise<boolean> {
  try {
    console.log(`Downloading Ollama model: ${modelName}...`)

    const pullOllamaUrl = new URL('/api/pull', ollamaUrl).href
    const response = await fetch(pullOllamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download model: ${modelName}`)
    }

    const totalBytes = response.headers.get('Content-Length')
      ? parseInt(response.headers.get('Content-Length') || '0', 10)
      : null

    const progressStream = createProgressStream(response.body, totalBytes)

    const reader = progressStream.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }

    console.log(`Model ${modelName} downloaded successfully.`)
    return true
  } catch (error) {
    console.error('Error downloading model:', error)
    return false
  }
}

export async function downloadHuggingFaceModel(
  modelName: string,
  weightFormat?: string,
): Promise<boolean> {
  try {
    console.log(`Downloading HuggingFace model: ${modelName}...`)
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'
    const pullHuggingFaceUrl = new URL('/api/ovms/download-model', baseUrl).href

    type DownloadModelBody = { modelId: string; weightFormat?: string }
    const body: DownloadModelBody = { modelId: modelName }
    if (weightFormat !== undefined) {
      body.weightFormat = weightFormat
    }

    const response = await fetch(pullHuggingFaceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`Failed to download model: ${modelName}`, errorText)
      throw new Error(`Failed to download model: ${modelName} - ${errorText}`)
    }

    if (!response.body) {
      throw new Error(`No response body for model: ${modelName}`)
    }

    // Stream and process response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete JSON lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const progress = JSON.parse(line)
            console.log(`OVMS download progress:`, progress)

            // Check for errors in progress stream
            if (progress.error) {
              throw new Error(progress.error)
            }

            // Log progress status
            if (progress.status) {
              console.log(`Status: ${progress.status}`)
            }

            if (progress.completed !== undefined && progress.total !== undefined) {
              const percent = ((progress.completed / progress.total) * 100).toFixed(1)
              console.log(`Progress: ${percent}%`)
            }
          } catch (parseError) {
            console.warn('Failed to parse progress line:', line, parseError)
          }
        }
      }
    }

    console.log(`Model ${modelName} downloaded successfully.`)
    return true
  } catch (error) {
    console.error('Error downloading model:', error)
    return false
  }
}

/**
 * Verifies the availability of a model and downloads it if necessary.
 *
 * - Ollama: Downloads GGUF models via /api/pull (fast, seconds to minutes)
 * - OVMS: Downloads from HuggingFace Hub via /api/ovms/download-model
 * **Note:** OVMS model downloads include:
 * 1. Download from HuggingFace Hub
 * 2. Conversion to OpenVINO IR format
 * 3. Auto-configuration in OVMS config.json
 * 4. OVMS auto-reload to register new model
 *
 * @param providerUrl - The base URL of the provider API.
 * @param model - The name of the model to verify and download if needed.
 * @param weightFormat - Optional weight format e.g. 'int8', 'fp16', etc.
 * @returns A promise that resolves to a boolean indicating whether the model is verified and available.
 */
export async function verifyModel(
  providerUrl: string,
  model: string,
  weightFormat?: string,
): Promise<boolean> {
  const { service } = getProviderInfo()

  try {
    const modelExists = await isModelAvailable(providerUrl, model)
    if (!modelExists) {
      if (service === 'ollama') {
        // For Ollama, try to download the model automatically
        console.log(`Model ${model} not found, attempting to download...`)
        const downloadSuccess = await downloadModel(providerUrl, model)
        return downloadSuccess
      } else if (service === 'ovms') {
        // For OVMS, automatically download from HuggingFace
        console.log(`OVMS model '${model}' not found, attempting to download from HuggingFace...`)
        console.log(`This may take 10-30 minutes depending on model size and network speed.`)
        const downloadSuccess = await downloadHuggingFaceModel(model, weightFormat)
        return downloadSuccess
      } else {
        // For other providers
        console.log(`${model} not found, attempting to download from HuggingFace...`)
        const downloadSuccess = await downloadHuggingFaceModel(model, weightFormat)
        return downloadSuccess
      }
    }
    return true
  } catch (error) {
    console.error('Error verifying model:', error)
    return false
  }
}

/**
 * Checks if a model is available in the OVMS provider.
 *
 * @param ovmsUrl - The base URL of the OVMS API.
 * @param modelName - The name of the model to check (as configured in config.json).
 * @returns A promise that resolves to a boolean indicating whether the model is loaded.
 * @deprecated Use isModelAvailable() instead
 */
export async function isOVMSModelAvailable(ovmsUrl: string, modelName: string): Promise<boolean> {
  try {
    console.log(`Verifying OVMS model: ${modelName}`)

    // OVMS uses /v3/models endpoint
    const modelsUrl = new URL('/v3/models', ovmsUrl).href
    const response = await fetch(modelsUrl)

    if (!response.ok) {
      console.error(`OVMS models endpoint returned ${response.status}`)
      return false
    }

    const data = await response.json()

    // OVMS returns models array
    if (data.models && Array.isArray(data.models)) {
      return data.models.some(
        (model: { model_version: { model: { name: string } } }) =>
          model.model_version?.model?.name === modelName,
      )
    }

    return false
  } catch (error) {
    console.error('Error checking OVMS models:', error)
    return false
  }
}

/**
 * Downloads and converts a model from HuggingFace for OVMS.
 *
 * This function:
 * 1. Downloads model from HuggingFace Hub
 * 2. Converts to OpenVINO IR format
 * 3. Automatically adds to OVMS config.json
 * 4. OVMS auto-reloads (via --poll-interval flag)
 *
 * @param modelId - HuggingFace model ID (e.g., 'OpenVINO/Qwen2.5-1.5B-Instruct-int8-ov')
 * @param weightFormat - Quantization format: 'int4', 'int8', 'fp16', 'fp32' (default: 'int4')
 * @param device - Target device: 'CPU', 'GPU', 'NPU', 'AUTO' (default: 'CPU')
 * @param hfToken - Optional HuggingFace token for private/gated models
 * @param onProgress - Optional callback for progress updates
 * @returns A promise that resolves to a boolean indicating whether the download was successful.
 */
export async function downloadOVMSModel(
  modelId: string,
  weightFormat: string = 'int4',
  device: string = 'CPU',
  hfToken?: string,
  onProgress?: (progress: {
    status: string
    message: string
    completed: number
    total: number
    error?: string
  }) => void,
): Promise<boolean> {
  try {
    console.log(`Downloading OVMS model: ${modelId}`)

    const downloadUrl = new URL('/api/ovms/download-model', window.location.origin).href

    const response = await fetch(downloadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId,
        weightFormat,
        device,
        hfToken,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('OVMS model download failed:', errorData)
      if (onProgress) {
        onProgress({
          status: 'error',
          message: errorData.error || 'Download failed',
          completed: 0,
          total: 100,
          error: errorData.error,
        })
      }
      return false
    }

    // Stream progress updates
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      console.error('No response body reader available')
      return false
    }

    let done = false
    let buffer = ''

    while (!done) {
      const { value, done: streamDone } = await reader.read()
      done = streamDone

      if (value) {
        buffer += decoder.decode(value, { stream: !done })

        // Process complete JSON lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const progress = JSON.parse(line)
              console.log('OVMS download progress:', progress)

              if (onProgress) {
                onProgress(progress)
              }

              // Check for errors
              if (progress.error) {
                console.error('OVMS download error:', progress.error)
                return false
              }

              // Check for completion
              if (progress.status === 'success' && progress.completed === 100) {
                console.log(`OVMS model ${modelId} ready to use`)
                return true
              }
            } catch (parseError) {
              console.error('Failed to parse progress JSON:', line, parseError)
            }
          }
        }
      }
    }

    // If we reach here, check if we got success
    console.log(`OVMS model ${modelId} download completed`)
    return true
  } catch (error) {
    console.error('Error downloading OVMS model:', error)
    if (onProgress) {
      onProgress({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        completed: 0,
        total: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    return false
  }
}
