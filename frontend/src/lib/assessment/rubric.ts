// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { type Lang } from '@/lib/utils/lang'

// Helper: default rubric descriptions (shared between PDF and DOCX generators)
export function createDefaultRubricDescriptions(criterionName: string, language: Lang = 'en') {
  const name = criterionName.toLowerCase()
  if (language === 'id') {
    return {
      excellent: `Menunjukkan ${name} yang luar biasa dengan pemahaman komprehensif dan eksekusi tanpa cacat.`,
      good: `Menampilkan ${name} yang kuat dengan beberapa area kecil untuk perbaikan.`,
      average: `Menunjukkan ${name} yang memadai dan memenuhi persyaratan dasar.`,
      acceptable: `Menampilkan ${name} minimum yang dapat diterima namun membutuhkan banyak perbaikan.`,
      poor: `Gagal menunjukkan ${name} yang memadai; berada di bawah persyaratan minimum.`,
    }
  }
  return {
    excellent: `Demonstrates outstanding ${name} with comprehensive understanding and flawless execution.`,
    good: `Shows strong ${name} with minor areas for improvement.`,
    average: `Demonstrates adequate ${name} and meets basic requirements.`,
    acceptable: `Shows a minimally acceptable ${name} but requires significant improvement.`,
    poor: `Fails to demonstrate adequate ${name}; below minimum requirements.`,
  }
}
