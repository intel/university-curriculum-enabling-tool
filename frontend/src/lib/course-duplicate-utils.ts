// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// Utility functions for course duplicate detection

import type { Course } from '../payload-types'

export function normalizeCourseField(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase()
}

export function isCourseDuplicate(
  courses: Course[],
  data: { code: string; version: string; tag?: string },
  excludeId?: number,
): boolean {
  const code = normalizeCourseField(data.code)
  const version = normalizeCourseField(data.version)
  const tag = normalizeCourseField(data.tag)
  return courses.some((c) => {
    if (excludeId && c.id === excludeId) return false
    return (
      normalizeCourseField(c.code) === code &&
      normalizeCourseField(c.version) === version &&
      normalizeCourseField(c.tag) === tag
    )
  })
}

export function isCourseExactDuplicate(
  courses: Course[],
  data: { code: string; version: string; tag?: string; name: string; facultyName: string },
  excludeId?: number,
): boolean {
  const code = normalizeCourseField(data.code)
  const version = normalizeCourseField(data.version)
  const tag = normalizeCourseField(data.tag)
  const name = normalizeCourseField(data.name)
  const facultyName = normalizeCourseField(data.facultyName)
  return courses.some((c) => {
    if (excludeId && c.id === excludeId) return false
    return (
      normalizeCourseField(c.code) === code &&
      normalizeCourseField(c.version) === version &&
      normalizeCourseField(c.tag) === tag &&
      normalizeCourseField(c.name) === name &&
      normalizeCourseField(c.facultyName) === facultyName
    )
  })
}
