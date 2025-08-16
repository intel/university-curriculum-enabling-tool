import { ClientSource } from '../types/client-source'
import { ContextChunk } from '../types/context-chunk'
import { generateEmbeddings } from '../embedding/generate-embedding'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'
import { retrieveContextByReranking } from '../reranking/retrieve-context-by-reranking'

/**
 * Retrieves context based on user query embedding and stored embeddings.
 *
 * @param query - The user query to generate embeddings for.
 * @param selectedSources - An array of selected sources to retrieve embeddings from.
 * @param topK - The maximum number of top similar chunks to return.
 * @param chunkSizeToken - The size of each chunk in tokens for embedding generation.
 * @param chunkOverlapToken - The overlap size in tokens between chunks for embedding generation.
 * @returns A promise that resolves to an array of context chunks.
 */
export async function retrieveContextByEmbedding(
  query: string,
  selectedSources: ClientSource[],
  topK: number = parseInt(process.env.RAG_CONTEXT_SIMILARITY_TOP_K || '5', 10),
  chunkSizeToken: number = parseInt(process.env.RAG_EMBEDDING_CHUNK_SIZE_TOKEN || '200'),
  chunkOverlapToken: number = parseInt(process.env.RAG_EMBEDDING_CHUNK_OVERLAP_TOKEN || '50'),
): Promise<ContextChunk[]> {
  // Check if any sources are selected
  if (!selectedSources || selectedSources.length === 0) {
    console.log('No selected sources provided.')
    return []
  }

  // Fetch stored embeddings for the selected sources
  const storedEmbeddings = await getStoredEmbeddings(selectedSources)
  if (storedEmbeddings.length === 0) {
    console.log('No embeddings found for the selected sources.')
    return []
  }

  // Generate embeddings for the user query
  const queryEmbeddingData = await generateEmbeddings(query, chunkSizeToken, chunkOverlapToken)
  if (!queryEmbeddingData.length) {
    console.error('Failed to generate query embedding.')
    return []
  }

  console.log('DEBUG: embeddingRetrival topK:', topK)
  console.log('DEBUG: embeddingRetrival stored embedding length:', storedEmbeddings.length)
  console.log('DEBUG: embeddingRetrival query:', query)
  console.log('DEBUG: embeddingRetrival query embedding length:', queryEmbeddingData.length)

  // Extract the embedding vector from the generated data
  const queryEmbedding = queryEmbeddingData[0].embedding

  // Rerank the selected context chunks
  const selectedChunks = await retrieveContextByReranking(query, storedEmbeddings, queryEmbedding)

  // Return the selected context chunks
  return selectedChunks
}
