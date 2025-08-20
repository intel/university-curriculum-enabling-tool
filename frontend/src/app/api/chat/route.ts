// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { streamText, convertToCoreMessages, CoreMessage, TextPart } from 'ai'
import { errorHandler } from '@/lib/handler/error-handler'
import { retrieveContextByEmbedding } from '@/lib/assistant/retrieve-context-by-embedding'
import { effectiveTokenCountForText } from '@/lib/utils'
import { getMostRelevantImage } from '@/lib/embedding/get-most-relevant-image'
import { getPayload } from 'payload'
import config from '@payload-config'

// export const runtime = "edge";
export const dynamic = 'force-dynamic'

// Default values
const TEMPERATURE = parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOP_K = parseInt(process.env.RAG_CONTEXT_SIMILARITY_TOP_K ?? '5')
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_CONTEXT_SIMILARITY_THRESHOLD || '0.7')
const TOKEN_MAX = parseInt(process.env.RAG_TOKEN_MAX ?? '1024')
const TOKEN_RESPONSE_RATIO = parseFloat(process.env.RAG_TOKEN_RESPONSE_RATIO || '0.6')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = TOKEN_MAX - TOKEN_RESPONSE_BUDGET

/**
 * Handles POST requests to the API route.
 *
 * This function processes incoming requests, retrieves relevant context
 * based on the user query, and streams an AI-generated response using
 * the Ollama provider.
 *
 * @param req - The incoming request object.
 * @returns A promise that resolves to a response object.
 */
