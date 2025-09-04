// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import type { Source } from '@/payload-types'

/**
 * Interface for rename source arguments
 */
interface RenameSourceArgs {
  id: string
  name: string
}

/**
 * Function for renaming a source.
 *
 * @param arg - An object containing the ID and new name of the source.
 * @returns A promise that resolves to the updated source data.
 * @throws An error if the renaming fails.
 */
async function renameSourceFetcher({ id, name }: RenameSourceArgs): Promise<Source> {
  const renameSourceUrl = new URL(`/api/sources/${id}`, window.location.origin).href

  const response = await fetch(renameSourceUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': `application/json`,
    },
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to rename source'
    throw new Error(errorMessage)
  }

  return response.json()
}

/**
 * Custom hook for renaming sources.
 *
 * @returns An object containing a function to rename a source by ID.
 */
export function useRenameSource() {
  const { renameSource } = useSourcesStore.getState()

  const mutation = useMutation({
    mutationFn: renameSourceFetcher,
  })

  /**
   * Renames a source by its ID.
   *
   * @param id - The ID of the source to rename.
   * @param newName - The new name for the source.
   * @returns A promise that resolves to the updated source data.
   */
  const renameSourceById = async (id: number, newName: string) => {
    try {
      // Use mutateAsync instead of trigger
      const updatedSource = await mutation.mutateAsync({
        id: id.toString(),
        name: newName,
      })

      // Update the local state
      renameSource(id, updatedSource.name)
      toast.success(`Source ID #${id} renamed successfully.`)

      return updatedSource
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${(error as { data: string }).data}`)
      } else {
        toast.error(`Failed to rename source ID #${id}`)
      }
    }
  }

  return { renameSourceById }
}
