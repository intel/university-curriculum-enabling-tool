import { cosineSimilarity } from 'ai'
import { ImageEmbeddingChunk } from '../types/image-embedding-chunk'

/**
 * Compares a query embedding with a list of embeddings and calculates similarity scores.
 *
 * @param queryEmbedding - The embedding vector for the query.
 * @param embeddings - An array of embeddings to compare against.
 * @returns An array of objects containing the filename and similarity score.
 */
export function compareEmbeddings(
  queryEmbedding: number[],
  embeddings: ImageEmbeddingChunk[],
): { filename: string; similarity: number }[] {
  return embeddings.map((embedding) => {
    if (!Array.isArray(embedding.embedding)) {
      throw new Error(`Invalid embedding format for filename: ${embedding.filename}`)
    }

    // Make vectors the same length by truncating the longer vector
    let vectorA = queryEmbedding
    let vectorB = embedding.embedding

    // If vectors have different lengths
    if (vectorA.length !== vectorB.length) {
      // console.log(`Vector length mismatch: query(${vectorA.length}), image(${vectorB.length})`);

      // Truncate the longer vector to match the shorter one's length
      if (vectorA.length > vectorB.length) {
        vectorA = vectorA.slice(0, vectorB.length)
      } else {
        vectorB = vectorB.slice(0, vectorA.length)
      }
    }

    return {
      filename: embedding.filename || 'unknown',
      similarity: cosineSimilarity(vectorA, vectorB),
    }
  })
}

/**
 * Sorts an array of similarity scores in descending order.
 *
 * @param similarities - An array of objects containing filenames and similarity scores.
 * @returns A sorted array of objects with the highest similarity first.
 */
export function sortBySimilarity(
  similarities: { filename: string; similarity: number }[],
): { filename: string; similarity: number }[] {
  return similarities.sort((a, b) => b.similarity - a.similarity)
}
