// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * OVMS Rerank Utility
 *
 * Implements reranking using OVMS /v3/rerank endpoint (Cohere API compatible).
 * This provides efficient batch reranking without prompt engineering.
 *
 * @see https://github.com/openvinotoolkit/model_server/blob/main/docs/model_server_rest_api_rerank.md
 */

import { ScoredChunk } from '../types/context-chunk'
import { breakTaintChain } from '../utils'

// Cache to track which models have been downloaded
const downloadedModels = new Set<string>()

/**
 * OVMS Rerank API Response Format
 */
interface OVMSRerankResponse {
  results: Array<{
    index: number
    relevance_score: number
    document?: string
  }>
}

/**
 * Configuration for OVMS reranking
 */
const CONFIG = {
  maxDocuments: 100, // OVMS default limit
  timeout: 30000, // 30 second timeout
  debug: process.env.DEBUG_RERANKING === 'true',
}

/**
 * Logger utilities
 */
const logger = {
  log: (message: string) => {
    if (CONFIG.debug) console.log(`DEBUG [OVMS Rerank]: ${message}`)
  },
  error: (message: string, error?: unknown) => {
    if (CONFIG.debug) {
      if (error) console.error(`DEBUG [OVMS Rerank]: ${message}`, error)
      else console.error(`DEBUG [OVMS Rerank]: ${message}`)
    }
  },
  warn: (message: string) => {
    if (CONFIG.debug) console.warn(`DEBUG [OVMS Rerank]: ${message}`)
  },
}

/**
 * Ensures an OVMS rerank model is downloaded and available before use.
 */
async function ensureOVMSRerankModelAvailable(modelId: string): Promise<void> {
  // Check if already downloaded in this session
  if (downloadedModels.has(modelId)) {
    logger.log(`Model ${modelId} already verified in this session`)
    return
  }

  logger.log(`Checking if OVMS rerank model ${modelId} is available...`)

  try {
    // Check if model exists via OVMS /v1/config endpoint
    const ovmsBaseUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
    const configUrl = new URL('/v1/config', ovmsBaseUrl)

    const configResponse = await fetch(configUrl.href, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (configResponse.ok) {
      const config = await configResponse.json()

      // Check if model exists in config
      if (config[modelId]) {
        logger.log(`Model ${modelId} found in OVMS config`)
        downloadedModels.add(modelId)
        return
      }
    }

    // Model not found - trigger download
    logger.log(`Model ${modelId} not found in OVMS, triggering download...`)

    // Break taint chain using utility function
    const frontendHost = breakTaintChain(process.env.FRONTEND_HOST || '127.0.0.1')
    const frontendPort = breakTaintChain(process.env.FRONTEND_PORT || '8080')

    const downloadUrl = new URL('/api/ovms/download-model', `http://${frontendHost}`)
    downloadUrl.port = frontendPort

    logger.log(`Calling download API at: ${downloadUrl.href}`)

    const downloadResponse = await fetch(downloadUrl.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        precision: 'int8',
        device: process.env.OVMS_DEVICE || 'CPU',
      }),
      signal: AbortSignal.timeout(300000), // 5 minute timeout
    })

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download model: ${downloadResponse.statusText}`)
    }

    // Stream the download progress
    const reader = downloadResponse.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const update = JSON.parse(line)
              if (update.status) {
                logger.log(`Download progress: ${update.status}`)
              }
              if (update.error) {
                throw new Error(`Download failed: ${update.error}`)
              }
              if (update.status === 'success') {
                logger.log(`Model ${modelId} downloaded successfully`)
                downloadedModels.add(modelId)
                return
              }
            } catch {
              logger.warn(`Could not parse download update: ${line}`)
            }
          }
        }
      }
    }

    downloadedModels.add(modelId)
    logger.log(`Model ${modelId} is now available`)
  } catch (error) {
    logger.error(`Failed to ensure model ${modelId} is available:`, error)
    throw new Error(
      `OVMS rerank model ${modelId} is not available and automatic download failed. ` +
        `Please download manually via the UI or check OVMS_RERANKING_MODEL in .env`,
    )
  }
}

/**
 * Rerank query-chunk pairs using OVMS /v3/rerank endpoint
 *
 * This implementation uses the Cohere-compatible rerank API provided by OVMS.
 * Unlike the Ollama LLM-based reranking, this uses a dedicated rerank model
 * that provides scores in a single batch request.
 *
 * @param query - The user query to compare against chunks
 * @param chunks - Array of scored chunks to rerank
 * @param modelName - Optional model name (defaults to OVMS_RERANKING_MODEL env var)
 * @param topN - Optional limit for top N results (defaults to all chunks)
 * @returns Promise resolving to reranked scored chunks
 *
 * @example
 * ```typescript
 * const reranked = await rerankWithOVMS(
 *   "What is machine learning?",
 *   candidateChunks,
 *   "BAAI/bge-reranker-large"
 * );
 * ```
 */
export async function rerankWithOVMS(
  query: string,
  chunks: ScoredChunk[],
  modelName?: string,
  topN?: number,
): Promise<ScoredChunk[]> {
  const rerankerModel = modelName || process.env.OVMS_RERANKING_MODEL || 'BAAI/bge-reranker-large'
  const ovmsBaseUrl = process.env.PROVIDER_URL || 'http://localhost:5950'

  logger.log(`Starting OVMS reranking with model: ${rerankerModel}`)
  logger.log(`Number of chunks to rerank: ${chunks.length}`)
  logger.log(`OVMS base URL: ${ovmsBaseUrl}`)

  try {
    // Ensure model is available
    await ensureOVMSRerankModelAvailable(rerankerModel)

    // Validate chunk count
    if (chunks.length > CONFIG.maxDocuments) {
      logger.warn(
        `Number of chunks (${chunks.length}) exceeds OVMS limit (${CONFIG.maxDocuments}). Truncating.`,
      )
      chunks = chunks.slice(0, CONFIG.maxDocuments)
    }

    // Extract documents for reranking
    const documents = chunks.map((chunk) => chunk.chunk)

    // Prepare request
    const requestBody = {
      model: rerankerModel,
      query: query,
      documents: documents,
      ...(topN && { top_n: topN }),
      return_documents: true, // Include documents in response for validation
    }

    logger.log(`Sending request to /v3/rerank with ${documents.length} documents`)

    const startTime = Date.now()

    // Call OVMS rerank endpoint
    const rerankUrl = new URL('/v3/rerank', ovmsBaseUrl)
    const response = await fetch(rerankUrl.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(CONFIG.timeout),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OVMS rerank API error (${response.status}): ${errorText}`)
    }

    const data: OVMSRerankResponse = await response.json()

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    logger.log(`Rerank completed in ${duration}s`)
    logger.log(`Received ${data.results.length} results`)

    // Map OVMS results back to scored chunks
    const rerankedChunks: ScoredChunk[] = data.results.map((result) => {
      const originalChunk = chunks[result.index]
      return {
        ...originalChunk,
        rerankScore: result.relevance_score,
        // Combine similarity and rerank score (average)
        combinedScore: (originalChunk.similarity + result.relevance_score) / 2,
      }
    })

    // Sort by rerank score (descending)
    rerankedChunks.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0))

    logger.log(
      `Top 3 reranked scores: ${rerankedChunks
        .slice(0, 3)
        .map((c) => c.rerankScore?.toFixed(4))
        .join(', ')}`,
    )

    return rerankedChunks
  } catch (error) {
    logger.error('Fatal OVMS reranking error:', error)
    logger.log('Returning original chunks without reranking')

    // Fallback: return chunks with their original similarity scores
    return chunks
  }
}
