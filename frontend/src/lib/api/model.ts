import { useModelStore } from '@/lib/store/model-store'
import { toast } from 'sonner'
import useSWRMutation from 'swr/mutation'

interface DeleteModelResponse {
  success: boolean
  message?: string
}

/**
 * Fetcher function for deleting a model.
 *
 * @param url - The API endpoint URL for deleting the model.
 * @returns A promise that resolves to the response data.
 * @throws An error if the deletion fails.
 */
async function deleteModelFetcher(
  url: string,
  { arg }: { arg: { name: string } },
): Promise<DeleteModelResponse> {
  const deleteModelFetcherUrl = new URL(url, window.location.origin).href
  const response = await fetch(deleteModelFetcherUrl, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: arg.name }),
  })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to delete model'
    return Promise.reject(new Error(errorMessage))
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

  // Use useSWRMutation with the correct types
  // const OLLAMA_URL = process.env.OLLAMA_URL;
  // console.log(`OLLAMA_URL: ${OLLAMA_URL}`);
  const { trigger } = useSWRMutation(`/api/model`, deleteModelFetcher)

  /**
   * Deletes a model by its name.
   *
   * @param name - The name of the model to delete.
   */
  const deleteModelByName = async (name: string) => {
    try {
      // Trigger the mutation with the model name
      await trigger({ name: name })

      deleteModel(name)
      toast.success('Model Deleted', {
        description: `${name} has been deleted successfully.`,
      })
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Ollama server error: ${error.data}`)
      } else {
        toast.error(`Failed to delete model ${name}`)
      }
    }
  }

  return { deleteModelByName }
}
