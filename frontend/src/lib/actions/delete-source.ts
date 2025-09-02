// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deleteSourceFetcher(id: string): Promise<{ success: boolean; message?: string }> {
  const deleteSourceFetcherUrl = new URL(`/api/sources/${id}`, window.location.origin).href
  const response = await fetch(deleteSourceFetcherUrl, { method: 'DELETE' })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to delete source'
    throw new Error(errorMessage)
  }
  return response.json()
}

export function useDeleteSource() {
  const { deleteSource } = useSourcesStore.getState()
  const queryClient = useQueryClient()

  // Use useMutation with query client for better cache management
  const mutation = useMutation({
    mutationFn: deleteSourceFetcher,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['embeddings'] })
      deleteSource(Number(id))
      toast.success(`Source ID #${id} deleted successfully.`)
    },
    onError: (error, id) => {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${(error as { data: string }).data}`)
      } else {
        toast.error(`Failed to delete source ID #${id}`)
      }
    },
  })

  const deleteSourceById = async (id: number) => {
    try {
      await mutation.mutateAsync(id.toString())
    } catch (error) {
      // Error is already handled in onError callback
      console.error('Error details:', error)
    }
  }

  const deleteSelectedSources = async (selectedIds: number[]) => {
    for (const id of selectedIds) {
      await deleteSourceById(id)
    }
  }

  return {
    deleteSourceById,
    deleteSelectedSources,
    isPending: mutation.isPending,
  }
}
