// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// Type definitions for course content generation

import { ClientSource } from '@/lib/types/client-source'

export interface LectureSlide {
  title: string
  content: string[]
  notes: string
}

export interface SpecialSlide {
  type: string
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
  correctAnswer: string // Changed from optional to required
  modelAnswer?: string // Added modelAnswer property
  explanation?: string | { [key: string]: unknown }
  pointAllocation: string
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

export type LectureContent = {
  title: string
  contentType?: string
  difficultyLevel?: string
  introduction: string
  learningOutcomes: string[]
  keyTerms: { term: string; definition: string }[]
  slides: { title: string; content: string[]; notes: string }[]
  _error?: string
  activities: {
    title: string
    type: string
    duration: string
    description: string
    instructions: string[]
    materials: string[]
  }[]
  assessmentIdeas: {
    type: string
    duration: string
    description: string
    exampleQuestions: {
      question: string
      options?: string[]
      correctAnswer?: string
      explanation?: string | { [key: string]: unknown }
    }[]
  }[]
  furtherReadings: { title: string; author: string; readingDescription: string }[]
}

// Response interfaces for different parts of the content
export interface MetadataResponse {
  title?: string
  contentType?: string
  difficultyLevel?: string
  learningOutcomes?: string[]
  keyTerms?: { term: string; definition: string }[]
  [key: string]: unknown
}

export interface ContentResponse {
  introduction?: string
  slides?: LectureSlide[]
  [key: string]: unknown
}

export interface ActivitiesResponse {
  activities?: LearningActivity[]
  [key: string]: unknown
}

export interface AssessmentResponse {
  assessmentIdeas?: AssessmentIdea[]
  [key: string]: unknown
}

export interface ReadingsResponse {
  furtherReadings?: FurtherReading[]
  [key: string]: unknown
}

// Request types
export interface CourseContentRequest {
  selectedModel: string
  selectedSources: ClientSource[]
  contentType: string
  contentStyle: string
  sessionLength: number
  difficultyLevel: string
  topicName: string
  action?: string
  content?: LectureContent
}
