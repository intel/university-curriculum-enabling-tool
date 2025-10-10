// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import {
  APICallError,
  cosineSimilarity,
  generateObject,
  NoObjectGeneratedError,
  TypeValidationError,
} from 'ai'
import { ContextChunk } from '../types/context-chunk'
import { verifyModel } from '../model/model-manager'
import { createOllama } from 'ollama-ai-provider-v2'
import { EmbeddingChunk } from '../types/embedding-chunk'
import { z } from 'zod'
import { effectiveTokenCountForText } from '../utils'

// Define a schema for the reranking output.
const rerankingSchema = z.object({
  ranking: z.array(
    z.object({
      candidate: z.number(),
      score: z.number(),
    }),
  ),
})

export interface RerankingResult {
  candidate: number
  score?: number
}

/**
 * Reranking context chunks based on relevance scores from a cross-encoder model.
 *
 * @param query - The user query to compare against context chunks.
 * @param storedEmbedding - The stored embeddings to compare against.
 * @param queryEmbedding - The embedding of the query.
 * @param similarityTopK - The number of top candidates to select based on similarity.
 * @param rerankingTopK - The number of top candidates to rerank.
 * @param similarityThreshold - The threshold for filtering candidates based on similarity.
 * @param rerankingModel - The model used for reranking.
 * @param tokenMax - The maximum number of tokens for the model.
 * @returns A promise that resolves to an array of reranked context chunks.
 */
