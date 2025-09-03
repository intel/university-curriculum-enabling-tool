// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient } from '@tanstack/react-query'
import useChatStore from '@/lib/store/chat-store'
import { useModelStore } from '../store/model-store'
import { toast } from 'sonner'
import { useRef, useEffect } from 'react'
import { OllamaModel } from '../types/ollama-model'

interface ModelsResponse {
  data: OllamaModel[]
}

/**
 * Fetcher function for TanStack Query.
 *
 * This function fetches data from the given URL and throws an error if the response is not OK.
 *
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the response is not OK.
 */
const fetchModels = async (): Promise<{ models: ModelsResponse }> => {
  const fetcherUrl = new URL(`/api/tags`, window.location.origin).href
  const response = await fetch(fetcherUrl)
  if (!response.ok) {
    throw new Error('An error occurred while fetching the data.')
  }
  return response.json()
}

export function useModels() {
  const setSelectedModelChat = useChatStore((state) => state.setSelectedModel)
  const setSelectedModel = useModelStore((state) => state.setSelectedModel)
  const { setModels, models: currentModels } = useModelStore()
  const queryClient = useQueryClient()

  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  })

  const modelsRef = useRef(currentModels)
  useEffect(() => {
    modelsRef.current = currentModels
  }, [currentModels])

  useEffect(() => {
    if (data?.models && Array.isArray(data.models)) {
      const updatedModels = data.models
        .filter((model: OllamaModel) => model.name !== 'bge-large:335m')
        .map((model: OllamaModel) => ({
          ...model,
          selected: modelsRef.current.find((s) => s.name === model.name)?.selected || false,
        }))
      setModels(updatedModels)
    } else if (data) {
      setSelectedModel('')
      setSelectedModelChat('')
      console.error('Received data is not an array:', data)
      toast.error('Received invalid data format from the server.')
    }
  }, [data, setModels, setSelectedModel, setSelectedModelChat])

  // Handle errors
  useEffect(() => {
    if (error) {
      console.error('Error fetching sources:', error)
      toast.error('Failed to fetch models. Please try again later.')
      setSelectedModel('')
      setSelectedModelChat('')
    }
  }, [error, setSelectedModel, setSelectedModelChat])

  // Function to manually update model in cache
  const updateModelInCache = (modelName: string, updatedData: Partial<OllamaModel>) => {
    queryClient.setQueryData(['models'], (old: { models: ModelsResponse } | undefined) => {
      if (!old || !Array.isArray(old.models)) return old

      return {
        ...old,
        models: old.models.map((model) =>
          model.name === modelName ? { ...model, ...updatedData } : model,
        ),
      }
    })
  }

  // Function to manually invalidate models cache
  const refreshModels = () => {
    queryClient.invalidateQueries({ queryKey: ['models'] })
  }

  return {
    models: currentModels || [],
    isLoading: isPending,
    isError: !!error,
    mutate: refetch,
    updateModelInCache,
    refreshModels,
  }
}
