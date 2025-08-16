import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Programme } from '@/payload-types'
import { PayloadResponse } from '../types/payload'
import { stringify } from 'qs-esm'

export const useProgrammes = () => {
  return useQuery<PayloadResponse<Programme>>({
    queryKey: ['programmes'],
    queryFn: async () => {
      const response = await fetch('/api/programmes?limit=0')
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch programmes')
      }
      return response.json() as Promise<PayloadResponse<Programme>>
    },
  })
}

export const useCreateProgramme = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newProgramme: Partial<Programme>) => {
      const response = await fetch('/api/programmes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProgramme),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create programme')
      }

      return response.json() as Promise<Programme>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
    },
    onError: (error: Error) => {
      console.error('Error creating programme:', error)
    },
  })
}

export const useDeleteProgramme = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (programmeId: number) => {
      const useDeleteProgrammeUrl = new URL(
        `/api/programmes/${programmeId}`,
        window.location.origin,
      ).href
      const response = await fetch(useDeleteProgrammeUrl, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete programme')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
      toast.success('Programme deleted successfully')
    },
    onError: (error: Error) => {
      console.error('Error deleting programme:', error)
      toast.error(error.message || 'Failed to delete programme')
    },
  })
}

export const useBulkDeleteProgrammes = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (programmeIds: number[]) => {
      const query = stringify(
        {
          where: {
            id: {
              in: programmeIds,
            },
          },
        },
        { addQueryPrefix: true },
      )

      const programmesDeleteUrl = new URL(`/api/programmes${query}`, window.location.origin).href
      const response = await fetch(programmesDeleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete programmes')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
      toast.success('Programmes deleted successfully')
    },
    onError: (error: Error) => {
      console.error('Error deleting programmes:', error)
      toast.error(error.message || 'Failed to delete programmes')
    },
  })
}

export const useUpdateProgramme = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (programme: Programme) => {
      const response = await fetch(`/api/programmes/${programme.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(programme),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update programme')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
      toast.success('Programme updated successfully')
    },
    onError: (error: Error) => {
      console.error('Error updating programme:', error)
      toast.error(error.message || 'Failed to update programme')
    },
  })
}
