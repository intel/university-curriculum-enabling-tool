// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Lang, CourseInfoLike } from '@/app/api/assessment/prompts/common'
import { langDirective } from '@/app/api/assessment/prompts/common'

// Questions
export function buildExamQuestionsSystemPrompt(
  difficultyLevel: string,
  assessmentType: string,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
  numQuestions: number,
): string {
  if (language === 'id') {
    return `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli dalam bidang ${
      courseInfo?.courseName || 'mata kuliah ini'
    }. Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} tingkat ${difficultyLevel}.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Anda HARUS mendasarkan seluruh konten SEPENUHNYA pada materi sumber yang disediakan.
2. Ambil konsep kunci, terminologi, contoh, dan penjelasan langsung dari materi sumber.
3. Jangan perkenalkan konsep atau informasi yang tidak ada dalam materi sumber.
4. Abaikan judul mata kuliah atau pengetahuan eksternal di luar materi sumber.
5. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
    : `1. Karena tidak ada materi sumber, dasarkan pertanyaan HANYA pada judul mata kuliah "${(
        courseInfo?.courseCode || ''
      ).trim()} ${(
        courseInfo?.courseName || 'mata kuliah ini'
      ).trim()}". Jangan gunakan kurikulum standar atau sumber eksternal.
2. Fokus pada konsep inti, teori, dan aplikasi umum.
3. Pastikan tingkat akademik sesuai konteks universitas.
4. SANGAT PENTING: Seluruh keluaran HARUS dalam Bahasa Indonesia yang jelas dan alami, tanpa mencampur bahasa apa pun. Abaikan bahasa asli nama mata kuliah - tetap gunakan Bahasa Indonesia untuk semua respons.`
}
4. Pertanyaan harus beragam dan mencakup berbagai topik.
5. Respons HARUS berupa array JSON string.

FORMAT:
[
  "Pertanyaan 1",
  "Pertanyaan 2"
]

JANGAN sertakan teks di luar array JSON.`
  }

  return `${langDirective(language)}\n\nYou are an expert assessment designer in ${
    courseInfo?.courseName || 'this course'
  }. Generate ${numQuestions} unique questions for a ${difficultyLevel}-level ${assessmentType} assessment.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. You MUST base ALL content ENTIRELY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.
4. Ignore the course title and any outside knowledge beyond the source materials.
5. The output MUST be entirely in the requested target language with no language mixing.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
    : `1. Since there are no source materials, base the questions ONLY on the course title "${(
        courseInfo?.courseCode || ''
      ).trim()} ${(
        courseInfo?.courseName || 'this course'
      ).trim()}". Do not use standard curriculum or external sources.
2. Focus on core concepts, theories, and common applications.
3. Ensure the academic level fits a university context.
4. CRITICAL: All output MUST be in clear, natural English without mixing any languages. Ignore the original language of the course name - always use English for all responses.`
}
4. Questions should be diverse and cover multiple topics.
5. The response MUST be a JSON array of strings.

FORMAT:
[
  "Question 1",
  "Question 2"
]

DO NOT include any text outside the JSON array.`
}

export function buildExamQuestionsUserPrompt(
  hasSourceMaterials: boolean,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  numQuestions: number,
  assessmentType: string,
): string {
  if (language === 'id') {
    return hasSourceMaterials
      ? `Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType}. Ikuti format yang diminta.`
      : `Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} pada mata kuliah ${
          courseInfo?.courseCode || ''
        } ${courseInfo?.courseName || 'mata kuliah ini'}. Jawab dalam format yang diminta.`
  }
  return hasSourceMaterials
    ? `Generate ${numQuestions} unique questions for the ${assessmentType} assessment. Follow the requested output format.`
    : `Generate ${numQuestions} unique questions for the ${assessmentType} assessment in the course ${
        courseInfo?.courseCode || ''
      } ${courseInfo?.courseName || 'this course'}. Follow the requested output format.`
}

