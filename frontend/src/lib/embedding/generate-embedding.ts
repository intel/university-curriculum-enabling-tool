// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { EmbeddingChunk } from '../types/embedding-chunk'
import { detokenize, effectiveTokenCount, tokenize } from '../utils'
import { randomInt } from 'crypto'
import { getProviderInfo } from '../providers'
import { verifyModel } from '../model/model-manager'

interface OllamaEmbedResponse {
  embeddings?: number[][]
  embedding?: number[]
  model?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
}

interface OVMSEmbedResponse {
  object: string
  data: Array<{
    object: string
    embedding: number[]
    index: number
  }>
  model?: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * Generates embeddings for a given text using a specified model via provider-aware API calls.
 *
 * This implementation supports both Ollama and OVMS providers:
 * - Ollama: Uses /api/embed endpoint (OpenAI-compatible at /v1/embeddings)
 * - OVMS: Uses /v3/embeddings endpoint (OpenAI-compatible)
 *
 * Both providers use OpenAI-compatible embedding API format:
 * - Request: { model: string, input: string | string[] }
 * - Response: { data: [{ embedding: number[], index: number }] }
 *
 * @param text - The text to generate embeddings for.
 * @param chunkSizeToken - The size of each chunk in tokens for embedding generation.
 * @param chunkOverlapToken - The overlap size in tokens between chunks for embedding generation.
 * @param modelName - The name of the model to use for embedding generation.
 * @returns A promise that resolves to an array of embedding chunks.
 * @throws An error if the model verification or embedding generation fails.
 */

function sanitizeChunk(text: string): string {
  return (
    text
      // Collapse long runs of periods (..... -> .)
      .replace(/([.])\1{2,}/g, '$1')
      // Collapse long runs of dashes, underscores, etc. (optional)
      .replace(/([-_*])\1{2,}/g, '$1')
      // Remove zero-width and control characters
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B]/g, '')
      // Collapse extra whitespace
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

export async function generateEmbeddings(
  text: string,
  chunkSizeToken: number,
  chunkOverlapToken: number,
  modelName?: string,
): Promise<EmbeddingChunk[]> {
  // Get provider info (Ollama or OVMS)
  const providerInfo = getProviderInfo()
  const { service, baseURL } = providerInfo

  // Get the appropriate model name for embeddings from environment
  // If modelName is provided explicitly, use that; otherwise read from provider-specific env
  let effectiveModelName: string
  if (modelName) {
    effectiveModelName = modelName
  } else if (service === 'ovms') {
    effectiveModelName = process.env.OVMS_EMBEDDING_MODEL || ''
    if (!effectiveModelName) {
      throw new Error('OVMS_EMBEDDING_MODEL environment variable is not set')
    }
  } else {
    effectiveModelName = process.env.OLLAMA_EMBEDDING_MODEL || ''
    if (!effectiveModelName) {
      throw new Error('OLLAMA_EMBEDDING_MODEL environment variable is not set')
    }
  }

  console.log(`DEBUG: generateEmbeddings starting with:`)
  console.log(`  provider: ${service}`)
  console.log(`  baseURL: ${baseURL}`)
  console.log(`  modelName: ${effectiveModelName}`)
  console.log(`  text length: ${text.length}`)

  // Ensure the embedding model is available before trying to use it
  // verifyModel handles both Ollama and OVMS model availability and downloads
  console.log(`DEBUG: Verifying model ${effectiveModelName} is available for ${service}...`)
  const modelAvailable = await verifyModel(baseURL, effectiveModelName)

  if (!modelAvailable) {
    throw new Error(
      `Failed to verify or download embedding model ${effectiveModelName} for ${service}. ` +
        `Please check your ${service === 'ovms' ? 'OVMS_EMBEDDING_MODEL' : 'OLLAMA_EMBEDDING_MODEL'} configuration.`,
    )
  }

  console.log(`DEBUG: Model ${effectiveModelName} is ready`)

  console.log('DEBUG: generateEmbeddings chunkSizeToken:', chunkSizeToken)
  console.log('DEBUG: generateEmbeddings chunkOverlapToken:', chunkOverlapToken)
  const chunks: string[] = []
  const tokens = tokenize(text)
  let start = 0
  while (start < tokens.length) {
    let effectiveCount = 0
    let end = start
    // Accumulate tokens until the summed effective token count meets/exceeds chunkSizeToken.
    while (end < tokens.length && effectiveCount < chunkSizeToken) {
      effectiveCount += effectiveTokenCount(tokens[end])
      end++
    }
    // Ensure progress: if no token was added, move forward.
    if (end === start) {
      start++
      continue
    }
    // Reconstruct chunk text from tokens[start ... end)
    const chunkText = detokenize(tokens.slice(start, end))
    chunks.push(chunkText)

    // Determine the new start index to enforce the desired overlap.
    let overlapEffective = 0
    let newStart = end
    while (newStart > start && overlapEffective < chunkOverlapToken) {
      newStart--
      overlapEffective += effectiveTokenCount(tokens[newStart])
    }
    // Safeguard to ensure we always advance.
    if (newStart === start) {
      start = end
    } else {
      start = newStart
    }
  }

  // For each chunk, call the embedding API in parallel.
  const startTime = Date.now()
  let completedCount = 0
  const totalChunks = chunks.length
  console.log('DEBUG: generateEmbeddings totalChunks:', totalChunks)
  async function embedChunk(chunk: string, index: number): Promise<EmbeddingChunk | null> {
    const sanitized = sanitizeChunk(chunk)

    // Validate chunk after sanitization
    if (!sanitized || sanitized.trim().length === 0) {
      console.warn(`Chunk ${index + 1} is empty after sanitization, skipping`)
      return null
    }

    // Log full chunk if sanitization changed it
    if (sanitized !== chunk) {
      const sanitizeLog = `
Sanitized chunk ${index + 1}:
Before: ${chunk}
After : ${sanitized}
Length: ${chunk.length} -> ${sanitized.length}
-------`
      console.log(sanitizeLog)
    }
    const maxRetries = 5
    const tokens = tokenize(chunk)
    const preview = chunk.slice(0, 500)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `DEBUG: ${service.toUpperCase()} API call for chunk ${index + 1}, attempt ${attempt}, model: ${effectiveModelName}, sanitized length: ${sanitized.length}`,
        )

        // Construct endpoint URL based on provider
        let embeddingUrl: URL
        if (service === 'ovms') {
          // OVMS uses /v3/embeddings (OpenAI-compatible)
          const ovmsBaseUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
          embeddingUrl = new URL('/v3/embeddings', ovmsBaseUrl)
          console.log(`DEBUG: Construct URL to embeddingUrl= ${embeddingUrl}`)
        } else {
          // Ollama uses /api/embed or /v1/embeddings (both work)
          const ollamaBaseUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
          embeddingUrl = new URL('/api/embed', ollamaBaseUrl)
        }

        console.log('DEBUG: Attempting to call /v3/embeddings for OVMS, checking contents')
        console.log(`DEBUG: effectiveModelName=${effectiveModelName}`)
        console.log(`DEBUG: sanitized=${sanitized}`)

        const response = await fetch(embeddingUrl.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: effectiveModelName,
            input: sanitized, // OpenAI-compatible format uses "input" field
          }),
          signal: AbortSignal.timeout(30000), // 30 second timeout
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const responseText = await response.text()
        console.log(
          `DEBUG: Raw response for chunk ${index + 1} (first 200 chars):`,
          responseText.substring(0, 200),
        )

