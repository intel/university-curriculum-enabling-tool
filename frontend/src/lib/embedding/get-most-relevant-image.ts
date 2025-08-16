import { ClientSource } from '../types/client-source'
import { compareEmbeddings, sortBySimilarity } from './embedding-utils'
import { getAllImageEmbeddings } from './get-image-embeddings'
import { getUserEmbedding } from './get-user-embedding'

/**
 * Get the most relevant image based on a user query.
 *
 * This function generates an embedding for the user query, retrieves all stored image embeddings,
 * compares them using cosine similarity, and returns the most relevant image.
 *
 * @param query - The user query to get the most relevant image for.
 * @returns An object containing the filename and similarity score of the most relevant image.
 */
export async function getMostRelevantImage(
  query: string,
  selectedSources: ClientSource[],
): Promise<{ filename: string; similarity: number } | null> {
  if (!query || query.trim() === '') {
    console.log('DEBUG: Empty query provided to findMostRelevantImage')
    return null
  }

  try {
    // Step 1: Get the query embedding
    // console.log(`DEBUG: Generating embedding for query: "${query}"`);
    const userEmbeddings = await getUserEmbedding(query)

    if (!userEmbeddings.length) {
      console.log('DEBUG: No user embeddings generated')
      throw new Error('Failed to generate user embedding.')
    }

    const queryEmbedding = userEmbeddings[0].embedding
    console.log(`DEBUG: Query embedding vector length: ${queryEmbedding.length}`)

    // Step 2: Retrieve all image embeddings
    const imageEmbeddings = await getAllImageEmbeddings(selectedSources)
    console.log(`DEBUG: Retrieved ${imageEmbeddings.length} image embeddings`)

    if (imageEmbeddings.length === 0) {
      console.log('DEBUG: No image embeddings found')
      return null
    }

    // Log sample of first image embedding to check format
    if (imageEmbeddings[0]) {
      console.log(
        `DEBUG: First image embedding vector length: ${imageEmbeddings[0].embedding.length}`,
      )
      console.log(`DEBUG: First image filename: ${imageEmbeddings[0].filename}`)
    }

    // Step 3: Compare embeddings
    const similarities = compareEmbeddings(queryEmbedding, imageEmbeddings)

    // Log all similarities for debugging
    console.log('DEBUG: All image embedding similarities:')
    similarities.forEach((sim) => {
      console.log(`Image: ${sim.filename}, Similarity: ${sim.similarity}`)
    })

    // Step 4: Sort by similarity and return the most relevant image
    const sorted = sortBySimilarity(similarities)
    return sorted.length > 0 ? sorted[0] : null
  } catch (error) {
    console.error('Error in findMostRelevantImage:', error)
    throw error
  }
}
