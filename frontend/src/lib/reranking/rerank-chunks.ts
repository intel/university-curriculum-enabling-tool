// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { CoreMessage, generateText } from 'ai'
import { ScoredChunk } from '../types/context-chunk'
import { createOllama } from 'ollama-ai-provider'

// Configuration
const CONFIG = {
  // Default values that can be overridden by environment variables
  batchSize: parseInt(process.env.RERANK_BATCH_SIZE || '5', 10),
  maxBatchSize: 5, // Cap at 5 to prevent overwhelming Ollama
  requestDelay: parseInt(process.env.RERANK_REQUEST_DELAY || '500', 10),
  batchDelay: parseInt(process.env.RERANK_BATCH_DELAY || '1000', 10),
  maxChunkLength: parseInt(process.env.MAX_RERANK_CHUNK_LENGTH || '1000', 10),
  defaultModel: process.env.RAG_RERANKER_MODEL || 'llama3.2',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  debug: process.env.DEBUG_RERANKING === 'true',
}

// Logger utilities
const logger = {
  log: (message: string) => {
    if (CONFIG.debug) console.log(`DEBUG: ${message}`)
  },
  error: (message: string, error?: unknown) => {
    if (CONFIG.debug) {
      if (error) console.error(`DEBUG: ${message}`, error)
      else console.error(`DEBUG: ${message}`)
    }
  },
  warn: (message: string) => {
    if (CONFIG.debug) console.warn(`DEBUG: ${message}`)
  },
  table: (rerankedChunks: ScoredChunk[]) => {
    if (!CONFIG.debug) return
    console.log('\nDEBUG: Reranked candidates summary:')
    console.log('| Cand # | Original Idx | Combined Score | Rerank Score | Content Preview |')
    console.log('|--------|--------------|----------------|--------------|-----------------|')
    rerankedChunks.forEach((chunk, i) => {
      const originalIdx = chunk.originalIndex !== undefined ? chunk.originalIndex : 'N/A'
      console.log(
        `| ${(i + 1).toString().padStart(6)} | ${originalIdx.toString().padStart(11)} | ${chunk.combinedScore.toFixed(4).padStart(13)} | ${(chunk.rerankScore || 0).toFixed(4).padStart(12)} | "${chunk.chunk.substring(0, 25).replace(/\n/g, ' ')}..." |`,
      )
    })
    console.log('')
  },
}

// Add type definition for Ollama function
type OllamaFn = ReturnType<typeof createOllama>

/**
 * Creates a reranking prompt for the given query and chunk
 */
function createRerankingPrompt(query: string, chunk: string): CoreMessage {
  return {
    role: 'user',
    content: `Rate the relevance of the following passage to the query on a scale from 0 to 10.
Consider:
- Direct answer to the query
- Information completeness
- Factual accuracy
Query: ${query}
Passage: ${chunk}
Output only the relevance score (0-10):`,
  }
}

/**
 * Truncates a chunk to the maximum allowed length
 */
function truncateChunk(chunk: string): string {
  return chunk.length > CONFIG.maxChunkLength
    ? chunk.substring(0, CONFIG.maxChunkLength) + '...'
    : chunk
}

/**
 * Extracts a relevance score from an LLM response
 */
function extractScore(response: string, fallbackScore: number): number {
  try {
    const scoreMatch = response.match(/(\d+(\.\d+)?)/)
    if (!scoreMatch) {
      logger.warn(`No score found in response: "${response}"`)
      return fallbackScore
    }

    let score = parseFloat(scoreMatch[1])

    // Normalize to 0-1 range if needed
    if (score > 10) score = 10
    if (score > 1) score = score / 10

    return score
  } catch (error) {
    logger.error(`Error parsing score from response: "${response}"`, error)
    return fallbackScore
  }
}

/**
 * Reranks a single chunk against the query
 */
async function rerankChunk(
  ollama: OllamaFn,
  modelName: string,
  query: string,
  chunk: ScoredChunk,
  index: number,
): Promise<number> {
  const candidateNum = index + 1

  try {
    // Truncate chunk if needed
    const truncatedContent = truncateChunk(chunk.chunk)

    // Create prompt and generate response
    const prompt = createRerankingPrompt(query, truncatedContent)
    const response = await generateText({
      model: ollama(modelName),
      messages: [prompt],
      temperature: 0.0,
      maxTokens: 20, // We only need a small response
    })

    // Extract score from response
    return extractScore(response.text, chunk.combinedScore)
  } catch (error) {
    logger.error(`API error reranking candidate #${candidateNum}`, error)
    return chunk.combinedScore // Fallback to combined score
  }
}

/**
 * Process a batch of chunks for reranking
 */
async function processBatch(
  ollama: OllamaFn,
  modelName: string,
  query: string,
  batchChunks: ScoredChunk[],
  startIndex: number,
): Promise<{ index: number; score: number }[]> {
  const results: { index: number; score: number }[] = []

  // Process chunks one at a time
  for (let j = 0; j < batchChunks.length; j++) {
    const chunk = batchChunks[j]
    const actualIndex = startIndex + j

    // Add delay between requests (not for the first one)
    if (j > 0) {
      await new Promise<void>((resolve) => setTimeout(() => resolve(), CONFIG.requestDelay))
    }

    // Rerank this chunk
    const score = await rerankChunk(ollama, modelName, query, chunk, actualIndex)

    results.push({ index: actualIndex, score })
  }

  return results
}

/**
 * Rerank query-chunk pairs using Ollama's reranker model with robust error handling
 */
export async function rerankWithOllama(
  query: string,
  chunks: ScoredChunk[],
  modelName?: string,
): Promise<ScoredChunk[]> {
  const rerankerModel = modelName || CONFIG.defaultModel
  logger.log(`Starting reranking with model: ${rerankerModel}`)
  logger.log(`Number of chunks to rerank: ${chunks.length}`)

  try {
    // Configure Ollama client
    const ollama = createOllama({ baseURL: CONFIG.ollamaUrl + '/api' })

    // Prepare reranked chunks
    const rerankedChunks = [...chunks] // Clone to avoid mutating original

    // Calculate effective batch size
    const batchSize = Math.min(CONFIG.batchSize, CONFIG.maxBatchSize)
    logger.log(`Using batch size of ${batchSize} for reranking`)

    // Process in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      logger.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`,
      )

      const batchChunks = chunks.slice(i, i + batchSize)
      const batchResults = await processBatch(ollama, rerankerModel, query, batchChunks, i)

      // Update scores from batch results
      batchResults.forEach(({ index, score }) => {
        rerankedChunks[index].rerankScore = score
      })

      // Add delay between batches
      if (i + batchSize < chunks.length) {
        logger.log('Adding delay between batches')
        await new Promise<void>((resolve) => setTimeout(() => resolve(), CONFIG.batchDelay))
      }
    }

    logger.log('Completed reranking, sorting results')

    // Optional: log results table
    // logger.table(rerankedChunks);

    // Sort by reranker score
    rerankedChunks.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0))

    return rerankedChunks
  } catch (error) {
    logger.error('Fatal reranking error:', error)
    logger.log('Returning original chunks without reranking')
    return chunks // Fallback to original ranking if reranking fails
  }
}
