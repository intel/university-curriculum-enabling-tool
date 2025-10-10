// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { ExplanationData, RubricLevel } from '../types'

// Type guards to avoid any usage
export function isRubricLevelArray(v: unknown): v is RubricLevel[] {
  return (
    Array.isArray(v) &&
    v.every(
      (i) =>
        typeof i === 'object' &&
        i !== null &&
        typeof (i as { level?: unknown }).level === 'string' &&
        typeof (i as { criteria?: unknown }).criteria === 'object' &&
        (i as { criteria: unknown }).criteria !== null,
    )
  )
}

export function isExplanationData(v: unknown): v is ExplanationData {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  if (obj.criteria && !Array.isArray(obj.criteria)) return false
  if (obj.rubricLevels && !isRubricLevelArray(obj.rubricLevels)) return false
  if (obj.markAllocation && !Array.isArray(obj.markAllocation)) return false
  return true
}
