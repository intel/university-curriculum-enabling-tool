// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// Default values from environment variables
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || ''
const DEFAULT_MODEL_NAME = process.env.RAG_EMBEDDING_MODEL || 'all-minilm:latest'

/**
 * Checks if a model is available in the Ollama AI provider.
 *
 * @param ollamaUrl - The base URL of the Ollama API. Defaults to the environment variable OLLAMA_URL.
 * @param modelName - The name of the model to check. Defaults to the environment variable RAG_EMBEDDING_MODEL.
 * @returns A promise that resolves to a boolean indicating whether the model is available.
 */
export async function isModelAvailable(
  ollamaUrl: string = DEFAULT_OLLAMA_URL,
  modelName: string = DEFAULT_MODEL_NAME,
): Promise<boolean> {
  try {
    console.log(`Verifying model: ${modelName}`)
    const tagsUrl = new URL('/api/tags', ollamaUrl).href
    const response = await fetch(tagsUrl)
    const data = await response.json()

    const hasTag = modelName.includes(':')
    const baseModelName = hasTag ? modelName : `${modelName}:latest`

    return data.models.some((model: { name: string }) => {
      if (hasTag) {
        return model.name === modelName
      } else {
        return model.name === baseModelName || model.name === `${modelName}:latest`
      }
    })
  } catch (error) {
    console.error('Error checking Ollama models:', error)
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
 * @param ollamaUrl - The base URL of the Ollama API. Defaults to the environment variable OLLAMA_URL.
 * @param modelName - The name of the model to download. Defaults to the environment variable RAG_EMBEDDING_MODEL.
 * @returns A promise that resolves to a boolean indicating whether the download was successful.
 */
export async function downloadModel(
  ollamaUrl: string = DEFAULT_OLLAMA_URL,
  modelName: string = DEFAULT_MODEL_NAME,
): Promise<boolean> {
  try {
    console.log(`Downloading model: ${modelName}...`)

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

/**
 * Verifies the availability of a model and downloads it if necessary.
 *
 * @param ollamaUrl - The base URL of the Ollama API. Defaults to the environment variable OLLAMA_URL.
 * @param model - The name of the model to verify and download if needed. Defaults to the environment variable RAG_EMBEDDING_MODEL.
 * @returns A promise that resolves to a boolean indicating whether the model is verified and available.
 */
export async function verifyModel(
  ollamaUrl: string = DEFAULT_OLLAMA_URL,
  model: string = DEFAULT_MODEL_NAME,
): Promise<boolean> {
  try {
    const modelExists = await isModelAvailable(ollamaUrl, model)
    if (!modelExists) {
      const downloadSuccess = await downloadModel(ollamaUrl, model)
      return downloadSuccess
    }
    return true
  } catch (error) {
    console.error('Error verifying model:', error)
    return false
  }
}
