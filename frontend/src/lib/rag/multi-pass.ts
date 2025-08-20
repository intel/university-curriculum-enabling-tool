// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { ContextChunk } from '../types/context-chunk'
import { CoreMessage } from 'ai'
import { effectiveTokenCountForText } from '@/lib/utils'
import {
  SystemPromptGenerator,
  UserPromptGenerator,
  ContentProcessor,
  MultiPassState,
  MultiPassOptions,
  ProcessResult,
  GenerationFunction,
} from '../types/multi-pass-types'

// Re-export these types so they can be imported from this file
export type {
  SystemPromptGenerator,
  UserPromptGenerator,
  ContentProcessor,
  MultiPassState,
  MultiPassOptions,
  ProcessResult,
  GenerationFunction,
}

const DEFAULT_OPTIONS: MultiPassOptions = {
  tokenBudget: 1024,
  responseBudget: 1024,
  batchSize: 3,
  preserveOrder: true,
  temperature: 0.7,
  overlapChunks: 1,
}

/**
 * Process chunks for content generation using multi-pass approach
 *
 * This modular function takes generator functions defined in route.ts files
 * to customize the content generation while handling the chunking process
 */
export async function processChunksMultiPass<TContent = Record<string, unknown>>(
  query: string,
  chunks: ContextChunk[],
  generateFn: GenerationFunction<TContent>,
  modelProvider: unknown,
  options: Partial<MultiPassOptions> = {},
  contentType: string,
  systemPromptGenerator: SystemPromptGenerator,
  userPromptGenerator: UserPromptGenerator,
  contentProcessor: ContentProcessor<TContent, TContent>,
  state?: MultiPassState<TContent>,
): Promise<ProcessResult<TContent>> {
  const startTime = Date.now()
  const config = { ...DEFAULT_OPTIONS, ...options }

  // Initialize state if not provided
  if (!state) {
    // Sort chunks if preserveOrder is true, otherwise use as provided
    const sortedChunks = config.preserveOrder
      ? [...chunks].sort((a, b) => a.order - b.order)
      : chunks

    state = {
      chunks: sortedChunks,
      processedChunkIds: [],
      currentIndex: 0,
      isComplete: false,
      generatedContent: [],
      progress: 0,
      contentType,
    }
  }

  // Check if we've processed all chunks
  if (state.currentIndex >= state.chunks.length) {
    state.isComplete = true
    return {
      result: (state.lastGenerated ||
        state.generatedContent[state.generatedContent.length - 1] ||
        ({} as TContent)) as TContent,
      state,
      debug: {
        chunksProcessed: state.processedChunkIds.length,
        totalChunks: state.chunks.length,
        remainingChunks: 0,
        tokenUsage: { prompt: 0 },
        timeTaken: 0,
      },
    }
  }

  // Determine if this is the first pass
  const isFirstPass = state.generatedContent.length === 0

  // Generate prompts using the provided generator functions
  const systemPrompt = systemPromptGenerator(isFirstPass, query, config)
  const userPrompt = userPromptGenerator(query, config)

  // Calculate token budget for fixed messages
  let usedTokens = effectiveTokenCountForText(systemPrompt) + effectiveTokenCountForText(userPrompt)

  // Select batch of chunks for this pass
  const selectedChunks: ContextChunk[] = []
  let chunkContent = ''
  let chunksAdded = 0
  let newIndex = state.currentIndex

  // Add chunks until we hit the token budget or batch size
  for (
    let i = state.currentIndex;
    i < state.chunks.length && chunksAdded < config.batchSize && usedTokens < config.tokenBudget;
    i++
  ) {
    const chunk = state.chunks[i]
    const chunkId = `${chunk.sourceId}-${chunk.order}`

    // Skip already processed chunks
    if (state.processedChunkIds.includes(chunkId)) {
      newIndex = i + 1
      continue
    }

    const chunkTokens = effectiveTokenCountForText(chunk.chunk)

    // Check if adding this chunk would exceed token budget
    if (usedTokens + chunkTokens <= config.tokenBudget) {
      chunkContent += `\n\n${chunk.chunk}`
      selectedChunks.push(chunk)
      usedTokens += chunkTokens
      chunksAdded++
      newIndex = i + 1
    } else {
      break
    }
  }

  // Handle empty selection (could happen if chunks are too large)
  if (chunksAdded === 0 && state.currentIndex < state.chunks.length) {
    // Include at least one chunk even if it exceeds the token budget
    const chunk = state.chunks[state.currentIndex]
    chunkContent = `\n\n${chunk.chunk}`
    selectedChunks.push(chunk)
    newIndex = state.currentIndex + 1
    usedTokens += effectiveTokenCountForText(chunk.chunk)
  }

  // Check if we're done after this pass
  const willBeComplete = newIndex >= state.chunks.length

  // Prepare messages
  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: userPrompt,
  }

  // The assistant message contains the chunks as context
  const assistantContent = chunkContent || 'No relevant knowledge found.'
  const assistantMessage: CoreMessage = {
    role: 'assistant',
    content: assistantContent,
  }

  // If not the first pass, include previous content for context
  const messages: CoreMessage[] = [systemMessage]

  if (!isFirstPass && config.overlapChunks && state.lastGenerated) {
    // Add previous content for context
    messages.push({
      role: 'user',
      content: "Here is the content you've already generated:",
    })

    messages.push({
      role: 'assistant',
      content: JSON.stringify(state.lastGenerated),
    })
  }

  // Add the main messages
  messages.push(assistantMessage, userMessage)

  // Log debug info
  console.log(
    `Multi-pass #${state.generatedContent.length + 1} | ${contentType} | ` +
      `Processing chunks ${state.currentIndex + 1}-${newIndex} of ${state.chunks.length} | ` +
      `Token usage: ${usedTokens}/${config.tokenBudget} | ` +
      `${willBeComplete ? 'FINAL PASS' : 'More passes available'}`,
  )

  try {
    // Generate content using the provided function
    const startGenTime = Date.now()
    const { object: rawResult, usage } = await generateFn({
      model: modelProvider,
      output: 'no-schema',
      messages: messages,
      temperature: config.temperature,
      maxTokens: config.responseBudget,
    })

    // Process the result using the provided processor
    const processedResult = contentProcessor(rawResult, state.generatedContent)

    const genTimeTaken = (Date.now() - startGenTime) / 1000
    console.log(`Generation completed in ${genTimeTaken.toFixed(2)}s`)

    // Update the state with new processed chunks
    const newProcessedIds = [
      ...state.processedChunkIds,
      ...selectedChunks.map((chunk) => `${chunk.sourceId}-${chunk.order}`),
    ]

    // Calculate progress percentage
    const progress = Math.min(100, Math.round((newIndex / state.chunks.length) * 100))

    // Update state
    const updatedState: MultiPassState<TContent> = {
      ...state,
      currentIndex: newIndex,
      processedChunkIds: newProcessedIds,
      generatedContent: [...state.generatedContent, processedResult],
      lastGenerated: processedResult,
      progress,
      isComplete: willBeComplete,
    }

    const timeTaken = (Date.now() - startTime) / 1000

    // Return the result and updated state
    return {
      result: processedResult,
      state: updatedState,
      debug: {
        chunksProcessed: selectedChunks.length,
        totalChunks: state.chunks.length,
        remainingChunks: state.chunks.length - newIndex,
        tokenUsage: {
          prompt: usedTokens,
          completion: usage?.completionTokens,
          total: usage?.totalTokens,
        },
        timeTaken,
      },
    }
  } catch (error) {
    console.error(`Error in multi-pass processing:`, error)
    throw error
  }
}

/**
 * Check if more content can be generated
 */
export function canGenerateMore<TContent = Record<string, unknown>>(
  state: MultiPassState<TContent>,
): boolean {
  return !state.isComplete
}
