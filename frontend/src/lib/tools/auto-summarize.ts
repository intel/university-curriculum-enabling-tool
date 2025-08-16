import { z } from 'zod'
import { tool } from 'ai'
import { summarizeDocument } from './summarize-document'

export const autoSummarize = tool({
  description:
    'Automatically determines if full-document summarization is needed. If so, it uses the summarization flow without inferring beyond the provided data.',
  parameters: z.object({
    selectedSources: z
      .string()
      .describe(
        'An array of selected sources consisting of source id (i.e. id: 2), source name, source type and source metadata object if provided.',
      ),
    query: z.string().describe('User query to decide if summarization is required.'),
    selectedModel: z.string().optional().default('llama3.1'),
  }),
  async execute(args, options) {
    return await summarizeDocument.execute({ ...args, approach: 'narrative' }, options)
  },
})
