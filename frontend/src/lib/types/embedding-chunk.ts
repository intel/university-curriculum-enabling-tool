// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * Represents an embedding chunk used in embedding generation.
 *
 * This interface defines the structure of an embedding chunk, which includes
 * properties for the chunk content, embedding vector, source ID, and source type.
 * It is used to store and manage embedding data for various sources.
 */
export interface EmbeddingChunk {
  order: number // Order of the chunk in the sequence
  chunk: string // The content of the embedding chunk
  embedding: number[] // The embedding vector for the chunk
  chunkId?: number // Optional chunk ID, as user embeddings may not have a chunk ID
  sourceId?: number // Optional source ID, as user embeddings may not have a source ID
  sourceType: 'user' | 'stored' // Indicates the origin of the chunk (user or stored)
}