// Model Answer
export function buildExamModelAnswerSystemPrompt(
  assessmentType: string,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
  question: string,
): string {
  if (language === 'id') {
    return `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli. Buat jawaban model untuk pertanyaan berikut ${
      hasSourceMaterials
        ? 'berdasarkan SECARA KETAT materi sumber yang disediakan.'
        : `untuk ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}`
    }.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Gunakan hanya materi sumber.
2. Ambil konsep dan contoh secara langsung dari materi sumber.
3. Jangan tambah informasi eksternal.
4. Abaikan judul mata kuliah atau pengetahuan eksternal di luar materi sumber.
5. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
    : `1. Gunakan pengetahuan standar kurikulum.
2. Fokus pada konsep inti, teori, dan aplikasi relevan.
3. Pastikan akademik dan tepat.
4. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
4. Jawaban harus komprehensif dan akurat.
5. Respons HARUS berupa teks polos saja.

PERTANYAAN: ${question}

JANGAN sertakan format markdown atau penjelasan tambahan.`
  }

  return `${langDirective(language)}\n\nYou are an expert assessment designer. Create a model answer for the following question ${
    hasSourceMaterials
      ? 'STRICTLY based on the provided source materials.'
      : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`
  }.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. Use only the source materials.
2. Derive concepts and examples directly from them.
3. Do not add external information.
4. Ignore the course title and any outside knowledge beyond the source materials.
5. The output MUST be entirely in the requested target language with no language mixing.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
    : `1. Use standard curriculum knowledge.
2. Focus on core concepts, theory, and relevant applications.
3. Keep it academic and precise.
4. The output MUST be entirely in the requested target language with no language mixing.`
}
4. The answer must be comprehensive and accurate.
5. The response MUST be plain text only.

QUESTION: ${question}

DO NOT include markdown formatting or extra explanations.`
}

export function buildExamModelAnswerUserPrompt(
  hasSourceMaterials: boolean,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
): string {
  if (language === 'id') {
    return hasSourceMaterials
      ? `Buat jawaban model untuk pertanyaan tersebut.`
      : `Buat jawaban model untuk pertanyaan tersebut pada ${courseInfo?.courseCode || ''} ${
          courseInfo?.courseName || 'mata kuliah ini'
        }.`
  }
  return hasSourceMaterials
    ? `Create a model answer for the question.`
    : `Create a model answer for the question in ${courseInfo?.courseCode || ''} ${
        courseInfo?.courseName || 'this course'
      }.`
}

// Marking Criteria
export function buildExamMarkingCriteriaSystemPrompt(
  assessmentType: string,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
  question: string,
  modelAnswer: string,
): string {
  if (language === 'id') {
    return `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli. Buat kriteria penilaian untuk pertanyaan berikut berdasarkan jawaban model ${
      hasSourceMaterials
        ? 'dan SECARA KETAT materi sumber.'
        : `untuk ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}`
    }.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Gunakan hanya materi sumber.
2. Ambil elemen penilaian yang relevan dari jawaban model.
3. Abaikan judul mata kuliah atau pengetahuan eksternal di luar materi sumber.
4. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
    : `1. Gunakan prinsip penilaian akademik standar.
2. Fokus pada pemahaman, aplikasi, dan analisis kritis.
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
3. Berikan rubrik terstruktur dengan bobot jelas.
4. Respons HARUS berupa JSON valid.

PERTANYAAN: ${question}

JAWABAN MODEL: ${modelAnswer}

FORMAT:
{
  "criteria": [
    {
      "name": "Kriteria 1",
      "weight": 40,
      "description": "Deskripsi kriteria 1"
    }
  ],
  "markAllocation": [
    {
      "component": "Komponen 1",
      "marks": 5,
      "description": "Deskripsi komponen 1"
    }
  ]
}

JANGAN sertakan teks di luar objek JSON.`
  }

  return `${langDirective(language)}\n\nYou are an expert assessment designer. Create marking criteria for the following question based on the model answer ${
    hasSourceMaterials
      ? 'and STRICTLY the source materials.'
      : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`
  }.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. Use only the source materials.
2. Derive relevant assessment elements from the model answer.
3. Ignore the course title and any outside knowledge beyond the source materials.
4. The output MUST be entirely in the requested target language with no language mixing.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
    : `1. Use standard academic assessment principles.
2. Focus on understanding, application, and critical analysis.
3. The output MUST be entirely in the requested target language with no language mixing.`
}
3. Provide a structured rubric with clear weights.
4. The response MUST be valid JSON.

QUESTION: ${question}

MODEL ANSWER: ${modelAnswer}

FORMAT:
{
  "criteria": [
    {
      "name": "Criterion 1",
      "weight": 40,
      "description": "Description of criterion 1"
    }
  ],
  "markAllocation": [
    {
      "component": "Component 1",
      "marks": 5,
      "description": "Description of component 1"
    }
  ]
}

DO NOT include any text outside the JSON object.`
}

export function buildExamMarkingCriteriaUserPrompt(
  hasSourceMaterials: boolean,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
): string {
  if (language === 'id') {
    return hasSourceMaterials
      ? `Buat kriteria penilaian (rubrik) untuk pertanyaan ini berdasarkan jawaban model.`
      : `Buat kriteria penilaian (rubrik) untuk pertanyaan ini berdasarkan jawaban model pada ${
          courseInfo?.courseCode || ''
        } ${courseInfo?.courseName || 'mata kuliah ini'}.`
  }
  return hasSourceMaterials
    ? `Create marking criteria (rubric) for this question based on the model answer.`
    : `Create marking criteria (rubric) for this question based on the model answer in ${
        courseInfo?.courseCode || ''
      } ${courseInfo?.courseName || 'this course'}.`
}