export async function retrieveContextByReranking(
  query: string,
  storedEmbedding: EmbeddingChunk[],
  queryEmbedding: number[],
  similarityTopK: number = parseInt(process.env.RAG_CONTEXT_SIMILARITY_TOP_K || '5', 10),
  rerankingTopK: number = parseInt(process.env.RAG_RERANKING_TOP_K || '15', 10),
  similarityThreshold: number = parseFloat(process.env.RAG_CONTEXT_SIMILARITY_THRESHOLD || '0.8'),
  rerankingModel: string = process.env.RAG_RERANKING_MODEL || 'llama3.2',
  tokenMax: number = parseInt(process.env.RAG_TOKEN_MAX ?? '1024'),
): Promise<ContextChunk[]> {
  // Step 1: Compute cosine similarity for each chunk.
  const candidates = storedEmbedding.map((stored) => ({
    ...stored,
    sourceId: stored.sourceId,
    chunk: stored.chunk,
    similarity: cosineSimilarity(queryEmbedding, stored.embedding),
    order: stored.order,
    sourceType: stored.sourceType,
  }))

  // Sort candidates by cosine similarity in descending order.
  candidates.sort((a, b) => b.similarity - a.similarity)

  // Filter candidates by the similarity threshold.
  const filteredCandidates = candidates.filter((c) => c.similarity >= similarityThreshold)

  // If no candidate passes the threshold, return the top similarityTopK candidates.
  if (filteredCandidates.length <= similarityTopK) {
    return candidates.slice(0, similarityTopK).map((c) => ({
      chunk: c.chunk || '',
      similarity: c.similarity,
      sourceId: c.sourceId || 0,
      sourceType: c.sourceType,
      order: c.order || 0,
    }))
  }

  // [DEBUG] show the list of all candidates
  // const similarityBefore = candidates.map(chunk => ({
  //   similarity: chunk.similarity,
  //   order: chunk.order,
  //   sourceId: chunk.sourceId,
  // }));
  // console.log("DEBUG: Reranked (before):", similarityBefore);

  // Select top candidate chunks for reranking.
  const topCandidates = filteredCandidates.slice(0, rerankingTopK)

  // [DEBUG] show the contents of all topK reranking topCandidates
  // console.log("DEBUG: topCandidates (reranking):", topCandidates.map(candidate => ({
  //   order: candidate.order,
  //   similarity: candidate.similarity,
  //   sourceId: candidate.sourceId,
  //   // chunk: candidate.chunk,
  // })));

  // Construct the prompt for the reranking model.
  const rerankingPrompt = `
You are an expert in assessing relevance for retrieval augmented generation.
Given the query:
"${query}"
and the following candidate total ${topCandidates.length} candidate context chunks:
${topCandidates.map((c, i) => `[Candidate ${i + 1}]. ${c.chunk}`).join('\n')}
Please rank the score of these candidates from most relevant to least relevant.
For each candidate, assign a relevance score between 0 and 1.
Return the result as a JSON object in the same sequence with a key "ranking" that is an array of objects.
Each object should have:
  - "candidate": the candidate number of the text,
  - "score": the numerical relevance score.
Return only a plain JSON object without including it in a code block with markdown formatting.
Just a plain JSON object. Do not include any markdown formatting in your response.
Example Correct Response:
"{
    "ranking": [
        {
            "candidate": <candidate number based on context chunk>,
            "score": <floating-point numbers ranging from 0-1>,
        },
        {
            "candidate": <candidate number based on context chunk>,
            "score": <floating-point numbers ranging from 0-1>,
        },
        {more object here depending on the total ${topCandidates.length} candidates}
    ]
}"
`

  // [DEBUG] show the reranking prompt
  // console.log(`rerankingResult: ${rerankingPrompt}`);

  let rerankingResult: RerankingResult[] = []
  let combinedCandidates: typeof topCandidates = topCandidates // Default to topCandidates

  try {
    // Verify the reranking model.
    const ollamaUrl = process.env.OLLAMA_URL
    const modelVerified = await verifyModel(ollamaUrl, rerankingModel)
    if (!modelVerified) {
      throw new Error('Failed to verify model.')
    }

    // Create an instance of the Ollama AI provider.
    const ollama = createOllama({ baseURL: `${ollamaUrl}/api` })
    console.log(`Reranking the context`)

    // Start timing the reranking process.
    const startTime = Date.now()

    // Generate the reranking result using the model.
    const { object, usage } = await generateObject({
      model: ollama(rerankingModel),
      mode: 'json',
      schema: rerankingSchema,
      prompt: rerankingPrompt,
      maxOutputTokens: tokenMax,
      providerOptions: {
        ollama: {
          mode: 'json',
          options: {
            numCtx: tokenMax, // 2048 tokens for context window
          },
        },
      },
    })

    // End timing and calculate the time taken.
    const endTime = Date.now()
    const timeTakenMs = endTime - startTime
    const timeTakenSeconds = timeTakenMs / 1000

    // Calculate token generation speed.
    const totalTokens = usage.outputTokens || 0
    const tokenGenerationSpeed = totalTokens / timeTakenSeconds

    console.log(
      `Usage tokens: ` +
        `promptEst(${effectiveTokenCountForText(rerankingPrompt)}) ` +
        `prompt(${usage.inputTokens}) ` +
        `completion(${usage.outputTokens}) | ` +
        `${tokenGenerationSpeed.toFixed(2)} t/s | ` +
        `Duration: ${timeTakenSeconds.toFixed(2)} s`,
    )

    // [DEBUG] show the generated output (output automatically sorted highest to low)
    // console.log(`ranking: ${JSON.stringify(object.ranking, null, 2)}`);

    // Extract candidate and score into a new array of objects.
    rerankingResult = object.ranking.map((item) => ({
      candidate: item.candidate,
      score: item.score,
    }))

    // Validate the rerank output.
    if (!Array.isArray(object.ranking) || object.ranking.length !== topCandidates.length) {
      throw new Error(`Invalid reranking output: ${object.ranking.length}/${topCandidates.length}`)
    }

    // Update topCandidates with the new similarity scores.
    combinedCandidates = topCandidates.map((candidate, index) => {
      // Use the index to find the corresponding ranking entry.
      const rankingEntry = rerankingResult.find((r) => r.candidate === index + 1)
      if (rankingEntry && rankingEntry.score !== undefined) {
        console.log(
          `DEBUG: index ${index + 1}, order: ${candidate.order}, sourceId: ${candidate.sourceId}, current similarity: ${candidate.similarity}, reranked score: ${rankingEntry.score}`,
        )
        return {
          ...candidate,
          similarity: (candidate.similarity + rankingEntry.score) / 2,
        }
      } else {
        console.log(`No matching ranking entry found for index ${index}`)
      }
      return candidate
    })
  } catch (error) {
    // Handle errors during the reranking process.
    console.log(`Error: ${error}`)
    if (APICallError.isInstance(error)) {
      console.log(`Error data: ${error.data}`)
      console.log(`Error message (APICallError): ${error}`)

      if (TypeValidationError.isInstance(error.cause)) {
        console.log(`Error cause: ${error.cause.message}`)
      }

      console.log(`Error message: ${error.message}`)
      console.log(`Error responseBody: ${error.responseBody}`)
      const errorResponse = JSON.parse(`${error.responseBody}`)

      if (errorResponse.message && typeof errorResponse.message.content === 'string') {
        try {
          errorResponse.message.content = JSON.parse(errorResponse.message.content)
        } catch (parseError) {
          console.log('Failed to parse content as JSON:', parseError)
        }
      } else {
        console.log('No valid JSON content to parse in errorResponse.message.content')
      }

      // [DEBUG] Show full error response of API Call Error
      const prettyErrorResponse = JSON.stringify(errorResponse, null, 2)
      console.log(prettyErrorResponse)
    } else if (NoObjectGeneratedError.isInstance(error)) {
      console.log('NoObjectGeneratedError')
      if (TypeValidationError.isInstance(error.cause)) {
        console.log(`cause message: ${error.cause.message}`)
      }
      console.log('Text:', error.text)
      console.log('Response:', error.response)
      console.log('Usage:', error.usage)
    }
  }

  // Final sort based on the combined score.
  combinedCandidates.sort((a, b) => b.similarity - a.similarity)

  // Select top candidate chunks for reranking.
  const topCombinedCandidates = combinedCandidates.slice(0, similarityTopK)

  // [DEBUG] Log the list of similarity scores and chunk orders.
  const similarityAfter = topCombinedCandidates.map((chunk) => ({
    similarity: chunk.similarity,
    order: chunk.order,
    sourceId: chunk.sourceId,
  }))
  console.log('DEBUG: Reranking (after):', similarityAfter)

  // Map the results to ContextChunk format and assign final ordering.
  return topCombinedCandidates.map((c) => ({
    chunk: c.chunk || '',
    similarity: c.similarity,
    sourceId: c.sourceId || 0,
    sourceType: c.sourceType,
    order: c.order || 0,
  }))
}
