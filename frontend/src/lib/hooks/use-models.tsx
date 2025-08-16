import useSWR from 'swr'
import useChatStore from '@/lib/store/chat-store'
import { useModelStore } from '../store/model-store'
import { toast } from 'sonner'
import { OllamaModel } from '../types/ollama-model'

interface ModelsResponse {
  data: OllamaModel[]
}

/**
 * Fetcher function for SWR.
 *
 * This function fetches data from the given URL and throws an error if the response is not OK.
 *
 * @param url - The URL to fetch data from.
 * @returns A promise that resolves to the JSON response.
 * @throws An error if the response is not OK.
 */
const fetcher = async (url: string) => {
  const fetcherUrl = new URL(url, window.location.origin).href
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

  const { error, isLoading, mutate } = useSWR<{ models: ModelsResponse }>('/api/tags', fetcher, {
    onSuccess: (response) => {
      if (response?.models && Array.isArray(response.models)) {
        const updatedModels = response.models
          .filter((model: OllamaModel) => model.name !== 'bge-large:335m') // Exclude the specific model
          .map((model: OllamaModel) => ({
            ...model,
            selected: currentModels.find((s) => s.name === model.name)?.selected || false,
          }))
        setModels(updatedModels)
      } else {
        setSelectedModel('')
        setSelectedModelChat('')
        console.error('Received data is not an array:', response)
        toast.error('Received invalid data format from the server.')
      }
    },
    onError: (err) => {
      console.error('Error fetching sources:', err)
      toast.error('Failed to fetch models. Please try again later.')
      setSelectedModel('')
      setSelectedModelChat('')
    },
  })

  return {
    models: currentModels,
    isLoading,
    isError: error,
    mutate,
  }
}
