// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Course } from '@/payload-types'
import { PayloadResponse } from '../types/payload'
import { stringify } from 'qs-esm'

export const useCourses = () => {
  return useQuery<PayloadResponse<Course>>({
    queryKey: ['courses'],
    queryFn: async () => {
      const response = await fetch('/api/courses?limit=0')
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch courses')
      }
      return response.json() as Promise<PayloadResponse<Course>>
    },
  })
}

export const useCreateCourse = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newCourse: Partial<Course>) => {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCourse),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create course')
      }

      return response.json() as Promise<Course>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
    onError: (error: Error) => {
      console.error('Error creating course:', error)
    },
  })
}

export const useDeleteCourse = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: number) => {
      const deleteCourseUrl = new URL(`/api/courses/${courseId}`, window.location.origin).href
      const response = await fetch(deleteCourseUrl, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete course')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      toast.success('Course deleted successfully')
    },
    onError: (error: Error) => {
      console.error('Error deleting course:', error)
      toast.error(error.message || 'Failed to delete course')
    },
  })
}

export const useBulkDeleteCourses = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (courseIds: number[]) => {
      const query = stringify(
        {
          where: {
            id: {
              in: courseIds,
            },
          },
        },
        { addQueryPrefix: true },
      )

      const deleteBulkCoursesUrl = new URL(`/api/courses${query}`, window.location.origin).href
      const response = await fetch(deleteBulkCoursesUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete courses')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      toast.success('Courses deleted successfully')
    },
    onError: (error: Error) => {
      console.error('Error deleting courses:', error)
      toast.error(error.message || 'Failed to delete courses')
    },
  })
}

export const useUpdateCourse = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (course: Course) => {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(course),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update course')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      toast.success('Course updated successfully')
    },
    onError: (error: Error) => {
      console.error('Error updating course:', error)
      toast.error(error.message || 'Failed to update course')
    },
  })
}
