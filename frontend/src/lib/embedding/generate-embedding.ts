// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { EmbeddingChunk } from '../types/embedding-chunk'
import { verifyModel } from '../model/model-manager'
import { detokenize, effectiveTokenCount, tokenize } from '../utils'
import { randomInt } from 'crypto'

interface OllamaEmbedResponse {
  embeddings?: number[][]
  embedding?: number[]
  model?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
}
/**
 * Generates embeddings for a given text using a specified model via direct Ollama API calls.
 *
 * This implementation bypasses the ollama-ai-provider-v2 which was causing "Invalid JSON response"
 * errors and uses direct HTTP calls to Ollama's /api/embed endpoint with support for both
 * response formats (embeddings[] and embedding[]).
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
  modelName: string = process.env.RAG_EMBEDDING_MODEL || 'all-minilm:latest',
): Promise<EmbeddingChunk[]> {
  const ollamaUrl = process.env.OLLAMA_URL

  console.log(`DEBUG: generateEmbeddings starting with:`)
  console.log(`  ollamaUrl: ${ollamaUrl}`)
  console.log(`  modelName: ${modelName}`)
  console.log(`  text length: ${text.length}`)

  if (!ollamaUrl) {
    throw new Error('OLLAMA_URL environment variable is not set')
  }

  const modelVerified = await verifyModel(ollamaUrl, modelName)
  if (!modelVerified) {
    throw new Error(`Failed to verify model: ${modelName} at ${ollamaUrl}`)
  }

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
          `DEBUG: Direct Ollama API call for chunk ${index + 1}, attempt ${attempt}, model: ${modelName}, sanitized length: ${sanitized.length}`,
        )

        const url = new URL('/api/embed', ollamaUrl)
        const response = await fetch(url.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            input: sanitized,
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

        let responseJson: OllamaEmbedResponse
        try {
          responseJson = JSON.parse(responseText)
        } catch (parseError) {
          throw new Error(
            `Failed to parse JSON response: ${parseError}. Response: ${responseText.substring(0, 500)}`,
          )
        }

        // Handle both response formats: newer /api/embed and older /api/embeddings
        let embedding: number[]

        if (
          responseJson.embeddings &&
          Array.isArray(responseJson.embeddings) &&
          responseJson.embeddings.length > 0
        ) {
          // /api/embed format: { "embeddings": [[...]] }
          embedding = responseJson.embeddings[0]
          console.log(`DEBUG: Using 'embeddings' format, embedding length: ${embedding.length}`)
        } else if (responseJson.embedding && Array.isArray(responseJson.embedding)) {
          // /api/embeddings format: { "embedding": [...] }
          embedding = responseJson.embedding
          console.log(`DEBUG: Using 'embedding' format, embedding length: ${embedding.length}`)
        } else {
          throw new Error(
            `Response does not contain valid embedding data. Available keys: ${Object.keys(responseJson)}`,
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
