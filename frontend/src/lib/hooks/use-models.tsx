// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

/**
 * useModels Hook - Provider-Agnostic Model Management
 *
 * This hook manages model fetching and caching for both Ollama and OVMS providers.
 * It uses TanStack Query for efficient data fetching and caching, and automatically
 * updates the Zustand store when new model data is available.
 *
 * The /api/tags endpoint automatically detects the configured provider (Ollama or OVMS)
 * and returns the appropriate model list in a unified format.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import useChatStore from '@/lib/store/chat-store'
import { useModelStore } from '../store/model-store'
import { toast } from 'sonner'
import { useRef, useEffect } from 'react'
import { OllamaModel } from '../types/ollama-model'

/**
 * Fetcher function for TanStack Query.
 *
 * Fetches models from /api/tags which handles both Ollama and OVMS providers.
 * The endpoint automatically detects the configured provider and returns models
 * in a unified format.
 *
 * @returns A promise that resolves to the models response
 * @throws An error if the response is not OK
 */
const fetchModels = async (): Promise<{ models: OllamaModel[] }> => {
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
    queryClient.setQueryData(['models'], (old: { models: OllamaModel[] } | undefined) => {
      if (!old || !Array.isArray(old.models)) return old

      return {
        ...old,
        models: old.models.map((model) =>
          model.name === modelName ? { ...model, ...updatedData } : model,
        ),
      }
    })
  }

  /**
   * Invalidate the models cache and trigger a refetch.
   * This is useful when you know the model list has changed on the server
   * (e.g., after downloading a new model).
   */
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
