// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Source } from '../../../../payload-types'

export type OllamaFn = ReturnType<typeof import('ollama-ai-provider-v2').createOllama>

export type ExtractedJson = {
  type?: string
  duration?: string
  description?: string
  questions?: unknown[]
}

export type GeneratedQuestion = { question: string; type: string } | string

export type AssessmentMetadata = {
  type: string
  duration: string
  description: string
}

export type ChunkWithSourceName = {
  id: number
  source: number | Source
  chunk: string
  order: number
  updatedAt: string
  createdAt: string
  sourceName?: string
}

export type DefaultCriteriaTemplate = {
  criteria: Array<{ name: string; weight: number; description: string }>
  markAllocation: Array<{ component: string; marks: number; description: string }>
}
