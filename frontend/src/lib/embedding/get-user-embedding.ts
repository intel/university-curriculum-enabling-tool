import { EmbeddingChunk } from '../types/embedding-chunk'
import { generateEmbeddings } from './generate-embedding'

/**
 * Generates embeddings for a user query.
 *
 * This function takes a user query as input and generates embeddings for it.
 * The embeddings are divided into chunks based on the specified chunk size and overlap.
 * Each embedding chunk is marked with a sourceType of 'user' to indicate its origin.
 *
 * @param text - The user query text to generate embeddings for.
 * @returns A promise that resolves to an array of embedding chunks, each with a sourceType of 'user'.
 */
export async function getUserEmbedding(text: string): Promise<EmbeddingChunk[]> {
  const chunkSizeToken = Number(process.env.RAG_EMBEDDING_CHUNK_SIZE_TOKEN) || 200
  const chunkOverlapToken = Number(process.env.RAG_EMBEDDING_CHUNK_OVERLAP_TOKEN) || 50
  const embeddings = await generateEmbeddings(text, chunkSizeToken, chunkOverlapToken)

  // Set sourceType to 'user' for user query embeddings
  return embeddings.map((embedding) => ({
    ...embedding,
    sourceType: 'user',
  }))
}
