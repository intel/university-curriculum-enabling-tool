// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useSourcesStore } from '@/lib/store/sources-store'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Function for uploading a source.
 *
 * This function sends a POST request to upload a file to the specified URL.
 * It handles errors by throwing an exception with an error message.
 *
 * @param formData - The FormData containing the file to upload.
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the upload fails.
 */
async function uploadSourceFetcher(formData: FormData) {
  const response = await fetch(`/api/sources/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    let errorMessage = 'Upload failed'
    try {
      const text = await response.text()
      console.error('Upload failed response:', text)
      const errorData = JSON.parse(text)
      errorMessage =
        errorData.errors?.[0]?.message || errorData.message || `Upload failed: ${response.status}`
    } catch {
      errorMessage = `Upload failed: ${response.status}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

/**
 * Custom hook for uploading sources.
 *
 * This hook provides functionality to upload a file as a source,
 * manage the upload state, and update the local source store.
 *
 * @returns An object containing the uploadSource function and the isUploading state.
 */
export function useUploadSource() {
  const { addSource } = useSourcesStore()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: uploadSourceFetcher,
    onSuccess: (newSource, formData) => {
      const file = formData.get('file') as File | null
      const fileName = file?.name || 'File'
      addSource({ ...newSource, selected: false })

      // Invalidate and refetch sources
      queryClient.invalidateQueries({ queryKey: ['sources'] })

      toast.success(`${fileName} has been uploaded successfully.`)
    },
    onError: (error, formData) => {
      const file = formData.get('file') as File | null
      const fileName = file?.name || 'File'

      if (error instanceof Error) {
        toast.error(`Failed to upload ${fileName}: ${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${(error as { data: string }).data}`)
      } else {
        toast.error(`An unexpected error occurred`)
      }
    },
  })

  /**
   * Uploads a file as a source.
   *
   * This function prepares the FormData with the provided file and triggers the mutation.
   *
   * @param file - The file to upload as a source.
   * @returns A promise that resolves to the new source data.
   */
  const uploadSource = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const newSource = await mutation.mutateAsync(formData)
      return newSource
    } catch (error) {
      console.error('Error details:', error)
      throw error
    }
  }

  return {
    uploadSource,
    isUploading: mutation.isPending,
  }
}