        let embedding: number[]

        try {
          if (service === 'ovms') {
            // OVMS uses OpenAI-compatible format: { data: [{ embedding: [...] }] }
            const ovmsResponse: OVMSEmbedResponse = JSON.parse(responseText)

            if (
              ovmsResponse.data &&
              Array.isArray(ovmsResponse.data) &&
              ovmsResponse.data.length > 0
            ) {
              embedding = ovmsResponse.data[0].embedding
              console.log(`DEBUG: OVMS embedding format, embedding length: ${embedding.length}`)
            } else {
              throw new Error(
                `OVMS response does not contain valid embedding data. Available keys: ${Object.keys(ovmsResponse)}`,
              )
            }
          } else {
            // Ollama can use either format
            const ollamaResponse: OllamaEmbedResponse = JSON.parse(responseText)

            if (
              ollamaResponse.embeddings &&
              Array.isArray(ollamaResponse.embeddings) &&
              ollamaResponse.embeddings.length > 0
            ) {
              // /api/embed format: { "embeddings": [[...]] }
              embedding = ollamaResponse.embeddings[0]
              console.log(`DEBUG: Using 'embeddings' format, embedding length: ${embedding.length}`)
            } else if (ollamaResponse.embedding && Array.isArray(ollamaResponse.embedding)) {
              // /api/embeddings format: { "embedding": [...] }
              embedding = ollamaResponse.embedding
              console.log(`DEBUG: Using 'embedding' format, embedding length: ${embedding.length}`)
            } else {
              throw new Error(
                `Ollama response does not contain valid embedding data. Available keys: ${Object.keys(ollamaResponse)}`,
              )
            }
          }
        } catch (parseError) {
          throw new Error(
            `Failed to parse JSON response: ${parseError}. Response: ${responseText.substring(0, 500)}`,
          )
        }

        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error(
            `Invalid embedding format: expected non-empty array, got ${typeof embedding}`,
          )
        }

        completedCount++
        const completionPercentage = ((completedCount / totalChunks) * 100).toFixed(2)

        const successLog = `
✅ Successfully generated embedding for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
Embedding length: ${embedding.length}
Completion: ${completionPercentage}% (${completedCount}/${totalChunks})
-------`
        console.log(successLog)
        return {
          order: index + 1,
          chunk: sanitized,
          embedding,
          sourceType: 'user' as const,
        }
      } catch (err: unknown) {
        let message: string
        let stack: string | undefined
        if (err instanceof Error) {
          message = err.message
          stack = err.stack
        } else if (typeof err === 'string') {
          message = err
        } else {
          message = JSON.stringify(err)
        }

        const errorLog = `
❌ Attempt ${attempt}/${maxRetries} failed for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
Error: ${message}
${stack ? `Stack: ${stack}` : ''}
-------`
        console.error(errorLog)
        if (attempt < maxRetries) {
          const jitter = randomInt(0, 100)
          const delay = 500 * 2 ** (attempt - 1) + jitter
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), delay)
          })
        }
      }
    }

    const finalErrorLog = `
💥 Failed permanently for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
-------`
    console.error(finalErrorLog)
    return null
  }

  const embeddingPromises = chunks.map((chunk, index) => embedChunk(chunk, index))
  console.log(`DEBUG: Created ${embeddingPromises.length} embedding promises`)

  const settled = await Promise.all(embeddingPromises)
  console.log(`DEBUG: Promise.all settled, results: ${settled.length} items`)

  const results = settled.filter((r): r is EmbeddingChunk => r !== null)

  console.log(`DEBUG: After filtering null results: ${results.length} valid embeddings`)

  const endTime = Date.now()
  const totalTimeTakenMs = endTime - startTime
  const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2)
  console.log(
    `Generated ${results.length}/${chunks.length} embeddings in ${totalTimeTakenMs}ms (${totalTimeTakenSec}s)`,
  )

  if (results.length === 0) {
    console.error('ERROR: No valid embeddings were generated from any chunks')
    console.error(`Total chunks attempted: ${chunks.length}`)
    console.error(`All chunks failed - check Ollama service and model availability`)
  }

  return results
}
