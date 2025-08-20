// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getPayload } from 'payload'
import config from '@payload-config'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { ClientSource } from '../types/client-source'
import type { Embedding, Chunk } from '@/payload-types'

/**
 * Converts the stored embedding field into a number array.
 *
 * This function takes an embedding field, which can be in various formats,
 * and converts it into an array of numbers. It handles arrays, JSON strings,
 * and comma-separated strings.
 *
 * @param embedding - The stored embedding data to convert.
 * @returns An array of numbers representing the embedding.
 */
function parseEmbedding(embedding: unknown): number[] {
  if (Array.isArray(embedding)) {
    return embedding.map((x) => Number(x))
  }
  if (typeof embedding === 'string') {
    try {
      const parsed = JSON.parse(embedding)
      if (Array.isArray(parsed)) {
        return parsed.map((x) => Number(x))
      }
    } catch (error) {
      console.log(`Faile to parse embedding: ${error}`)
      return embedding.split(',').map((x) => Number(x.trim()))
    }
  }
  return []
}

/**
 * Retrieves stored embeddings for an array of selected sources.
 *
 * This function fetches stored embeddings from a CMS for the given selected sources.
 * It converts the stored embedding data into a usable format and includes metadata
 * such as the source ID and source type.
 *
 * @param selectedSources - An array of selected sources to retrieve embeddings from.
 * @returns A promise that resolves to an array of embedding chunks, each with metadata.
 */
export async function getStoredEmbeddings(
  selectedSources: ClientSource[],
): Promise<EmbeddingChunk[]> {
  const sourceIds = selectedSources.map((s) => s.id)
  console.log('sourceIds:', sourceIds)

  const payload = await getPayload({ config })
  // Only fetch text embeddings: chunk set, media not set
  const cmsResponse = await payload.find({
    collection: 'embeddings',
    where: {
      and: [
        { source: { in: sourceIds } },
        { chunk: { not_equals: null } },
        { media: { equals: null } },
      ],
    },
    depth: 1,
    limit: 0,
  })
  return cmsResponse.docs.map((doc: Embedding) => ({
    order:
      doc.chunk && typeof doc.chunk === 'object' && 'order' in doc.chunk
        ? (doc.chunk as Chunk).order
        : 0,
    chunk:
      doc.chunk && typeof doc.chunk === 'object' && 'chunk' in doc.chunk
        ? (doc.chunk as Chunk).chunk
        : '',
    embedding: parseEmbedding(doc.embedding),
    chunkId:
      doc.chunk && typeof doc.chunk === 'object' && 'id' in doc.chunk ? (doc.chunk as Chunk).id : 0,
    sourceId: typeof doc.source === 'number' ? doc.source : doc.source.id,
    sourceType: 'stored',
  }))
}
