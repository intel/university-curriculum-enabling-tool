// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, type ModelMessage } from 'ai'
import type { ProviderFn, AssessmentMetadata } from '../types/assessment.types'
import type { CourseInfo } from '@/lib/types/course-info-types'
import { TEMPERATURE, TOKEN_MAX, langDirective, getDefaultDuration } from '../config/constants'
import { extractJsonFromText } from '../utils/jsonHelpers'
import { stripThinkTags } from '../utils/generalHelpers'

export async function generateAssessmentMetadata(
  assessmentType: string,
  difficultyLevel: string,
  provider: ProviderFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo | undefined,
  language: 'en' | 'id',
): Promise<AssessmentMetadata> {
  console.log(`Generating metadata for ${assessmentType} assessment...`)

  // For project assessments, use specialized metadata
  if (assessmentType.toLowerCase() === 'project' && courseInfo) {
    if (language === 'id') {
      return {
        type: 'Proyek',
        duration: courseInfo.duration || '2 minggu',
        description:
          `${courseInfo.courseCode || ''} ${courseInfo.courseName || ''} Penilaian Proyek`.trim(),
      }
    }
    // English default
    return {
      type: 'Project',
      duration: courseInfo.duration || '2 weeks',
      description:
        `${courseInfo.courseCode || ''} ${courseInfo.courseName || ''} Project Assessment`.trim(),
    }
  }

  // For exam assessments, always set duration to 2 hours
  if (assessmentType.toLowerCase() === 'exam') {
    return {
      type: 'Exam',
      duration: '2 hours',
      // Ensure clean description without duplication
      description:
        `${courseInfo?.courseCode || ''} ${courseInfo?.courseName || ''} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`.trim(),
    }
  }

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')
  const courseDescription = courseInfo?.courseDescription?.trim()

  const systemPrompt =
    language === 'id'
      ? `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli. Buat metadata untuk asesmen ${assessmentType} tingkat ${difficultyLevel} ${
          hasSourceMaterials
            ? 'berdasarkan SECARA KETAT materi sumber yang disediakan.'
            : `untuk ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}${
                courseDescription
                  ? `. Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseDescription}".`
                  : ''
              }`
        }.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Dasarkan seluruh konten pada materi sumber.
2. Ambil konsep kunci dan istilah langsung dari materi sumber.
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
    : `1. Dasarkan metadata pada standar kurikulum untuk ${
        courseInfo?.courseName || 'mata kuliah ini'
      }.${courseDescription ? ` Gunakan deskripsi mata kuliah berikut sebagai referensi utama: "${courseDescription}".` : ''}
2. Fokus pada konsep inti dan tujuan asesmen.
3. Seluruh keluaran HARUS menggunakan bahasa target yang diminta tanpa mencampur bahasa.`
}
3. Buat type, duration, dan description.
4. Respons HARUS berupa JSON valid.

FORMAT:
{
  "type": "${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}",
  "duration": "Durasi yang sesuai (misal '2 hours')",
  "description": "Deskripsi singkat tujuan asesmen"
}

JANGAN sertakan teks di luar objek JSON.`
      : `${langDirective(language)}\n\nYou are an expert assessment designer. Create metadata for a ${difficultyLevel}-level ${assessmentType} assessment ${
          hasSourceMaterials
            ? 'STRICTLY based on the provided source materials.'
            : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}${
                courseDescription
                  ? `. Use the following course description as context: "${courseDescription}".`
                  : ''
              }`
        }.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. Base all content on the source materials.
2. Use key concepts and terminology directly from the sources.
3. The output MUST be entirely in the requested target language with no language mixing.`
    : `1. Base the metadata on standard curriculum for ${courseInfo?.courseName || 'this course'}.${
        courseDescription
          ? ` Use this course description as the primary context: "${courseDescription}".`
          : ''
      }
