import { createOllamaProvider } from './ollama-provider'
import { createOVMSProvider } from './ovms-provider'

export type AIProvider = 'ollama' | 'ovms'

// Provider metadata with dynamically configured provider instance
export async function getProviderInfo() {
  // To resolve cicular import issue
  const { getLLMConfig } = await import('@/lib/getLLMUrl')
  // Get the provider type and base URL from database configuration
  const config = await getLLMConfig()
  const providerName: AIProvider = config.providerType
  const providerUrl = config.llmURL

  const { provider, baseURL } =
    providerName === 'ovms' ? createOVMSProvider(providerUrl) : createOllamaProvider(providerUrl)

  console.log(
    `[getProviderInfo] providerName=${providerName}, providerUrl=${providerUrl}, formattedBaseURL=${baseURL}`,
  )

  return { providerName, provider, baseURL }
}
