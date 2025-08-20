// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import useSWR from 'swr'
import { ClientSource } from '../types/client-source'
import { Embedding } from '@/payload-types'

/**
 * Fetcher function for SWR.
 *
 * This function fetches data from the given URL with credentials included.
 *
 * @param url - The URL to fetch data from.
 * @returns A promise that resolves to the JSON response.
 */
const fetcher = (url: string) => {
  const apiUrl = new URL(url, window.location.origin).href
  return fetch(apiUrl, { credentials: 'include' }).then((res) => res.json())
}

/**
 * Hook to fetch embeddings for selected sources.
 *
 * This hook uses SWR to fetch embeddings for the provided selected sources.
 * It constructs a query string from the source IDs and fetches the embeddings
 * from the API.
 *
 * @param selectedSources - An array of selected sources to fetch embeddings for.
 * @returns An object containing the embeddings, loading state, and any error encountered.
 */
export function useEmbeddings(selectedSources: ClientSource[]) {
  const sourceIds = selectedSources.map((s) => s.id).join(',')

  // Use SWR to fetch embeddings
  const { data, error, isLoading } = useSWR<Embedding[]>(
    sourceIds ? `/api/embeddings?where[source][in]=${sourceIds}` : null,
    fetcher,
  )

  return {
    embeddings: data || [],
    isLoading,
    error,
  }
}
