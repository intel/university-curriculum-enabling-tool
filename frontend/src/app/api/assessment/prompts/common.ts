// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export type Lang = 'en' | 'id'

export const langDirective = (lang: Lang) =>
  lang === 'id'
    ? 'PENTING: Semua output harus dalam Bahasa Indonesia yang jelas dan alami.'
    : 'IMPORTANT: All output must be in clear and natural English.'

// Minimal CourseInfo shape used by prompt builders
export interface CourseInfoLike {
  courseCode?: string
  courseName?: string
  courseDescription?: string
  semester?: string
  academicYear?: string
  deadline?: string
  groupSize?: number
  duration?: string
}