export async function POST(req: Request) {
  const { messages, selectedModel, selectedSources } = await req.json()
  console.log('DEBUG: CHAT API selectedModel:', selectedModel)

  // Prepare: Ollama provider
  const ollamaUrl = process.env.OLLAMA_URL
  if (!ollamaUrl) {
    throw new Error('OLLAMA_URL is not defined in environment variables.')
  }
  const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

  // Prepare: Calculate the total number of selected sources
  // const totalSelectedSources = selectedSources.filter(
  //   (source: ClientSource) => source.selected
  // ).length
  // console.log("Total Size of Selected Sources:", totalSelectedSources)

  console.log(`DEBUG: Similarity threshold: ${SIMILARITY_THRESHOLD}`)
  console.log(`DEBUG: topK: ${TOP_K}`)
  console.log(`DEBUG: TOKEN_MAX: ${TOKEN_MAX}`)
  console.log(`DEBUG: TOKEN_RESPONSE_RATIO: ${TOKEN_RESPONSE_RATIO}`)

  // Step 1: Convert to coreMessages
  // console.log('DEBUG: messages:', messages);
  const coreMessages: CoreMessage[] = convertToCoreMessages(messages)

  // Step 2: Extract the latest user query
  const latestMessage = coreMessages[coreMessages.length - 1]
  let latestQuery = ''
  if (Array.isArray(latestMessage?.content)) {
    latestQuery =
      latestMessage.content.find((part): part is TextPart => part.type === 'text')?.text || ''
  } else {
    latestQuery = ''
  }

  // Step 2.5: Check if any sources are selected and valid
  const hasSelectedSources =
    Array.isArray(selectedSources) &&
    selectedSources.length > 0 &&
    selectedSources.every(
      (source) => source && typeof source === 'object' && 'id' in source && 'name' in source,
    )

  // Step 3: Find the most relevant image (only if sources are selected)
  let mostRelevantImageMarkdown = ''
  if (hasSelectedSources) {
    try {
      const mostRelevantImage = await getMostRelevantImage(latestQuery, selectedSources)
      const payload = await getPayload({ config })
      if (mostRelevantImage) {
        const mediaData = await payload.find({
          collection: 'media',
          where: {
            filename: {
              equals: mostRelevantImage.filename,
            },
          },
        })

        if (mediaData.docs && mediaData.docs.length > 0) {
          const media = mediaData.docs[0]
          const imageUrl = `/api/media/file/${media.filename}`
          mostRelevantImageMarkdown = `![${media.filename}](${imageUrl})`
          console.log('DEBUG: Most relevant image markdown:', mostRelevantImageMarkdown)
        } else {
          console.log('DEBUG: No media found for the query.')
        }
      } else {
        console.log('DEBUG: No relevant image found.')
      }
    } catch (error) {
      console.error('Error finding the most relevant image:', error)
    }
  }

  const systemPrompt = `
You are a knowledgeable and reliable AI chat assistant.
Always reply in English.
General Guidelines:
Use ONLY the information provided below for your responses.
If a list of items is required, show the number of items instead of bullets.
Do NOT infer or generate information beyond the given data.
If relevant context is provided, make it clear that your response is based on that information.
If no context is available, respond with:
"I don't have enough information to answer that question."
However, when possible, also provide something related to the query to keep the response helpful and natural.
If the user wants more details, ask if they'd like to explore the topic further.
Ensure that your answer is strictly based on the provided knowledge and, when appropriate, reference specific parts of it.
${
  mostRelevantImageMarkdown
    ? `Always include this relevant image query markdown: ${mostRelevantImageMarkdown} in your response.
Position the image markdown: ${mostRelevantImageMarkdown} appropriately within your answer to enhance clarity and relevance.
Avoid using HTML image tags such as <img> in your response.
If the query specifically asks for a visual representation, prioritize including the image markdown early in your response.`
    : ''
}
`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  // Token count estimation
  let usedTokens =
    effectiveTokenCountForText(systemPrompt) + effectiveTokenCountForText(latestQuery)
  let chunkContent = ''
  let chunksAdded = 0
  let assistantContent = ''

  // Step 4: Retrieve and filter knowledge chunks
  try {
    // Retrieves context based on user query embedding and stored embeddings.
    const retrievedChunks = await retrieveContextByEmbedding(latestQuery, selectedSources, TOP_K)
    console.log('DEBUG: retrievedChunks total:', retrievedChunks.length)

    // Log similarity and order info for debugging
    const similarityAndOrderList = retrievedChunks.map((chunk) => ({
      similarity: chunk.similarity,
      order: chunk.order,
      sourceId: chunk.sourceId,
    }))
    console.log('DEBUG: Similarity and Order List:', similarityAndOrderList)

    // Loop through retrieved chunks, summing effective token counts.
    for (const chunk of retrievedChunks) {
      const chunkTokenCount = effectiveTokenCountForText(chunk.chunk)
      // console.log(
      //   `DEBUG: chat API chunk token ${chunk.order}/${retrievedChunks.length} effective count:`,
      //   chunkTokenCount
      // );
      if (usedTokens + chunkTokenCount <= TOKEN_CONTEXT_BUDGET) {
        chunkContent += `\n\n${chunk.chunk}`
        usedTokens += chunkTokenCount
        chunksAdded++
      } else {
        break // Stop adding chunks if exceeding token budget
      }
    }
    //" I should always return this in my answer : " + imageresult.text + ". Chunk content start here : " +
    assistantContent = chunkContent || 'No relevant knowledge found.'
    console.log(
      `Total Chunks: ${chunksAdded}/${retrievedChunks.length} | ` +
        `Prompt tokens: ` +
        `system(${effectiveTokenCountForText(systemMessage.content.toString())}) ` +
        `user(${effectiveTokenCountForText(latestQuery)}) ` +
        `assistant(${effectiveTokenCountForText(assistantContent)}) | ` +
        `Budget tokens: ` +
        `context(${TOKEN_CONTEXT_BUDGET}) ` +
        `response(${TOKEN_RESPONSE_BUDGET}) ` +
        `max(${TOKEN_MAX})`,
    )
  } catch (error) {
    console.error('Error retrieving knowledge:', error)
    assistantContent = 'An error occurred while retrieving knowledge.'
  }

  const assistantMessage: CoreMessage = {
    role: 'assistant',
    content: assistantContent,
  }

  // Step 5: Prepare full messages
  const fullMessages = [systemMessage, assistantMessage, ...coreMessages]
  console.log('DEBUG: latestQuery:', latestQuery)
  // console.log('DEBUG: fullMessages:', fullMessages);
  // console.log('DEBUG: selectedSources:', selectedSources);

  // Step 6: Stream AI response using Ollama
  const startTime = Date.now()
  const result = await streamText({
    model: ollama(selectedModel, { numCtx: TOKEN_RESPONSE_BUDGET }),
    messages: fullMessages,
    temperature: TEMPERATURE,
    maxTokens: TOKEN_RESPONSE_BUDGET,
    onError: (error) => {
      console.error(error)
    },
    onFinish({ usage }) {
      // End timing and calculate the time taken.
      const endTime = Date.now()
      const timeTakenMs = endTime - startTime
      const timeTakenSeconds = timeTakenMs / 1000

      // Calculate token generation speed.
      const totalTokens = usage.completionTokens
      const tokenGenerationSpeed = totalTokens / timeTakenSeconds

      console.log(
        `Usage tokens: ` +
          `promptEst(${usedTokens}) ` +
          `prompt(${usage.promptTokens}) ` +
          `completion(${usage.completionTokens}) | ` +
          `${tokenGenerationSpeed.toFixed(2)} t/s | ` +
          `Duration: ${timeTakenSeconds.toFixed(2)} s`,
      )
      // console.log('DEBUBG: Response text:', text);
    },
  })

  return result.toDataStreamResponse({
    getErrorMessage: errorHandler,
  })
}