2. Focus on core concepts and purpose of the assessment.
3. The output MUST be entirely in the requested target language with no language mixing.`
}
3. Produce type, duration, and description.
4. The response MUST be valid JSON.

FORMAT:
{
  "type": "${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}",
  "duration": "A suitable duration (e.g., '2 hours')",
  "description": "A brief description of the assessment purpose"
}

DO NOT include any text outside the JSON object.`

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content:
      language === 'id'
        ? `Hasilkan metadata untuk asesmen ${assessmentType} pada ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'mata kuliah ini'}.${
            courseDescription
              ? ` Gunakan deskripsi mata kuliah berikut sebagai konteks: "${courseDescription}".`
              : ''
          }`
        : `Generate metadata for the ${assessmentType} assessment in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.${
            courseDescription
              ? ` Use this course description as context: "${courseDescription}".`
              : ''
          }`,
  }

  try {
    const response = await generateText({
      model: provider(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxOutputTokens: Math.floor(TOKEN_MAX / 4),
    })

    const cleaned = stripThinkTags(response.text)
    console.log('Metadata response:', cleaned)

    try {
      const metadata = JSON.parse(cleaned)
      console.log('Successfully parsed metadata directly')

      // Override duration for exam type
      if (assessmentType.toLowerCase() === 'exam') {
        metadata.duration = '2 hours'
      }

      // Ensure description is not duplicated if courseInfo is provided
      if (courseInfo?.courseCode && courseInfo?.courseName) {
        metadata.description = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
      }

      return metadata
    } catch {
      console.log('Direct parsing failed, trying JSON extraction')
    }

    const jsonStr = extractJsonFromText(cleaned)
    if (jsonStr) {
      try {
        const metadata = JSON.parse(jsonStr)
        console.log('Successfully extracted and parsed metadata JSON')

        // Override duration for exam type
        if (assessmentType.toLowerCase() === 'exam') {
          metadata.duration = '2 hours'
        }

        // Ensure description is not duplicated if courseInfo is provided
        if (courseInfo?.courseCode && courseInfo?.courseName) {
          metadata.description = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
        }

        return metadata
      } catch (e) {
        console.error('Failed to parse extracted metadata JSON:', e)
      }
    }

    // If all extraction methods fail, construct metadata from the response text
    console.log('Constructing metadata from response text')

    // Extract type from the response text
    let extractedType = assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)
    const typeMatch = cleaned.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedType = typeMatch[1]
    }

    // Extract duration from the response text, but override for exam type
    let extractedDuration =
      assessmentType.toLowerCase() === 'exam' ? '2 hours' : getDefaultDuration(assessmentType)
    if (assessmentType.toLowerCase() !== 'exam') {
      const durationMatch = cleaned.match(/"duration"\s*:\s*"([^"]+)"/)
      if (durationMatch && durationMatch[1]) {
        extractedDuration = durationMatch[1]
      }
    }

    // Extract description from the response text or use a clean one if courseInfo is provided
    let extractedDescription = `A ${difficultyLevel} level ${assessmentType} assessment.`
    if (courseInfo?.courseCode && courseInfo?.courseName) {
      extractedDescription = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
    } else {
      const descMatch = cleaned.match(/"description"\s*:\s*"([^"]+)"/)
      if (descMatch && descMatch[1]) {
        extractedDescription = descMatch[1]
      }
    }

    const constructedMetadata = {
      type: extractedType,
      duration: extractedDuration,
      description: extractedDescription,
    }

    console.log('Using constructed metadata:', constructedMetadata)
    return constructedMetadata
  } catch (error) {
    console.error('Error generating metadata:', error)

    // Return default metadata if generation fails
    const defaultMetadata = {
      type: assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1),
      duration:
        assessmentType.toLowerCase() === 'exam' ? '2 hours' : getDefaultDuration(assessmentType),
      description:
        courseInfo?.courseCode && courseInfo?.courseName
          ? `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
          : `A ${difficultyLevel} level ${assessmentType} assessment.`,
    }

    console.log('Using default metadata due to error:', defaultMetadata)
    return defaultMetadata
  }
}
