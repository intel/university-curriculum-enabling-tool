// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useModelStore } from '@/lib/store/model-store'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface DeleteModelResponse {
  success: boolean
  message?: string
}

interface DeleteModelArgs {
  name: string
}

/**
 * Function for deleting a model.
 *
 * @param arg - An object containing the name of the model to delete.
 * @returns A promise that resolves to the response data.
 * @throws An error if the deletion fails.
 */
async function deleteModelFetcher({ name }: DeleteModelArgs): Promise<DeleteModelResponse> {
  const deleteModelFetcherUrl = new URL('/api/model', window.location.origin).href
  const response = await fetch(deleteModelFetcherUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: name }),
  })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to delete model'
    throw new Error(errorMessage)
  }
  return response.json()
}

/**
 * Custom hook for deleting model.
 *
 * @returns An object containing functions to delete a model by name.
 */
export function useDeleteModel() {
  const { deleteModel } = useModelStore.getState()
  const queryClient = useQueryClient() // Get the query client instance

  // Use useMutation with query client for better cache management
  const mutation = useMutation({
    mutationFn: deleteModelFetcher,
    onSuccess: (_, variables) => {
      // Update the local store
      deleteModel(variables.name)

      // Invalidate the models query to refresh the data
      queryClient.invalidateQueries({ queryKey: ['models'] })

      toast.success('Model Deleted', {
        description: `${variables.name} has been deleted successfully.`,
      })
    },
    onError: (error, variables) => {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Ollama server error: ${(error as { data: string }).data}`)
      } else {
        toast.error(`Failed to delete model ${variables.name}`)
      }
    },
  })

  /**
   * Deletes a model by its name.
   *
   * @param name - The name of the model to delete.
   */
  const deleteModelByName = async (name: string) => {
    try {
      await mutation.mutateAsync({ name })
    } catch (error) {
      // Error is already handled in onError callback
      console.error('Error details:', error)
    }
  }

  return {
    deleteModelByName,
    isPending: mutation.isPending,
  }
}
