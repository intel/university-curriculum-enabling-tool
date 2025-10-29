// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { ASSESSMENT_DEBUG_LOGS } from '../config/constants'

let wordSegmenter: Intl.Segmenter | undefined

const getWordSegmenter = () => {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return undefined
  if (!wordSegmenter) {
    wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  }
  return wordSegmenter
}

// Utility function for conditional debug logging related to assessment workflows
export const logAssessmentDebug = (...args: unknown[]) => {
  if (!ASSESSMENT_DEBUG_LOGS) return
  console.debug('[assessment]', ...args)
}

// Utility function to count tokens (word-like segments with fallbacks for languages without whitespace)
export function countTokens(text: string): number {
  if (!text) return 0

  const normalized = text.normalize('NFKC')
  let segmenterCount = 0
  const segmenter = getWordSegmenter()
  if (segmenter) {
    for (const segment of segmenter.segment(normalized)) {
      if (segment.isWordLike) segmenterCount += 1
    }
  }

  const whitespaceTokens = normalized.trim() ? normalized.trim().split(/\s+/).length : 0
  const charEstimate = Math.ceil(normalized.length / 4)
  const estimate = Math.max(segmenterCount, whitespaceTokens, charEstimate)

  return estimate > 0 ? estimate : 1
}

// Utility function to truncate text to fit within token limit
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) {
    return text
  }

  const segmenter = getWordSegmenter()
  if (segmenter) {
    let tokenCount = 0
    const pieces: string[] = []
    for (const segment of segmenter.segment(text)) {
      const piece = segment.segment
      if (segment.isWordLike) {
        if (tokenCount + 1 > maxTokens) break
        tokenCount += 1
      }
      pieces.push(piece)
    }
    const truncated = pieces.join('').trimEnd()
    return truncated === text ? truncated : `${truncated}...`
  }

  // Fallback: whitespace-based splitting
  const words = text.split(/\s+/)
  const builder: string[] = []
  let currentTokens = 0
  for (const word of words) {
    if (!word) continue
    const estimated = Math.max(1, Math.ceil(word.length / 4))
    if (currentTokens + estimated > maxTokens) break
    builder.push(word)
    currentTokens += estimated
  }

  return builder.join(' ').trimEnd() + '...'
}

// Helper: wrap a promise with a timeout
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => T | Promise<T>,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined
  return await Promise.race<Promise<T> | T>([
    promise,
    new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        if (onTimeout) {
          try {
            const fallback = await onTimeout()
            resolve(fallback)
          } catch (err) {
            reject(err ?? new Error('onTimeout threw an error'))
          }
        } else {
          reject(new Error('Operation timed out'))
        }
      }, ms)
    }),
  ]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  })
}

// Helper: process an array with limited concurrency, preserving order
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers: Promise<void>[] = []

  const worker = async () => {
    while (true) {
      const current = nextIndex++
      if (current >= items.length) break
      try {
        results[current] = await mapper(items[current], current)
      } catch (e) {
        // In case of unexpected error, rethrow after annotation
        console.error('Error in mapWithConcurrency worker:', e)
        throw e
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

// Helper: strip markdown code fences (```json ... ``` or ``` ... ```)
export function stripCodeFences(text: string): string {
  if (!text) return text
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i
  const match = text.match(fenceRegex)
  return match ? match[1].trim() : text.replace(/```json|```/g, '').trim()
}

// Helper: strip <think>...</think> sections before parsing or sending to frontend
export function stripThinkTags(text: string): string {
  if (!text) return text
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // remove enclosed content
    .replace(/<\/?think>/gi, '') // safety: stray tags
    .trim()
}

// Regex pattern to match horizontal rules (lines of === or --- characters)
export const HORIZONTAL_RULE_PATTERN = /^[ \t]*[=\-]{3,}\s*$/gm

// Helper: strip horizontal rule lines (=== or ---)
export function stripHorizontalRules(text: string): string {
  if (!text) return text
  return text.replace(HORIZONTAL_RULE_PATTERN, '').trim()
}
