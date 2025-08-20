// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export interface ExplanationObject {
  criteria: Array<{ name: string; weight: number; description?: string }>
  markAllocation: Array<{ component: string; marks: number; description?: string }>
  rubricLevels?: Array<{
    level: string
    criteria: { [key: string]: string }
  }>
  [key: string]: unknown
}

export interface AssessmentQuestion {
  question: string
  options?: string[]
  correctAnswer?: string
  explanation?: string | ExplanationObject
}

export interface AssessmentIdea {
  type: string
  duration: string
  description: string
  exampleQuestions: AssessmentQuestion[]
  courseCode?: string
  courseName?: string
  semester?: string
  academicYear?: string
  deadline?: string
  groupSize?: number
  title?: string // Add the title property as optional
}

export interface AssessmentDocxContent {
  assessmentIdeas: AssessmentIdea[]
  difficultyLevel?: string
  format?: string
  metadata?: {
    courseCode?: string
    courseName?: string
    examTitle?: string
    semester?: string
    academicYear?: string
    deadline?: string
    groupSize?: number
    projectDuration?: string
    [key: string]: unknown
  }
}
