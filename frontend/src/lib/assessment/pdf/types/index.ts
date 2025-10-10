// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type jsPDF from 'jspdf'
import type { Lang } from '@/lib/utils/lang'
import type { AssessmentIdea, AssessmentDocxContent } from '@/lib/types/assessment-types'

// Rubric and explanation data interfaces
export interface RubricCriterion {
  name: string
  weight: number
  description?: string
}

export interface RubricLevel {
  level: string
  criteria: Record<string, string>
}

export interface MarkAllocationItem {
  component: string
  marks: number
  description?: string
}

export interface ExplanationData {
  criteria?: Array<RubricCriterion | string>
  rubricLevels?: RubricLevel[]
  markAllocation?: MarkAllocationItem[]
}

// PDF generation context
export interface PdfContext {
  pdf: jsPDF
  pageWidth: number
  pageHeight: number
  margin: number
  contentWidth: number
  language: Lang
  format: 'student' | 'lecturer'
  currentY: number
}

// PDF generation options
export interface PdfGenerationOptions {
  assessment: AssessmentIdea
  assessmentType: string
  difficultyLevel: string
  format: 'student' | 'lecturer'
  metadata: AssessmentDocxContent['metadata']
  language: Lang
}

// Font sizes
export interface FontSizes {
  standard: number
  title: number
  subtitle: number
  rubricTitle: number
  rubricSection: number
  rubricContent: number
}

// Table configuration
export interface TableConfig {
  availableWidth: number
  firstColumnWidth: number
  otherColumnWidth: number
}

// Assessment type
export type AssessmentType = 'project' | 'regular'

// Component renderer function type
export type ComponentRenderer = (ctx: PdfContext, ...args: unknown[]) => number
