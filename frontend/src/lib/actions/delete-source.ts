// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import useSWRMutation from 'swr/mutation'

/**
 * Fetcher function for deleting a source.
 *
 * @param url - The API endpoint URL for deleting the source.
 * @returns A promise that resolves to the response data.
 * @throws An error if the deletion fails.
 */
async function deleteSourceFetcher(url: string): Promise<{ success: boolean; message?: string }> {
  const deleteSourceFetcherUrl = new URL(url, window.location.origin).href
  const response = await fetch(deleteSourceFetcherUrl, { method: 'DELETE' })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to delete source'
    return Promise.reject(new Error(errorMessage))
  }
  return response.json()
}

/**
 * Custom hook for deleting sources.
 *
 * @returns An object containing functions to delete a source by ID or delete selected sources.
 */
export function useDeleteSource() {
  const { deleteSource } = useSourcesStore.getState()

  // Use useSWRMutation with the correct types
  const { trigger } = useSWRMutation('/api/sources', (url, { arg: id }: { arg: string }) =>
    deleteSourceFetcher(`${url}/${id}`),
  )

  /**
   * Deletes a source by its ID.
   *
   * @param id - The ID of the source to delete.
   */
  const deleteSourceById = async (id: number) => {
    try {
      // Trigger the mutation with the source ID
      await trigger(id.toString())

      deleteSource(id)
      toast.success(`Source ID #${id} deleted successfully.`)
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${error.data}`)
      } else {
        toast.error(`Failed to delete source ID #${id}`)
      }
    }
  }

  /**
   * Deletes multiple selected sources by their IDs.
   *
   * @param selectedIds - An array of IDs of the sources to delete.
   */
  const deleteSelectedSources = async (selectedIds: number[]) => {
    for (const id of selectedIds) {
      await deleteSourceById(id)
    }
  }

  return { deleteSourceById, deleteSelectedSources }
}
