// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export interface ScoreChunkPairOptions {
  query: string
  passage: string
  id?: string
}

export interface ScoreChunkPairResult {
  id?: string
  score: number
}
