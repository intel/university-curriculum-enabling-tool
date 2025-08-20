// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { ContextChunk } from './context-chunk'

// Very flexible generation function type that can accommodate various AI library signatures
export type GenerationFunction<TResult = Record<string, unknown>> = (
  options: Record<string, unknown>,
) => Promise<{
  object: TResult
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}>

// Configuration options for multi-pass processing
export interface MultiPassOptions {
  tokenBudget: number // Max tokens per generation pass
  responseBudget: number // Max tokens for LLM response
  batchSize: number // Default number of chunks per batch
  preserveOrder: boolean // Whether to maintain document order
  temperature: number // LLM temperature setting
  overlapChunks?: number // How many chunks to overlap between passes
  [key: string]: unknown // Additional options specific to content type
}

/**
 * Function that generates system prompts for multi-pass content generation
 */
export type SystemPromptGenerator = (
  isFirstPass: boolean,
  query: string,
  options: MultiPassOptions,
) => string

/**
 * Function that generates user prompts for multi-pass content generation
 */
export type UserPromptGenerator = (query: string, options: MultiPassOptions) => string

/**
 * Function that processes and normalizes LLM output
 */
export type ContentProcessor<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>,
> = (result: TInput, previousResults: TOutput[]) => TOutput

/**
 * State for tracking multi-pass content generation
 */
export interface MultiPassState<TContent = Record<string, unknown>> {
  chunks: ContextChunk[] // All available chunks
  processedChunkIds: string[] // IDs of chunks already processed
  currentIndex: number // Current position in chunk array
  isComplete: boolean // Whether all chunks have been processed
  generatedContent: TContent[] // Content generated in each pass
  progress: number // Progress as percentage (0-100)
  lastGenerated?: TContent // Last batch of generated content
  contentType: string // Type of content (faq, quiz, etc)
}

/**
 * Result of multi-pass processing
 */
export interface ProcessResult<TContent = Record<string, unknown>> {
  result: TContent // Generated content
  state: MultiPassState<TContent> // Updated state
  debug: {
    chunksProcessed: number
    totalChunks: number
    remainingChunks: number
    tokenUsage: {
      prompt: number
      completion?: number
      total?: number
    }
    timeTaken: number
  }
}
