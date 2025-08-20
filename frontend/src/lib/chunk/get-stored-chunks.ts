// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getPayload } from 'payload'
import config from '@payload-config'
import { ClientSource } from '../types/client-source'
import { ContextChunk } from '../types/context-chunk'
import type { Chunk } from '@/payload-types'

/**
 * Sanitizes a text chunk to prevent issues with JSON parsing
 * @param text The chunk text to sanitize
 * @returns Sanitized text
 */
function sanitizeChunkText(text: string): string {
  if (!text) return ''

  // Remove control characters that could break JSON
  const sanitized = text
    // Remove control characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    // Escape backslashes not part of escape sequences
    .replace(/\\(?!["\\/bfnrt])/g, '\\\\')
    // Escape double quotes
    .replace(/"/g, '\\"')
    // Replace any non-printable characters
    .replace(/[^\x20-\x7E]/g, ' ')
    // Normalize line endings
    .replace(/\r\n|\r|\n/g, '\n')
    .trim()

  return sanitized
}

/**
 * Retrieves stored chunks for an array of selected sources.
 *
 * This function fetches stored chunks from a CMS for the given selected sources.
 *
 * @param selectedSources - An array of selected sources to retrieve embeddings chunk from.
 * @returns A promise that resolves to an array of chunks, each with metadata
 *          including the chunk content, a default similarity score of 1, the source ID,
 *          the source type as 'stored', and the order of the chunk.
 */
export async function getStoredChunks(selectedSources: ClientSource[]): Promise<ContextChunk[]> {
  const sourceIds = selectedSources.map((s) => s.id)
  const payload = await getPayload({ config })
  const cmsResponse = await payload.find({
    collection: 'chunks',
    where: { source: { in: sourceIds } },
    depth: 0,
    limit: 0,
    sort: 'order',
  })
  return cmsResponse.docs.map((doc: Chunk) => ({
    chunk: sanitizeChunkText(doc.chunk),
    similarity: 1,
    sourceId: typeof doc.source === 'number' ? doc.source : doc.source.id,
    sourceType: 'stored',
    order: doc.order,
  }))
}
