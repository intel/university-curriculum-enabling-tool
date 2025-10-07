// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Lang } from '@/lib/utils/lang'
import { RUBRIC_PREFIXES } from '../utils/constants'
import { getPdfLabels } from './labels'

/**
 * Check if name starts with any of the given prefixes
 */
export function startsWithAny(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => name.startsWith(p))
}

/**
 * Remove any matching prefix from name
 */
export function removeAnyPrefix(name: string, prefixes: readonly string[]): string {
  for (const p of prefixes) {
    if (name.startsWith(p)) return name.substring(p.length)
  }
  return name
}

/**
 * Remove all category prefixes from rubric criterion name
 */
export function removeCategoryPrefixes(name: string): string {
  let result = name
  result = removeAnyPrefix(result, RUBRIC_PREFIXES.report)
  result = removeAnyPrefix(result, RUBRIC_PREFIXES.demo)
  result = removeAnyPrefix(result, RUBRIC_PREFIXES.individual)
  return result
}

// Re-export prefix arrays with semantic names for generator code parity
export const REPORT_PREFIXES = RUBRIC_PREFIXES.report
export const DEMO_PREFIXES = RUBRIC_PREFIXES.demo
export const INDIVIDUAL_PREFIXES = RUBRIC_PREFIXES.individual

/**
 * Localization-aware rubric level matcher
 */
export function matchesLevel(
  level: string | undefined,
  target: 'excellent' | 'good' | 'average' | 'acceptable' | 'poor',
  language: Lang,
): boolean {
  if (!level) return false
  const l = level.toLowerCase()
  if (language === 'id') {
    if (target === 'excellent') return l.includes('sangat baik')
    if (target === 'good') return l.includes('baik') && !l.includes('sangat')
    if (target === 'average') return l.includes('sedang')
    if (target === 'acceptable') return l.includes('cukup')
    if (target === 'poor') return l.includes('sangat kurang') || l.includes('kurang')
  } else {
    if (target === 'excellent') return l.includes('excellent')
    if (target === 'good') return l.includes('good')
    if (target === 'average') return l.includes('average')
    if (target === 'acceptable') return l.includes('acceptable')
    if (target === 'poor') return l.includes('poor')
  }
  return false
}

/**
 * Create default rubric descriptions localized for each performance level.
 */
export function createDefaultRubricDescriptions(baseName: string, language: Lang) {
  const labels = getPdfLabels(language)
  return {
    excellent: labels.excellentDefault.replace(/performance/i, 'performance'),
    good: labels.goodDefault.replace(/performance/i, 'performance'),
    average: labels.averageDefault.replace(/performance/i, 'performance'),
    acceptable: labels.acceptableDefault.replace(/performance/i, 'performance'),
    poor: labels.poorDefault.replace(/performance/i, 'performance'),
  }
}
