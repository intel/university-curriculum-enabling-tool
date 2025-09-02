// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useQuery } from '@tanstack/react-query'
import { ClientSource } from '../types/client-source'
import { Embedding } from '@/payload-types'

/**
 * Fetcher function for TanStack Query.
 *
 * This function fetches embeddings for the provided source IDs.
 *
 * @param sourceIds - Comma-separated list of source IDs.
 * @returns A promise that resolves to the embeddings data.
 */
const fetchEmbeddings = async (sourceIds: string): Promise<Embedding[]> => {
  const apiUrl = new URL(`/api/embeddings?where[source][in]=${sourceIds}`, window.location.origin)
    .href
  const response = await fetch(apiUrl, { credentials: 'include' })
  return response.json()
}

/**
 * Hook to fetch embeddings for selected sources.
 *
 * This hook uses TanStack Query to fetch embeddings for the provided selected sources.
 * It constructs a query string from the source IDs and fetches the embeddings
 * from the API.
 *
 * @param selectedSources - An array of selected sources to fetch embeddings for.
 * @returns An object containing the embeddings, loading state, and any error encountered.
 */
export function useEmbeddings(selectedSources: ClientSource[]) {
  const sourceIds = selectedSources.map((s) => s.id).join(',')

  const { data, error, isPending } = useQuery({
    queryKey: ['embeddings', sourceIds],
    queryFn: () => fetchEmbeddings(sourceIds),
    enabled: Boolean(sourceIds),
  })

  return {
    embeddings: data || [],
    isLoading: isPending,
    error,
  }
}
