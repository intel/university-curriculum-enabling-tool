// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { cosineSimilarity, tool } from 'ai'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'
import { getUserEmbedding } from '../embedding/get-user-embedding'

export const retrieveExtendedContext = tool({
  description:
    'Retrieves extended context using a lower similarity threshold (default threshold: 0.5, topK: 5) and orders chunks properly.',
  parameters: z.object({
    query: z.string().describe('Latest user query for context retrieval.'),
    conversationHistory: z
      .string()
      .optional()
      .describe('Full conversation history as a single string.'),
    threshold: z.number().optional().default(0.5),
    topK: z.number().optional().default(5),
    selectedSources: z.string().describe('An array of selected sources.'),
  }),
  execute: async ({ query, conversationHistory, threshold, topK, selectedSources }) => {
    const validJsonString = selectedSources
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/True/g, 'true') // Replace True with true
    const parsedData = JSON.parse(validJsonString)
    console.log('parsedData: ', parsedData)

    // Combine the latest query with conversation history for a refined query.
    const refinedQuery = conversationHistory ? `${query}\n${conversationHistory}` : query
    const embeddingChunks: EmbeddingChunk[] = await getStoredEmbeddings(parsedData)
    const userChunks = await getUserEmbedding(refinedQuery)
    // Use the first chunk's embedding as representative.
    const userEmbedding = userChunks[0].embedding
    const scoredChunks = embeddingChunks.map((chunk) => ({
      ...chunk,
      similarity: cosineSimilarity(userEmbedding, chunk.embedding),
    }))
    const simThreshold = threshold ?? 0.5
    let selectedChunks = scoredChunks.filter((chunk) => chunk.similarity >= simThreshold)
    if (selectedChunks.length === 0) {
      selectedChunks = scoredChunks.sort((a, b) => b.similarity - a.similarity).slice(0, topK ?? 5)
    } else {
      selectedChunks.sort((a, b) => a.order - b.order)
    }
    return selectedChunks.map((chunk) => chunk.chunk).join('\n')
  },
})
