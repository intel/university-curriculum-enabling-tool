// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProviderInfo } from '@/lib/providers'
import { getLLMUrl } from '@/lib/getLLMUrl'
import { getOVMSModelDetails } from '@/lib/ovms/ovms-models'
import { safeFetch } from '@/lib/ssrf-guard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { providerName, baseURL } = await getProviderInfo()

  if (providerName === 'ovms') {
    try {
      const configUrl = new URL('/v1/config', baseURL).href

      const res = await safeFetch(configUrl)

      if (!res.ok) {
        console.warn(`OVMS /v1/config returned status ${res.status}`)
        return Response.json({ models: [] })
      }

      const data = await res.json()
      const modelDetails = await getOVMSModelDetails(data)

      console.log(`Loaded ${modelDetails.length} models from OVMS /v1/config`)
      return Response.json({ models: modelDetails })
    } catch (error) {
      console.error('Error fetching OVMS models:', error)
      return Response.json({ models: [] })
    }
  } else {
    try {
      const ollamaUrl = await getLLMUrl()
      const tagsUrl = new URL('/api/tags', ollamaUrl).href

      const res = await safeFetch(tagsUrl)

      if (!res.ok) {
        console.error(`Ollama /api/tags returned status ${res.status}`)
        return Response.json({ models: [] })
      }

      return new Response(res.body, res)
    } catch (error) {
      console.error('Error fetching models:', error)
      return Response.json({ models: [] })
    }
  }
}