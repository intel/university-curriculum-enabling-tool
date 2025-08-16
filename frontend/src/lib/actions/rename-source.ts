import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import useSWRMutation from 'swr/mutation'
import type { Source } from '@/payload-types'

/**
 * Fetcher function for renaming a source.
 *
 * @param url - The API endpoint URL for renaming the source.
 * @param arg - An object containing the ID and new name of the source.
 * @returns A promise that resolves to the updated source data.
 * @throws An error if the renaming fails.
 */
async function renameSourceFetcher(
  url: string,
  { arg }: { arg: { id: string; name: string } },
): Promise<Source> {
  const renameSourceUrl = new URL(
    url.endsWith('/') ? `${arg.id}` : `/${arg.id}`,
    url.startsWith('http') ? url : window.location.origin + url,
  ).href

  const response = await fetch(renameSourceUrl, {
    method: 'PATCH', // or 'PATCH' depending on your API
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: arg.name }),
  })
  if (!response.ok) {
    const errorData = await response.json()
    const errorMessage = errorData.errors?.[0]?.message || 'Failed to rename source'
    return Promise.reject(new Error(errorMessage))
  }
  console.log(response)

  return response.json()
}

/**
 * Custom hook for renaming sources.
 *
 * @returns An object containing a function to rename a source by ID.
 */
export function useRenameSource() {
  const { renameSource } = useSourcesStore.getState()
  const { trigger } = useSWRMutation('/api/sources', renameSourceFetcher)

  /**
   * Renames a source by its ID.
   *
   * @param id - The ID of the source to rename.
   * @param newName - The new name for the source.
   * @returns A promise that resolves to the updated source data.
   */
  const renameSourceById = async (id: number, newName: string) => {
    try {
      // Pass the argument object correctly
      const updatedSource = await trigger({ id: id.toString(), name: newName })

      // Update the local state
      renameSource(id, updatedSource.name)
      toast.success(`Source ID #${id} renamed successfully.`)

      return updatedSource
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`${error.message}`)
      } else if (typeof error === 'object' && error !== null && 'data' in error) {
        toast.error(`Payload CMS Error: ${error.data}`)
      } else {
        toast.error(`Failed to rename source ID #${id}`)
      }
    }
  }

  return { renameSourceById }
}
