// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// Shared types for course content generation

export interface LectureSlide {
  title: string
  content: string[]
  notes: string
}

export interface LearningActivity {
  title: string
  type: string
  description: string
  duration: string
  instructions: string[]
  materials: string[]
}

export interface AssessmentQuestion {
  question: string
  options?: string[]
  correctAnswer?: string
  explanation?: string | string[]
  modelAnswer?: string // Added modelAnswer property
}

export interface AssessmentIdea {
  type: string
  duration: string
  description: string
  exampleQuestions: AssessmentQuestion[]
}

export interface FurtherReading {
  title: string
  author: string
  readingDescription: string
}

export interface LectureContent {
  title: string
  learningOutcomes: string[]
  keyTerms: { term: string; definition: string }[]
  introduction: string
  slides: LectureSlide[]
  activities: LearningActivity[]
  assessmentIdeas: AssessmentIdea[]
  sessionLength: number
  furtherReadings: FurtherReading[]
  contentType?: string
  difficultyLevel?: string
  _error?: string
  _sourceMetadata?: {
    sourceCount: number
    chunkCount: number
    tokenEstimate: number
    sourceNames: string[]
  }
}

export type View = 'welcome' | 'config' | 'content'

// Content type descriptions for tooltips
export const contentTypeDescriptions = {
  lecture: 'Structured presentation of information with slides and speaker notes',
  tutorial: 'Step-by-step guide focused on developing specific skills',
  workshop: 'Interactive session with multiple hands-on activities',
}

// Content style descriptions for tooltips
export const contentStyleDescriptions = {
  interactive: 'Emphasizes student participation and engagement throughout',
  caseStudy: 'Uses real-world examples to illustrate concepts and principles',
  problemBased: 'Centers around problems that students work to solve',
  traditional: 'Follows a standard lecture format with clear sections',
}

// Difficulty level descriptions for tooltips
export const difficultyDescriptions = {
  introductory: 'For beginners with little to no prior knowledge',
  intermediate: 'For students with foundational knowledge seeking to expand',
  advanced: 'For students with substantial background knowledge ready for complex topics',
}
