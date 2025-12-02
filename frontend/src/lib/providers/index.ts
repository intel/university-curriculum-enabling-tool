import { ollama } from './ollama-provider'
import { ovms } from './ovms-provider'

let providerInfoLogged = false

export type AIService = 'ollama' | 'ovms'

// Return configured service (NEXT_PUBLIC_SERVICE or PROVIDER). Default 'ollama'.
export function getAIService(): AIService {
  const service = (process.env.NEXT_PUBLIC_SERVICE || process.env.PROVIDER)?.toLowerCase()
  return service === 'ovms' ? 'ovms' : 'ollama'
}

// Log provider info once for diagnostics
function logProviderInfo() {
  if (providerInfoLogged) return
  providerInfoLogged = true
  const info = getProviderInfo()
  console.log('[AI Provider] ', info.service.toUpperCase(), info.baseURL)
}

// Return the provider implementation based on PROVIDER
export function getProvider() {
  logProviderInfo()
  return getAIService() === 'ovms' ? ovms : ollama
}

// Get provider by explicit service name
export function getProviderByService(service: AIService) {
  return service === 'ovms' ? ovms : ollama
}

// Return service metadata (service, provider instance, base URL)
export function getProviderInfo() {
  const service = getAIService()
  const provider = getProvider()
  let baseURL = ''
  if (service === 'ovms') {
    const ovmsUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
    baseURL = ovmsUrl.endsWith('/v3') ? ovmsUrl : `${ovmsUrl}/v3`
  } else {
    const ollamaUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
    baseURL = ollamaUrl.endsWith('/v1') ? ollamaUrl : `${ollamaUrl}/v1`
  }

  return { service, provider, baseURL }
}

export { ollama } from './ollama-provider'
export { ovms } from './ovms-provider'
