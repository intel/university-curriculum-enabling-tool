// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { getProviderInfo } from '@/lib/providers'
import { getOVMSModelDetails } from '@/lib/ovms/ovms-models'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { service, baseURL } = getProviderInfo()

  if (service === 'ovms') {
    try {
      // OVMS /v3/models endpoint returns 400 "Invalid request URL"
      // This endpoint may only work with specific OVMS configurations
      // Instead, use the /v1/config endpoint which lists all loaded models
      const configUrl = new URL('/v1/config', baseURL).href
      const res = await fetch(configUrl)

      if (!res.ok) {
        console.warn(`OVMS /v1/config returned status ${res.status}`)
        return Response.json({ models: [] })
      }

      const data = await res.json()

      // Get detailed model information from the filesystem
      const modelDetails = await getOVMSModelDetails(data)

      console.log(`Loaded ${modelDetails.length} models from OVMS /v1/config`)
      return Response.json({ models: modelDetails })
    } catch (error) {
      console.error('Error fetching OVMS models:', error)
      return Response.json({ models: [] })
    }
  } else {
    try {
      const ollamaUrl = process.env.PROVIDER_URL || 'http://localhost:5950'
      const tagsUrl = new URL('/api/tags', ollamaUrl).href
      const res = await fetch(tagsUrl)
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
