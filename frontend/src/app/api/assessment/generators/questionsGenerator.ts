// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, type ModelMessage } from 'ai'
import type { ProviderFn, GeneratedQuestion } from '../types/assessment.types'
import type { CourseInfo } from '@/lib/types/course-info-types'
import { TEMPERATURE, TOKEN_MAX, langDirective } from '../config/constants'
import { extractJsonFromText } from '../utils/jsonHelpers'
import { stripThinkTags, logAssessmentDebug } from '../utils/generalHelpers'
import { ensureTargetLanguageText } from '../utils/languageHelpers'
import { generateProjectDescription } from './projectDescriptionGenerator'

export async function generateQuestions(
  assessmentType: string,
  difficultyLevel: string,
  numQuestions: number,
  provider: ProviderFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo?: CourseInfo,
  language: 'en' | 'id' = 'en',
): Promise<GeneratedQuestion[]> {
  logAssessmentDebug(`Generating ${numQuestions} questions for ${assessmentType} assessment...`)

  // Coverity fix: check for null/undefined courseInfo before use
  if (!courseInfo) {
    console.error('generateQuestions: courseInfo is null or undefined')
    const errorMessages: Record<'en' | 'id', string> = {
      en: 'Unable to generate questions: course information is missing.',
      id: 'Tidak dapat membuat pertanyaan: informasi mata kuliah tidak tersedia.',
    }
    throw new Error(errorMessages[language] || errorMessages['en'])
  }

  // For project assessments, generate a specialized project question
  if (assessmentType.toLowerCase() === 'project') {
    logAssessmentDebug('Generating project description instead of standard questions')
    try {
      const projectDescription = await generateProjectDescription(
        difficultyLevel,
        provider,
        selectedModel,
        assistantMessage,
        courseInfo,
        language,
      )

      logAssessmentDebug('Project description generated successfully')

      // Return the project description as a single question
      return [
        {
          question: projectDescription,
          type: 'project',
        },
      ]
    } catch (error) {
      console.error('Error generating project description:', error)
      return [
        {
          question: `
Judul Proyek: ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || ''} Project

Instruksi: Proyek ini dirancang untuk menilai pemahaman Anda terhadap materi kuliah.
Silakan bekerja dalam kelompok beranggotakan ${courseInfo?.groupSize || 4} untuk menyelesaikan proyek ini.

Deskripsi Proyek:
${courseInfo?.courseDescription ? `${courseInfo.courseDescription}\n\n` : ''}
Buat sebuah proyek komprehensif yang menunjukkan pemahaman Anda terhadap konsep-konsep kunci yang dibahas dalam mata kuliah ini.
Proyek harus mencakup komponen implementasi dan dokumentasi.

Deliverables (Hasil yang Harus Dikumpulkan):
1. Laporan rinci yang menjelaskan pendekatan, metodologi, dan temuan
2. Kode sumber atau berkas implementasi
3. Presentasi yang merangkum proyek

Batas Waktu: ${courseInfo?.deadline || 'Akhir semester'}
          `,
          type: 'project',
        },
      ]
    }
  }

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')
  const courseDescription = courseInfo.courseDescription?.trim()

  // Standard question generation for non-project assessments
  // Use modular prompt builder only for exam; keep inline prompts otherwise
  let systemPrompt: string
  if (assessmentType.toLowerCase() === 'exam') {
    const examPrompts = await import('../prompts/exam')
    systemPrompt = examPrompts.buildExamQuestionsSystemPrompt(
      difficultyLevel,
      assessmentType,
      courseInfo,
      language,
      hasSourceMaterials,
      numQuestions,
    )
  } else {
    systemPrompt =
      language === 'id'
        ? `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli dalam bidang ${
            courseInfo?.courseName || 'mata kuliah ini'
          }. Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} tingkat ${difficultyLevel}.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Anda HARUS mendasarkan seluruh konten SEPENUHNYA pada materi sumber yang disediakan.
2. Ambil konsep kunci, terminologi, contoh, dan penjelasan langsung dari materi sumber.
3. Jangan perkenalkan konsep atau informasi yang tidak ada dalam materi sumber.
4. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
    : `1. Karena tidak ada materi sumber, dasarkan pertanyaan pada kurikulum standar untuk ${
        courseInfo?.courseName || 'mata kuliah ini'
      }.
${courseDescription ? `2. Gunakan deskripsi mata kuliah berikut sebagai konteks:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Fokus pada konsep inti, teori, dan aplikasi umum.
${courseDescription ? '4' : '3'}. Pastikan tingkat akademik sesuai konteks universitas.
${courseDescription ? '5' : '4'}. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
4. Pertanyaan harus beragam dan mencakup berbagai topik.
5. Respons HARUS berupa array JSON string.

FORMAT:
[
  "Pertanyaan 1",
  "Pertanyaan 2"
]

JANGAN sertakan teks di luar array JSON.`
        : `${langDirective(language)}\n\nYou are an expert assessment designer in ${
            courseInfo?.courseName || 'this course'
          }. Generate ${numQuestions} unique questions for a ${difficultyLevel}-level ${assessmentType} assessment.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. You MUST base ALL content ENTIRELY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.
4. The output MUST be entirely in the requested target language with no language mixing.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
    : `1. Since there are no source materials, base the questions on the standard curriculum for ${
        courseInfo?.courseName || 'this course'
      }.
${courseDescription ? `2. Use the following course description as context:\n   "${courseDescription}".\n` : ''}${courseDescription ? '3' : '2'}. Focus on core concepts, theories, and common applications.
${courseDescription ? '4' : '3'}. Ensure the academic level fits a university context.
${courseDescription ? '5' : '4'}. The output MUST be entirely in the requested target language with no language mixing.`
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

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content:
      assessmentType.toLowerCase() === 'exam'
        ? (await import('../prompts/exam')).buildExamQuestionsUserPrompt(
            hasSourceMaterials,
            courseInfo,
            language,
            numQuestions,
            assessmentType,
          )
        : language === 'id'
          ? `Hasilkan ${numQuestions} pertanyaan unik untuk asesmen ${assessmentType} pada mata kuliah ${
              courseInfo?.courseCode || ''
            } ${courseInfo?.courseName || 'mata kuliah ini'}. ${
              courseDescription
                ? `Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseDescription}". `
                : ''
            }Jawab dalam format yang diminta.`
          : `Generate ${numQuestions} unique questions for the ${assessmentType} assessment in the course ${
              courseInfo?.courseCode || ''
            } ${courseInfo?.courseName || 'this course'}. ${
              courseDescription
                ? `Use this course description as context: "${courseDescription}". `
                : ''
            }Follow the requested output format.`,
  }

  try {
    const response = await generateText({
      model: provider(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_MAX / 2),
    })

    const cleaned = stripThinkTags(response.text)
    logAssessmentDebug('Questions response:', cleaned)

    try {
      const questions = JSON.parse(cleaned)
      if (Array.isArray(questions)) {
        logAssessmentDebug('Successfully parsed questions directly')
        // Enforce language for each question with force: true
        const languageEnforcedQuestions = await Promise.all(
          questions.map(async (q) => {
            if (typeof q === 'string') {
              return await ensureTargetLanguageText(q, language, provider, selectedModel, {
                force: true,
              })
            } else if (typeof q === 'object' && q.question) {
              return {
                ...q,
                question: await ensureTargetLanguageText(
                  q.question,
                  language,
                  provider,
                  selectedModel,
                  { force: true },
                ),
              }
            }
            return q
          }),
        )
        logAssessmentDebug('Language enforcement completed for all questions')
        return languageEnforcedQuestions
      }
    } catch {
      logAssessmentDebug('Direct parsing failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const questions = JSON.parse(jsonStr)
        if (Array.isArray(questions)) {
          logAssessmentDebug('Successfully extracted and parsed questions JSON')
          // Enforce language for each question with force: true
          const languageEnforcedQuestions = await Promise.all(
            questions.map(async (q) => {
              if (typeof q === 'string') {
                return await ensureTargetLanguageText(q, language, provider, selectedModel, {
                  force: true,
                })
              } else if (typeof q === 'object' && q.question) {
                return {
                  ...q,
                  question: await ensureTargetLanguageText(
                    q.question,
                    language,
                    provider,
                    selectedModel,
                    { force: true },
                  ),
                }
              }
              return q
            }),
          )
          logAssessmentDebug('Language enforcement completed for extracted questions')
          return languageEnforcedQuestions
        }
      } catch (e) {
        console.error('Failed to parse extracted questions JSON:', e)
      }
    }

    // If all extraction methods fail, extract questions from the response text
    logAssessmentDebug('Extracting questions from response text')
    const questionsArray: string[] = []
    const lines = cleaned.split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.length > 0) {
        questionsArray.push(trimmedLine)
      }
    }

    if (questionsArray.length > 0) {
      logAssessmentDebug('Successfully extracted questions from response text')
      return questionsArray
    }

    // If all extraction methods fail, return a default question
    logAssessmentDebug('Using default question due to parsing failure')
    return [
      language === 'id'
        ? 'Apa saja konsep kunci yang dibahas dalam mata kuliah ini?'
        : 'What are the key concepts covered in this course?',
    ]
  } catch (error) {
    console.error('Error generating questions:', error)
    return [
      language === 'id'
        ? 'Apa saja konsep kunci yang dibahas dalam mata kuliah ini?'
        : 'What are the key concepts covered in this course?',
    ]
  }
}
