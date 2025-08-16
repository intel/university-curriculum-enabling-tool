import type { ClientSource } from '../types/client-source'
import { getStoredChunks } from './get-stored-chunks'

/**
 * Processes source chunks for content generation
 *
 * This function retrieves chunks from selected sources and prepares them
 * for use in content generation with RAG.
 *
 * @param selectedSources - Array of sources selected by the user
 * @returns A promise that resolves to processed chunks and metadata
 */
export async function processSourceChunks(selectedSources: ClientSource[]) {
  // Filter only selected sources
  const filteredSources = selectedSources.filter((source) => source.selected)

  if (filteredSources.length === 0) {
    throw new Error('No sources selected. Please select at least one source document.')
  }

  // Get chunks from the selected sources using the existing function
  const chunks = await getStoredChunks(filteredSources)

  // Sort chunks by source and order to maintain document flow
  chunks.sort((a, b) => {
    // Handle case where sourceId might be undefined
    const sourceIdA = a.sourceId || ''
    const sourceIdB = b.sourceId || ''

    if (sourceIdA === sourceIdB) {
      return (a.order || 0) - (b.order || 0)
    }

    // Ensure we're comparing strings
    return String(sourceIdA).localeCompare(String(sourceIdB))
  })

  // Calculate total token estimate (rough approximation)
  const totalTokenEstimate = chunks.reduce((sum, chunk) => {
    // Approximate token count as words / 0.75 (typical ratio)
    const wordCount = chunk.chunk.split(/\s+/).length
    return sum + Math.ceil(wordCount / 0.75)
  }, 0)

  return {
    chunks,
    metadata: {
      sourceCount: filteredSources.length,
      chunkCount: chunks.length,
      tokenEstimate: totalTokenEstimate,
      sourceNames: filteredSources.map((s) => s.name),
    },
  }
}
