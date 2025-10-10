// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { FontSizes, TableConfig } from '../types'

// PDF dimensions (A4 in mm)
export const PDF_DIMENSIONS = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 20,
} as const

// Font sizes
export const FONT_SIZES: FontSizes = {
  standard: 12,
  title: 14,
  subtitle: 12,
  rubricTitle: 16,
  rubricSection: 14,
  rubricContent: 10,
} as const

// Calculate derived dimensions
export const CONTENT_WIDTH = PDF_DIMENSIONS.pageWidth - PDF_DIMENSIONS.margin * 2

// Table configuration
export const TABLE_CONFIG: TableConfig = {
  availableWidth: CONTENT_WIDTH,
  firstColumnWidth: Math.min(35, CONTENT_WIDTH * 0.25), // 25% for criteria column
  otherColumnWidth: Math.floor((CONTENT_WIDTH - Math.min(35, CONTENT_WIDTH * 0.25)) / 5),
} as const

// Colors
export const COLORS = {
  black: [0, 0, 0] as const,
  gray: [128, 128, 128] as const,
  lightGray: [240, 240, 240] as const,
  white: [255, 255, 255] as const,
} as const

// Rubric prefixes for categorization
export const RUBRIC_PREFIXES = {
  report: ['Report - ', 'Laporan - '],
  demo: ['Demo - ', 'Presentasi Demo - '],
  individual: ['Individual Contribution - ', 'Kontribusi Individu - '],
} as const
