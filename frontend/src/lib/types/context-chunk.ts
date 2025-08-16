/**
 * Represents a context chunk used in embedding retrieval.
 *
 * This interface defines the structure of a context chunk, which includes
 * properties for the chunk content, similarity score, source ID, source type,
 * and order. It is used to store and manage context information for embeddings.
 */
export interface ContextChunk {
  chunk: string // The content of the context chunk
  similarity: number // Similarity score of the chunk compared to a query
  sourceId?: number // Optional source ID, as user embeddings may not have a source ID
  sourceType: 'user' | 'stored' // Indicates the origin of the chunk (user or stored)
  order: number // Order of the chunk in the sequence
  sourceName?: string // Optional name of the source
}

/**
 * Represents a scored context chunk used in ranking and retrieval.
 *
 * This interface extends `ContextChunk` by adding fields related to scoring
 * and ranking. These scores are used to evaluate the relevance of the chunk
 * in response to a query.
 *
 * @property {number} originalIndex - The original position of the chunk in the dataset.
 * @property {number} bm25Score - The BM25 score, a traditional information retrieval metric.
 * @property {number} semanticScore - The semantic similarity score based on embeddings.
 * @property {number} combinedScore - A combined score derived from multiple metrics.
 * @property {number} [rerankScore] - An optional score used for reranking results.
 */
export interface ScoredChunk extends ContextChunk {
  originalIndex: number
  bm25Score: number
  semanticScore: number
  combinedScore: number
  rerankScore?: number // Added for reranking
}
