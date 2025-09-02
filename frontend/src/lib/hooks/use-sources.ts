// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { useRef, useEffect } from 'react'
import type { ClientSource } from '@/lib/types/client-source'

interface SourcesResponse {
  data: ClientSource[]
}

/**
 * Fetcher function for TanStack Query.
 *
 * This function fetches data from the given URL and throws an error if the response is not OK.
 *
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the response is not OK.
 */
const fetchSources = async (): Promise<SourcesResponse> => {
  const sourcesResponseUrl = new URL(`/api/sources/list`, window.location.origin).href
  const response = await fetch(sourcesResponseUrl)
  if (!response.ok) {
    throw new Error('An error occurred while fetching the data.')
  }
  return response.json()
}

/**
 * Hook to fetch and manage sources.
 *
 * This hook uses TanStack Query to fetch sources from the API and manages them using a local store.
 * It updates the local store with the fetched sources and handles any errors encountered.
 *
 * @returns An object containing the sources, loading state, error state, and a refetch function.
 */
export function useSources() {
  const { setSources, sources: currentSources } = useSourcesStore()
  const prevSourcesRef = useRef<ClientSource[]>(currentSources)

  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
  })

  useEffect(() => {
    if (data && Array.isArray(data.data)) {
      const updatedSources = data.data.map((source: ClientSource) => ({
        ...source,
        selected: prevSourcesRef.current.find((s) => s.id === source.id)?.selected || false,
      }))
      setSources(updatedSources)
    } else if (data) {
      console.error('Received data is not an array:', data)
      toast.error('Received invalid data format from the server.')
    }
  }, [data, setSources])

  useEffect(() => {
    if (error) {
      console.error('Error fetching sources:', error)
      toast.error('Failed to fetch sources. Please try again later.')
    }
  }, [error])

  return {
    sources: currentSources || [],
    isLoading: isPending,
    isError: !!error,
    mutate: refetch,
  }
}
