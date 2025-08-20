// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import useSWR from 'swr'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import type { ClientSource } from '@/lib/types/client-source'

interface SourcesResponse {
  data: ClientSource[]
}

/**
 * Fetcher function for SWR.
 *
 * This function fetches data from the given URL and throws an error if the response is not OK.
 *
 * @param url - The URL to fetch data from.
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the response is not OK.
 */
const fetcher = async (url: string) => {
  const sourcesResponseUrl = new URL(url, window.location.origin).href
  const response = await fetch(sourcesResponseUrl)
  if (!response.ok) {
    throw new Error('An error occurred while fetching the data.')
  }
  return response.json()
}

/**
 * Hook to fetch and manage sources.
 *
 * This hook uses SWR to fetch sources from the API and manages them using a local store.
 * It updates the local store with the fetched sources and handles any errors encountered.
 *
 * @returns An object containing the sources, loading state, error state, and a mutate function.
 */
export function useSources() {
  const { setSources, sources: currentSources } = useSourcesStore()
  const { error, isLoading, mutate } = useSWR<SourcesResponse>('/api/sources/list', fetcher, {
    onSuccess: (response) => {
      if (response && Array.isArray(response.data)) {
        const updatedSources = response.data.map((source: ClientSource) => ({
          ...source,
          selected: currentSources.find((s) => s.id === source.id)?.selected || false,
        }))
        setSources(updatedSources)
      } else {
        console.error('Received data is not an array:', response)
        toast.error('Received invalid data format from the server.')
      }
    },
    onError: (err) => {
      console.error('Error fetching sources:', err)
      toast.error('Failed to fetch sources. Please try again later.')
    },
  })

  return {
    sources: currentSources,
    isLoading,
    isError: error,
    mutate,
  }
}
