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
  const courseTitle =
    `${(courseInfo?.courseCode || '').trim()} ${(courseInfo?.courseName || (language === 'id' ? 'mata kuliah ini' : 'this course')).trim()}`
      .replace(/\s+/g, ' ')
      .trim()
  const courseDescription = courseInfo?.courseDescription?.trim()

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
    : `1. Karena tidak ada materi sumber, dasarkan pertanyaan HANYA pada judul mata kuliah "${courseTitle}". Jangan gunakan kurikulum standar atau sumber eksternal.
${courseDescription ? `2. Gunakan deskripsi mata kuliah berikut sebagai konteks:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Fokus pada konsep inti, teori, dan aplikasi umum.
${courseDescription ? '4' : '3'}. Pastikan tingkat akademik sesuai konteks universitas.
${courseDescription ? '5' : '4'}. SANGAT PENTING: Seluruh keluaran HARUS dalam Bahasa Indonesia yang jelas dan alami, tanpa mencampur bahasa apa pun. Abaikan bahasa asli nama mata kuliah - tetap gunakan Bahasa Indonesia untuk semua respons.`
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
    : `1. Since there are no source materials, base the questions ONLY on the course title "${courseTitle}". Do not use standard curriculum or external sources.
${courseDescription ? `2. Use the following course description as context:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Focus on core concepts, theories, and common applications.
${courseDescription ? '4' : '3'}. Ensure the academic level fits a university context.
${courseDescription ? '5' : '4'}. CRITICAL: All output MUST be in clear, natural English without mixing any languages. Ignore the original language of the course name—always use English for all responses.`
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
        } ${courseInfo?.courseName || 'mata kuliah ini'}. ${
          courseInfo?.courseDescription
            ? `Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseInfo.courseDescription.trim()}". `
            : ''
        }Jawab dalam format yang diminta.`
  }
  return hasSourceMaterials
    ? `Generate ${numQuestions} unique questions for the ${assessmentType} assessment. Follow the requested output format.`
    : `Generate ${numQuestions} unique questions for the ${assessmentType} assessment in the course ${
        courseInfo?.courseCode || ''
      } ${courseInfo?.courseName || 'this course'}. ${
        courseInfo?.courseDescription
          ? `Use this course description as context: "${courseInfo.courseDescription.trim()}". `
          : ''
      }Follow the requested output format.`
}

// Model Answer
export function buildExamModelAnswerSystemPrompt(
  assessmentType: string,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
  question: string,
): string {
  const courseDescription = courseInfo?.courseDescription?.trim()

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
${courseDescription ? `2. Gunakan deskripsi mata kuliah berikut sebagai konteks:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Fokus pada konsep inti, teori, dan aplikasi relevan.
${courseDescription ? '4' : '3'}. Pastikan akademik dan tepat.
${courseDescription ? '5' : '4'}. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
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
${courseDescription ? `2. Use the following course description as context:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Focus on core concepts, theory, and relevant applications.
${courseDescription ? '4' : '3'}. Keep it academic and precise.
${courseDescription ? '5' : '4'}. The output MUST be entirely in the requested target language with no language mixing.`
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
        }. ${
          courseInfo?.courseDescription
            ? `Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseInfo.courseDescription.trim()}".`
            : ''
        }`
  }
  return hasSourceMaterials
    ? `Create a model answer for the question.`
    : `Create a model answer for the question in ${courseInfo?.courseCode || ''} ${
        courseInfo?.courseName || 'this course'
      }. ${
        courseInfo?.courseDescription
          ? `Use this course description as context: "${courseInfo.courseDescription.trim()}".`
          : ''
      }`
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
  const courseDescription = courseInfo?.courseDescription?.trim()

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
${courseDescription ? `2. Gunakan deskripsi mata kuliah berikut sebagai konteks:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Fokus pada pemahaman, aplikasi, dan analisis kritis.
${courseDescription ? '4' : '3'}. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
3. Buat TEPAT 3 atau 4 kriteria yang berbeda dan relevan dengan pertanyaan dan jawaban model (mis. akurasi konsep, analisis, penerapan teknis, komunikasi).
4. Deskripsikan setiap kriteria secara spesifik dengan menyebutkan detail dari jawaban model/pertanyaan; hindari frasa generik.
5. Bobot kriteria harus dalam persen dan totalnya 100.
6. Bagian markAllocation harus memuat komponen dengan nama yang sama persis seperti kriteria, dengan jumlah nilai (marks) yang sama dengan bobot persen.
7. Sertakan bidang totalMarks yang menunjukkan jumlah nilai maksimum (biasanya 100).
8. Respons HARUS berupa JSON valid tanpa teks tambahan.

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
      "component": "Kriteria 1",
      "marks": 40,
      "description": "Deskripsi penilaian untuk kriteria 1"
    }
  ],
  "totalMarks": 100
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
${courseDescription ? `2. Use the following course description as context:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Focus on understanding, application, and critical analysis.
${courseDescription ? '4' : '3'}. The output MUST be entirely in the requested target language with no language mixing.`
}
3. Produce exactly 3 or 4 distinct criteria that tie directly to the question and model answer (e.g., conceptual accuracy, analytical depth, practical application, communication quality).
4. Write rich, specific descriptions for each criterion that reference key elements from the model answer; avoid generic boilerplate.
5. Assign criterion weights as percentages that sum to 100.
6. In the markAllocation section, use component names that MATCH the criterion names and set marks equal to the corresponding percentage weight.
7. Include a totalMarks field indicating the maximum score (typically 100).
8. The response MUST be valid JSON with no extra commentary.

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
      "component": "Criterion 1",
      "marks": 40,
      "description": "Description of how marks are awarded for criterion 1"
    }
  ],
  "totalMarks": 100
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
        } ${courseInfo?.courseName || 'mata kuliah ini'}. ${
          courseInfo?.courseDescription
            ? `Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseInfo.courseDescription.trim()}".`
            : ''
        }`
  }
  return hasSourceMaterials
    ? `Create marking criteria (rubric) for this question based on the model answer.`
    : `Create marking criteria (rubric) for this question based on the model answer in ${
        courseInfo?.courseCode || ''
      } ${courseInfo?.courseName || 'this course'}. ${
        courseInfo?.courseDescription
          ? `Use this course description as context: "${courseInfo.courseDescription.trim()}".`
          : ''
      }`
}
