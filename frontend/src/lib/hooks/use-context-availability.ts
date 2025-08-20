// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { usePersonaStore } from '@/lib/store/persona-store'
import { useModelStore } from '@/lib/store/model-store'
import { useCourses } from './use-courses'

/**
 * Hook to check context availability and selection status based on user persona
 *
 * @returns Object containing context availability status and helper functions
 */
export function useContextAvailability() {
  const { activePersona, selectedCourseId } = usePersonaStore()
  const { data: coursesData } = useCourses()
  const courses: { id: number; model?: { name: string } }[] = (coursesData?.docs ?? []).map(
    (course) => ({
      id: course.id,
      model:
        course.model && typeof course.model === 'object' && 'name' in course.model
          ? { name: course.model.name as string }
          : undefined,
    }),
  )
  const { models, selectedModel } = useModelStore()

  // Check if user has selected a model (for faculty) or course (for student/lecturer)
  const hasSelectedContext = activePersona === 'faculty' ? !!selectedModel : !!selectedCourseId

  // Check if there are any models or courses available
  const hasAvailableModels = models.length > 0
  const hasAvailableCourses = courses.length > 0
  const hasAvailableContext = activePersona === 'faculty' ? hasAvailableModels : hasAvailableCourses

  // Get the active context item (model or course)
  const getActiveContextItem = () => {
    if (activePersona === 'faculty') {
      return models.find((m) => m.name === selectedModel)
    } else {
      return courses.find((c) => c.id === selectedCourseId)
    }
  }

  // Get the active model name of context item (model or course)
  const getActiveContextModelName = () => {
    if (activePersona === 'faculty') {
      return models.find((m) => m.name === selectedModel)?.name || ''
    } else {
      return (
        courses
          .filter((c) => c.model?.name && models.some((model) => model.name === c.model?.name))
          .find((c) => c.id === selectedCourseId)?.model?.name || ''
      )
    }
  }

  // Get the context type label based on persona
  const getContextTypeLabel = () => {
    return activePersona === 'faculty' ? 'model' : 'course'
  }

  // Get the path to add new context items
  const getAddContextPath = () => {
    return activePersona === 'faculty' ? '/workspace/model' : '/workspace/courses/add'
  }

  return {
    // Status flags
    activePersona,
    hasSelectedContext,
    hasAvailableContext,
    hasAvailableModels,
    hasAvailableCourses,

    // Helper functions
    getActiveContextItem,
    getActiveContextModelName,
    getContextTypeLabel,
    getAddContextPath,

    // Raw data
    selectedModel,
    selectedCourseId,
    courses,
  }
}
