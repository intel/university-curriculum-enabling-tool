// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Lang } from '@/lib/utils/lang'

export interface PdfLabels {
  confidential: string
  rubricTitle: string
  gradingScale: string
  reportSection: string
  demoSection: string
  individualSection: string
  criteria: string
  excellentHeader: string
  goodHeader: string
  averageHeader: string
  acceptableHeader: string
  poorHeader: string
  excellentDefault: string
  goodDefault: string
  averageDefault: string
  acceptableDefault: string
  poorDefault: string
  projectInformation: string
  projectDescription: string
  options: string
  modelAnswer: string
  modelAnswerGuidelines: string
  markingCriteria: string
  instructions1: string
  instructions2Prefix: string
  questions: string
  instructions3: string
  instructions4: string
  duration: string
  semester: string
  academicYear: string
  submissionDeadline: string
  groupSize: string
  membersPerGroup: string
  pageLabel: string
  ofLabel: string
}

export function getPdfLabels(language: Lang): PdfLabels {
  if (language === 'id') {
    return {
      confidential: 'SULIT',
      rubricTitle: 'RUBRIK PENILAIAN',
      gradingScale:
        'Skala Penilaian: 1 - Sangat Kurang, 2 - Cukup, 3 - Sedang, 4 - Baik, 5 - Sangat Baik.',
      reportSection: 'LAPORAN (55%)',
      demoSection: 'PRESENTASI DEMO (30%)',
      individualSection: 'KONTRIBUSI INDIVIDU (15%)',
      criteria: 'Kriteria',
      excellentHeader: 'Sangat Baik (5)\nA, A-',
      goodHeader: 'Baik (4)\nB+, B, B-',
      averageHeader: 'Sedang (3)\nC+, C',
      acceptableHeader: 'Cukup (2)\nC-, D+',
      poorHeader: 'Sangat Kurang (1)\nD, D-, F',
      excellentDefault: 'Kinerja sangat baik',
      goodDefault: 'Kinerja baik',
      averageDefault: 'Kinerja sedang',
      acceptableDefault: 'Kinerja cukup',
      poorDefault: 'Kinerja sangat kurang',
      projectInformation: 'INFORMASI PROYEK',
      projectDescription: 'DESKRIPSI PROYEK',
      options: 'Opsi:',
      modelAnswer: 'Jawaban Model',
      modelAnswerGuidelines: 'JAWABAN CONTOH/PANDUAN',
      markingCriteria: 'Kriteria Penilaian',
      instructions1: 'Instruksi: Pastikan kertas ujian ini lengkap sebelum Anda memulai ujian.',
      instructions2Prefix: 'Instruksi: Jawab semua',
      questions: 'pertanyaan',
      instructions3: 'Anda dapat menjawab pertanyaan dalam Bahasa Inggris atau Bahasa Indonesia.',
      instructions4: 'Jika terjadi perbedaan, versi Bahasa Inggris yang digunakan.',
      duration: 'Durasi',
      semester: 'Semester',
      academicYear: 'Tahun Akademik',
      submissionDeadline: 'Batas Pengumpulan',
      groupSize: 'Ukuran Kelompok',
      membersPerGroup: 'anggota per kelompok',
      pageLabel: 'Halaman',
      ofLabel: 'dari',
    }
  }
  return {
    confidential: 'CONFIDENTIAL',
    rubricTitle: 'ASSESSMENT RUBRIC',
    gradingScale: 'Grading Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5 - Excellent.',
    reportSection: 'REPORT (55%)',
    demoSection: 'DEMO PRESENTATION (30%)',
    individualSection: 'INDIVIDUAL CONTRIBUTION (15%)',
    criteria: 'Criteria',
    excellentHeader: 'Excellent (5)\nA, A-',
    goodHeader: 'Good (4)\nB+, B, B-',
    averageHeader: 'Average (3)\nC+, C',
    acceptableHeader: 'Acceptable (2)\nC-, D+',
    poorHeader: 'Poor (1)\nD, D-, F',
    excellentDefault: 'Excellent performance',
    goodDefault: 'Good performance',
    averageDefault: 'Average performance',
    acceptableDefault: 'Acceptable performance',
    poorDefault: 'Poor performance',
    projectInformation: 'PROJECT INFORMATION',
    projectDescription: 'PROJECT DESCRIPTION',
    options: 'Options:',
    modelAnswer: 'Model Answer',
    modelAnswerGuidelines: 'MODEL ANSWER/GUIDELINES',
    markingCriteria: 'Marking Criteria',
    instructions1:
      'Instructions: Please ensure that this examination paper is complete before you begin the examination.',
    instructions2Prefix: 'Instructions: Answer all',
    questions: 'questions',
    instructions3: 'You may answer the questions either in English or in Bahasa Indonesia.',
    instructions4: 'In the event of any discrepancies, the English version shall be used.',
    duration: 'Duration',
    semester: 'Semester',
    academicYear: 'Academic Year',
    submissionDeadline: 'Submission Deadline',
    groupSize: 'Group Size',
    membersPerGroup: 'members per group',
    pageLabel: 'Page',
    ofLabel: 'of',
  }
}

// Helper: Localize title string for Bahasa Indonesia
export function localizeTitle(rawTitle: string, language: Lang): string {
  if (language !== 'id' || !rawTitle) return rawTitle
  const map: Array<[RegExp, string]> = [
    [/assessment/gi, 'Penilaian'],
    [/project/gi, 'Proyek'],
    [/exam/gi, 'Ujian'],
    [/quiz/gi, 'Kuis'],
    [/assignment/gi, 'Tugas'],
    [/test/gi, 'Tes'],
    [/discussion/gi, 'Diskusi'],
  ]
  let title = rawTitle
  for (const [regex, replacement] of map) title = title.replace(regex, replacement)
  return title
}
