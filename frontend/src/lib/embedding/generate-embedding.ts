import { createOllama } from 'ollama-ai-provider'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { embed } from 'ai'
import { verifyModel } from '../model/model-manager'
import { detokenize, effectiveTokenCount, tokenize } from '../utils'

/**
 * Generates embeddings for a given text using a specified model.
 *
 * @param text - The text to generate embeddings for.
 * @param chunkSizeToken - The size of each chunk in tokens for embedding generation.
 * @param chunkOverlapToken - The overlap size in tokens between chunks for embedding generation.
 * @param modelName - The name of the model to use for embedding generation.
 * @returns A promise that resolves to an array of embedding chunks.
 * @throws An error if the model verification or embedding generation fails.
 */
export async function generateEmbeddings(
  text: string,
  chunkSizeToken: number,
  chunkOverlapToken: number,
  modelName: string = process.env.RAG_EMBEDDING_MODEL || 'all-minilm:latest',
): Promise<EmbeddingChunk[]> {
  const ollamaUrl = process.env.OLLAMA_URL
  const modelVerified = await verifyModel(ollamaUrl, modelName)
  if (!modelVerified) {
    throw new Error('Failed to verify model.')
  }

  const ollama = createOllama({ baseURL: `${ollamaUrl}/api` })

  console.log('DEBUG: generateEmbeddings chunkSizeToken:', chunkSizeToken)
  console.log('DEBUG: generateEmbeddings chunkOverlapToken:', chunkOverlapToken)
  const chunks: string[] = []
  const tokens = tokenize(text)
  let start = 0
  while (start < tokens.length) {
    let effectiveCount = 0
    let end = start
    // Accumulate tokens until the summed effective token count meets/exceeds chunkSizeToken.
    while (end < tokens.length && effectiveCount < chunkSizeToken) {
      effectiveCount += effectiveTokenCount(tokens[end])
      end++
    }
    // Ensure progress: if no token was added, move forward.
    if (end === start) {
      start++
      continue
    }
    // Reconstruct chunk text from tokens[start ... end)
    const chunkText = detokenize(tokens.slice(start, end))
    chunks.push(chunkText)

    // Determine the new start index to enforce the desired overlap.
    let overlapEffective = 0
    let newStart = end
    while (newStart > start && overlapEffective < chunkOverlapToken) {
      newStart--
      overlapEffective += effectiveTokenCount(tokens[newStart])
    }
    // Safeguard to ensure we always advance.
    if (newStart === start) {
      start = end
    } else {
      start = newStart
    }
  }

  // For each chunk, call the embedding API in parallel.
  const startTime = Date.now()
  let completedCount = 0
  const totalChunks = chunks.length
  console.log('DEBUG: generateEmbeddings totalChunks:', totalChunks)
  const embeddingPromises = chunks.map(async (chunk, index) => {
    try {
      const { embedding } = await embed({
        model: ollama.embedding(modelName),
        value: chunk,
      })
      // console.log(
      //   `Embedding generated for chunk ${index + 1}/${chunks.length}`
      // );
      completedCount++
      const completionPercentage = ((completedCount / totalChunks) * 100).toFixed(2)
      // console.log(
      //   `Embedding generation: ${completionPercentage}% (${completedCount}/${totalChunks})`
      // );
      const tokens = tokenize(chunk)
      console.log(
        `DEBUG: generateEmbeddings: ${completionPercentage}% (${completedCount}/${totalChunks}) | ` +
          `[${index}]: ${chunk.length} chars | ` +
          `Adjusted token (${chunkSizeToken}): ${tokens.length}`,
      )

      return {
        order: index + 1, // 1-based order
        chunk: chunk,
        embedding: embedding, // assumed to be a number[]
        sourceType: 'user' as const, // Specify sourceType for user-generated embeddings
      }
    } catch (error) {
      throw new Error(
        `Failed to generate embedding for chunk ${index + 1}/${totalChunks}: ${error}`,
      )
    }
  })

  const results = await Promise.all(embeddingPromises)
  const endTime = Date.now()
  const totalTimeTakenMs = endTime - startTime
  const totalTimeTakenSec = (totalTimeTakenMs / 1000).toFixed(2)
  console.log(
    `Generated ${chunks.length} embeddings in ${totalTimeTakenMs}ms (${totalTimeTakenSec}s)`,
  )

  return results
}
