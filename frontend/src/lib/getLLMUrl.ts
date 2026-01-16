// src/lib/getLLMUrl.ts
import { getPayload } from 'payload'
import config from '@payload-config'

// Note: server-only import removed to support migrations and build processes
// This module should still only be used server-side (API routes, Server Components)

let cachedUrl: string | null = null
let cachedProvider: string | null = null

export type LLMConfig = {
  providerType: 'ollama' | 'ovms'
  llmURL: string
}

/**
 * Clear the cached LLM configuration.
 * Call this after updating the LLM configuration to force a refresh.
 */
export function clearLLMUrlCache(): void {
  cachedUrl = null
  cachedProvider = null
  console.log('LLM configuration cache cleared')
}

/**
 * Refresh the LLM configuration by clearing cache and fetching fresh data.
 * @returns The updated LLM configuration
 */
export async function refreshLLMConfig(): Promise<LLMConfig> {
  clearLLMUrlCache()
  return await getLLMConfig()
}

/**
 * Refresh the LLM URL by clearing cache and fetching fresh data.
 * @returns The updated LLM URL
 * @deprecated Use refreshLLMConfig() instead
 */
export async function refreshLLMUrl(): Promise<string> {
  const config = await refreshLLMConfig()
  return config.llmURL
}

/**
 * Get the full LLM configuration from Payload CMS global config.
 * Uses in-memory caching for performance.
 * @returns The configured LLM settings with provider type and URL
 */
export async function getLLMConfig(): Promise<LLMConfig> {
  if (cachedUrl && cachedProvider) {
    return { providerType: cachedProvider as 'ollama' | 'ovms', llmURL: cachedUrl }
  }

  try {
    const payload = await getPayload({ config })
    const global = await payload.findGlobal({
      slug: 'llm-config',
    })
    if (!global.llmURL || !global.providerType) {
      console.error('[getLLMConfig] ERROR: Database NOT initialized!', {
        llmURL: global.llmURL,
        providerType: global.providerType,
        fullGlobal: global,
      })
      throw new Error(
        `Database llm-config is not initialized. llmURL=${global.llmURL}, providerType=${global.providerType}`,
      )
    }

    cachedUrl = global.llmURL.trim()
    cachedProvider = global.providerType
    console.log('[getLLMConfig] SUCCESS: Loaded from database:', {
      providerType: cachedProvider,
      llmURL: cachedUrl,
    })
  } catch (error) {
    console.error('[getLLMConfig] FATAL ERROR reading LLM configuration:', error)
    throw error
  }

  return { providerType: cachedProvider as 'ollama' | 'ovms', llmURL: cachedUrl }
}

/**
 * Get the LLM URL from Payload CMS global config.
 * Uses in-memory caching for performance.
 * @returns The configured LLM URL or default 'http://localhost:5950'
 */
export async function getLLMUrl(): Promise<string> {
  const config = await getLLMConfig()
  return config.llmURL
}
