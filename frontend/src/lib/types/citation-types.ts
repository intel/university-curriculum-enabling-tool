// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export type CitationReference = {
  chunk: string
  chunkIndex: number
  sourceId: string
  order: number
  highlightedSentences?: string[]
}

export type Citation =
  | { type: 'heading-title'; content: string }
  | { type: 'heading'; content: string; level: number }
  | { type: 'paragraph'; content: string; references?: CitationReference[] }
  | {
      type: 'list'
      items: string[]
      ordered?: boolean
      references?: CitationReference[]
      content: string
    }
