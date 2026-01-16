// payload.config.ts or collections/Globals.ts
import { GlobalConfig } from 'payload'

// Read from environment variables, with fallbacks to sensible defaults
const defaultProviderType = (process.env.PROVIDER || 'ovms') as 'ovms' | 'ollama'
const defaultProviderURL = process.env.PROVIDER_URL || 'http://localhost:5950'

export const LLMConfig: GlobalConfig = {
  slug: 'llm-config',
  label: 'LLM Configuration',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [
      async ({ doc }) => {
        console.log('[llm-config] Configuration updated in database:', {
          providerType: doc.providerType,
          llmURL: doc.llmURL,
        })
      },
    ],
  },
  fields: [
    {
      name: 'providerType',
      type: 'select',
      label: 'Provider Type',
      defaultValue: defaultProviderType,
      options: [
        { label: 'OpenVINO Model Server (OVMS)', value: 'ovms' },
        { label: 'Ollama', value: 'ollama' },
      ],
      admin: {
        description: 'Select the type of LLM server you are connecting to',
      },
    },
    {
      name: 'llmURL',
      type: 'text',
      label: 'LLM Server URL',
      defaultValue: defaultProviderURL,
      admin: {
        description:
          'Base URL for Ollama or OpenVINO Model Server (OVMS) API (e.g. http://localhost:5950)',
      },
    },
  ],
}
