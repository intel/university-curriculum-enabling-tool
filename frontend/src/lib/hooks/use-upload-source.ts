'use client'

import { useState } from 'react'
import { useSourcesStore } from '@/lib/store/sources-store'
import { useSources } from './use-sources'
import useSWRMutation from 'swr/mutation'
import { toast } from 'sonner'

/**
 * Fetcher function for uploading a source.
 *
 * This function sends a POST request to upload a file to the specified URL.
 * It handles errors by rejecting the promise with an error message.
 *
 * @param url - The API endpoint URL for uploading the source.
 * @param arg - An object containing the FormData to upload.
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the upload fails.
 */
async function uploadSourceFetcher(url: string, { arg }: { arg: FormData }) {
  const uploadSourceUrl = new URL(url, window.location.origin).href
  const response = await fetch(uploadSourceUrl, {
    method: 'POST',
    body: arg,
  })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Upload failed'
    return Promise.reject(new Error(errorMessage))
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
  const [isUploading, setIsUploading] = useState(false)
  const { addSource } = useSourcesStore()
  const { mutate } = useSources()
  const { trigger } = useSWRMutation('/api/sources/upload', uploadSourceFetcher)

  /**
   * Uploads a file as a source.
   *
   * This function uploads the provided file, updates the local source store,
   * and displays success or error messages based on the upload result.
   *
   * @param file - The file to upload as a source.
   * @returns A promise that resolves to the new source data.
   */
  const uploadSource = async (file: File) => {
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const newSource = await trigger(formData)
      addSource({ ...newSource, selected: false })
      mutate()
      toast.success(`${file.name} has been uploaded successfully.`)
      return newSource
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${error.data}`)
      } else {
        toast.error('An unexpected error occurred')
      }
    } finally {
      setIsUploading(false)
    }
  }

  return { uploadSource, isUploading }
}
