/**
 * Represents an embedding chunk used in embedding generation.
 *
 * This interface defines the structure of an embedding chunk, which includes
 * properties for the chunk content, embedding vector, source ID, and source type.
 * It is used to store and manage embedding data for various sources, including text and images.
 */
export interface ImageEmbeddingChunk {
  order: number
  embedding: number[]
  sourceId?: number
  sourceType: 'user' | 'stored'
  filename?: string
}
