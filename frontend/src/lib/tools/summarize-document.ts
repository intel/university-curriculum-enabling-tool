// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { tool, generateText } from 'ai'
import { getStoredEmbeddings } from '../embedding/get-stored-embeddings'
import { createOllama } from 'ollama-ai-provider'
import { verifyModel } from '../model/model-manager'

export const summarizeDocument = tool({
  description:
    'Summarizes the entire document by reconstructing it from all chunks (sorted by order). Only uses the provided data and does not infer beyond it.',
  parameters: z.object({
    selectedSources: z
      .string()
      .describe(
        'An array of selected sources consisting of source id (i.e. id: 2), source name, source type and source metadata object if provided.',
      ),
    query: z.string().optional().describe('Optional query to focus the summary.'),
    approach: z.enum(['bullet', 'narrative']).optional().default('narrative'),
    selectedModel: z.string().optional().default('llama3.1'),
  }),
  execute: async (args) => {
    const { selectedSources, query, approach, selectedModel } = args
    // Ensure the model exists before generating text.
    await verifyModel(selectedModel)

    const validJsonString = selectedSources
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/True/g, 'true') // Replace True with true
    const parsedData = JSON.parse(validJsonString)
    console.log('parsedData: ', parsedData)

    const embeddingChunks = await getStoredEmbeddings(parsedData)
    const fullDocument = embeddingChunks
      .sort((a, b) => a.order - b.order)
      .map((chunk) => chunk.chunk)
      .join('\n')
    let summaryPrompt = ''
    if (query) {
      summaryPrompt = `Using only the provided document content, summarize the following document with a focus on "${query}". Do not infer or add any information beyond what is provided. Structure the summary in a ${approach} format:\n\n${fullDocument}`
    } else {
      summaryPrompt = `Using only the provided document content, summarize the following document. Do not infer or add any information beyond what is provided. Structure the summary in a ${approach} format:\n\n${fullDocument}`
    }
    const ollamaUrl = process.env.OLLAMA_URL
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })
    const summary = await generateText({
      model: ollama(selectedModel),
      prompt: summaryPrompt,
    })
    return summary
  },
})
