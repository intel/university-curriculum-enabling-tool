// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { embed } from 'ai'
import { verifyModel } from '../model/model-manager'
import { detokenize, effectiveTokenCount, tokenize } from '../utils'
import { randomInt } from 'crypto'
/**
 * Generates embeddings for a given text using a specified model.
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
  const modelVerified = await verifyModel(ollamaUrl, modelName)
  if (!modelVerified) {
    throw new Error('Failed to verify model.')
  }

  const ollama = createOllama({ baseURL: `${ollamaUrl}/api` })

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
        const { embedding } = await embed({
          model: ollama.embedding(modelName),
          value: sanitized,
        })
        completedCount++
        const completionPercentage = ((completedCount / totalChunks) * 100).toFixed(2)

        const successLog = `
Successful embedding for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
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
        if (err instanceof Error) {
          message = err.message
        } else if (typeof err === 'string') {
          message = err
        } else {
          message = JSON.stringify(err)
        }

        const errorLog = `
Attempt ${attempt}/${maxRetries} failed for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
Error: ${message}
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
Failed permanently for chunk ${index + 1}/${totalChunks}
Length: ${chunk.length}, Tokens: ${tokens.length}
Preview: ${preview}
-------`
    console.error(finalErrorLog)
    return null
  }

  const embeddingPromises = chunks.map((chunk, index) => embedChunk(chunk, index))
  const settled = await Promise.all(embeddingPromises)

  const results = settled.filter((r): r is EmbeddingChunk => r !== null)

  const endTime = Date.now()
  const totalTimeTakenMs = endTime - startTime
  const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2)
  console.log(
    `Generated ${results.length}/${chunks.length} embeddings in ${totalTimeTakenMs}ms (${totalTimeTakenSec}s)`,
  )

  return results
}
