// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export type Lang = 'en' | 'id'

/**
 * Normalize unknown language input to supported Lang type.
 * Defaults to 'en' if unsupported or undefined.
 */
export const normalizeLanguage = (lang: unknown): Lang => (lang === 'id' ? 'id' : 'en')

/**
 * Standard directive to enforce model output language.
 * Returns a strict instruction string for the given language.
 */
export const languageDirective = (lang: Lang): string =>
  lang === 'en'
    ? 'IMPORTANT: You must produce all output text strictly in English. All titles, bullet points, notes, descriptions, questions, and explanations must be in English.'
    : 'PENTING: Anda harus menghasilkan seluruh teks keluaran dalam Bahasa Indonesia. Semua judul, poin, catatan, deskripsi, pertanyaan, dan penjelasan harus dalam Bahasa Indonesia.'
