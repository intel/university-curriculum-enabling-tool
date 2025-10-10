// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { cosineSimilarity, tool } from 'ai'
import { getUserEmbedding } from '../embedding/get-user-embedding'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'

export const retrieveContext = tool({
  description:
    'Retrieves the most relevant context using a high similarity threshold (default 0.8, topK 3) from the selected sources.',
  inputSchema: z.object({
    query: z.string().describe('Latest user query for context retrieval.'),
    conversationHistory: z
      .string()
      .optional()
      .describe('Full conversation history as a single string.'),
    selectedSources: z
      .string()
      .describe(
        'An array of selected sources consisting of source id (i.e. id: 2), source name, source type and source metadata object if provided.',
      ),
  }),
  execute: async ({ query, conversationHistory, selectedSources }) => {
    try {
      console.log('DEBUG: retrieveContext selectedSources:', selectedSources)
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
      const simThreshold = 0.8
      let selectedChunks = scoredChunks.filter((chunk) => chunk.similarity >= simThreshold)
      if (selectedChunks.length === 0) {
        selectedChunks = scoredChunks.sort((a, b) => b.similarity - a.similarity).slice(0, 3)
      } else {
        selectedChunks.sort((a, b) => a.order - b.order)
      }
      return selectedChunks.map((chunk) => chunk.chunk).join('\n')
    } catch (error) {
      console.error(`Failed to generate tool result: ${error}`)
      return 'no context'
    }
  },
})
