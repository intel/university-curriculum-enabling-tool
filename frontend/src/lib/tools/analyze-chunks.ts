// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { tool } from 'ai'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'

export const analyzeChunks = tool({
  description:
    'Analyzes stored chunk parameters and returns metrics such as average chunk size, total number of chunks, and the order range.',
  parameters: z.object({
    selectedSources: z.string().describe('An array of selected sources.'),
  }),
  execute: async ({ selectedSources }) => {
    console.log('selectedSources: ', selectedSources)
    const validJsonString = selectedSources
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/True/g, 'true') // Replace True with true
    const parsedData = JSON.parse(validJsonString)
    console.log('parsedData: ', parsedData)

    const embeddingChunks = await getStoredEmbeddings(parsedData)
    const numberOfChunks = embeddingChunks.length
    const totalLength = embeddingChunks.reduce((sum, chunk) => sum + chunk.chunk.length, 0)
    const avgChunkSize = numberOfChunks ? totalLength / numberOfChunks : 0
    const orders = embeddingChunks.map((chunk) => chunk.order)
    const minOrder = Math.min(...orders)
    const maxOrder = Math.max(...orders)
    return JSON.stringify({ numberOfChunks, avgChunkSize, minOrder, maxOrder }, null, 2)
  },
})
