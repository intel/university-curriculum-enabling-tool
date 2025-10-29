// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { ChunkWithSourceName } from '../types/assessment.types'
import type { ClientSource } from '@/lib/types/client-source'
import type { CourseInfo } from '@/lib/types/course-info-types'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { countTokens, truncateToTokenLimit, logAssessmentDebug } from '../utils/generalHelpers'
import { TOKEN_CONTEXT_BUDGET, langDirective, MAX_CHUNKS_PER_SOURCE } from '../config/constants'

export async function prepareSourceContent(
  selectedSources: ClientSource[] | undefined,
  courseInfo: CourseInfo | undefined,
  language: 'en' | 'id',
): Promise<string> {
  // Selected sources handling: if items include an explicit `selected` flag, use it;
  // otherwise, treat any non-empty array as selected (backward compatibility with clients
  // that only send selected items without the flag)
  let hasSelectedSources = false
  let effectiveSources: ClientSource[] = []

  if (Array.isArray(selectedSources) && selectedSources.length > 0) {
    const anyHasSelectedFlag = selectedSources.some((s: ClientSource) => 'selected' in s)
    effectiveSources = anyHasSelectedFlag
      ? (selectedSources as ClientSource[]).filter((s) => s.selected)
      : (selectedSources as ClientSource[])
    hasSelectedSources = effectiveSources.length > 0
  }

  logAssessmentDebug(
    'Selected sources count:',
    hasSelectedSources ? effectiveSources.length : 'No sources selected',
  )
  logAssessmentDebug(
    'Effective sources:',
    effectiveSources.map((s) => ({
      id: s.id,
      name: s.name,
      selected: s.selected,
    })),
  )

  let assistantContent = ''

  try {
    // Only retrieve chunks if there are selected sources
    if (hasSelectedSources) {
      logAssessmentDebug(
        'Attempting to retrieve chunks for sources:',
        effectiveSources.map((s) => s.id),
      )
      const retrievedChunks = await getStoredChunks(effectiveSources)
      logAssessmentDebug('Retrieved chunks:', retrievedChunks.length)
      logAssessmentDebug('Retrieved chunks sample:', retrievedChunks.slice(0, 2))
      logAssessmentDebug(
        'First few chunks preview:',
        retrievedChunks.slice(0, 3).map((c) => ({
          sourceId: c.sourceId,
          chunkLength: c.chunk?.length || 0,
          chunkPreview: c.chunk?.substring(0, 100) + '...',
          sourceType: c.sourceType,
          hasSourceName: !!c.sourceName,
        })),
      )

      if (retrievedChunks.length > 0) {
        // Process chunks to create a structured context
        let structuredContent = 'SOURCE MATERIALS:\n\n'

        // Group chunks by source
        const sourceGroups = new Map<string, ChunkWithSourceName[]>()

        retrievedChunks.forEach((chunk) => {
          const chunkObj = chunk as unknown as ChunkWithSourceName
          const sourceName = chunkObj.sourceName || 'Unknown Source'
          if (!sourceGroups.has(sourceName)) {
            sourceGroups.set(sourceName, [])
          }
          sourceGroups.get(sourceName)!.push(chunkObj)
        })

        // Format chunks by source for better context
        let chunkIndex = 1
        for (const [sourceName, chunks] of sourceGroups.entries()) {
          structuredContent += `SOURCE: ${sourceName}\n\n`

          // Sort chunks by order if available
          const sortedChunks = [...chunks].sort((a, b) =>
            a.order !== undefined && b.order !== undefined ? a.order - b.order : 0,
          )

          // For large chunk sets, prioritize the first chunks which typically contain introduction/overview
          const chunksToInclude = sortedChunks.slice(
            0,
            Math.min(sortedChunks.length, MAX_CHUNKS_PER_SOURCE),
          )
          logAssessmentDebug(
            `Including ${chunksToInclude.length} chunks out of ${sortedChunks.length} total chunks for source: ${sourceName}`,
          )

          chunksToInclude.forEach((chunkObj) => {
            structuredContent += `EXCERPT ${chunkIndex}:\n${chunkObj.chunk}\n\n`
            chunkIndex++
          })

          structuredContent += '---\n\n'
        }

        // If the content is too large, we need to summarize it to fit within context window
        if (countTokens(structuredContent) > TOKEN_CONTEXT_BUDGET) {
          logAssessmentDebug(
            `Content too large (${countTokens(structuredContent)} tokens), truncating to fit context window (${TOKEN_CONTEXT_BUDGET} tokens)`,
          )
          const originalContent = structuredContent
          structuredContent = truncateToTokenLimit(structuredContent, TOKEN_CONTEXT_BUDGET)
          logAssessmentDebug('Original content length:', originalContent.length)
          logAssessmentDebug('Truncated content length:', structuredContent.length)
          logAssessmentDebug(
            'Truncated content preview:',
            structuredContent.substring(0, 500) + '...',
          )
        } else {
          logAssessmentDebug(
            `Content fits within context budget (${countTokens(structuredContent)} tokens <= ${TOKEN_CONTEXT_BUDGET} tokens)`,
          )
        }

        logAssessmentDebug(`Final context size: ${countTokens(structuredContent)} tokens`)
        logAssessmentDebug(
          'Structured content preview:',
          structuredContent.substring(0, 500) + '...',
        )
        logAssessmentDebug(
          'Structured content includes SOURCE MATERIALS marker:',
          structuredContent.includes('SOURCE MATERIALS:'),
        )
        assistantContent = `${langDirective(language)}\n\n${structuredContent}`
        logAssessmentDebug(
          'Final assistantContent includes SOURCE MATERIALS:',
          assistantContent.includes('SOURCE MATERIALS:'),
        )
        logAssessmentDebug('Final assistantContent length:', assistantContent.length)
      } else {
        logAssessmentDebug('No chunks retrieved despite having selected sources')
      }
    }

    // Handle case where sources were selected but assistantContent is still empty
    if (hasSelectedSources && !assistantContent) {
      // Sources were selected but produced zero chunks; still indicate SOURCE MATERIALS to prevent course-title fallback
      logAssessmentDebug(
        'Sources selected but no chunks retrieved; setting minimal SOURCE MATERIALS context',
      )
      assistantContent = `${langDirective(language)}\n\nSOURCE MATERIALS:\n\n` // minimal marker to trigger source-only behavior in downstream prompts
    }

    // If no sources were selected, use a course-specific prompt
    if (!hasSelectedSources) {
      logAssessmentDebug('No sources selected, using course-specific prompt')
      assistantContent = buildCourseSpecificPrompt(courseInfo, language)
    }
  } catch (error) {
    console.error('Error retrieving knowledge:', error)
    // Handle error case: if sources were selected, maintain SOURCE MATERIALS context
    if (hasSelectedSources) {
      logAssessmentDebug(
        'Error retrieving sources but sources were selected; setting minimal SOURCE MATERIALS context',
      )
      assistantContent = `${langDirective(language)}\n\nSOURCE MATERIALS:\n\n` // minimal marker to trigger source-only behavior
    } else {
      // Use course-specific prompt only when no sources were selected
      assistantContent = buildCourseSpecificPrompt(courseInfo, language)
    }
  }

  return assistantContent
}

function buildCourseSpecificPrompt(
  courseInfo: CourseInfo | undefined,
  language: 'en' | 'id',
): string {
  if (courseInfo?.courseCode && courseInfo?.courseName) {
    return language === 'id'
      ? `${langDirective(language)}\n\nHasilkan asesmen untuk mata kuliah "${courseInfo.courseCode} ${courseInfo.courseName}".

Sebagai ahli di bidang ini, buat konten yang sesuai untuk tingkat universitas.

${courseInfo.courseDescription ? `Deskripsi mata kuliah: ${courseInfo.courseDescription}` : ''}

Untuk asesmen ini:
1. Sertakan pertanyaan yang menguji pemahaman konsep inti ${courseInfo.courseName}
2. Cakup berbagai topik yang umum dalam kurikulum ${courseInfo.courseName}
3. Sesuaikan tingkat kesulitan
4. Gabungkan aspek teoritis dan praktis jika relevan
5. Pastikan pertanyaan jelas, tidak ambigu, dan akademik.
`
      : `${langDirective(language)}\n\nGenerate an assessment for the course "${courseInfo.courseCode} ${courseInfo.courseName}".

As an expert in the field, create content suitable for a university context.

${courseInfo.courseDescription ? `Course description: ${courseInfo.courseDescription}` : ''}

For this assessment:
1. Include questions that test understanding of core ${courseInfo.courseName} concepts.
2. Cover a range of topics commonly found in the ${courseInfo.courseName} curriculum.
3. Calibrate difficulty appropriately.
4. Combine theoretical and practical aspects where relevant.
5. Ensure questions are clear, unambiguous, and academic in tone.
`
  }

  return language === 'id'
    ? `${langDirective(language)}\n\nHasilkan asesmen berdasarkan pengetahuan kurikulum standar untuk mata kuliah ini.

Instruksi:
1. Gunakan konsep inti dan teori umum.
2. Pastikan keragaman topik.
3. Jaga konsistensi tingkat kesulitan.
`
    : `${langDirective(language)}\n\nGenerate an assessment based on standard curriculum knowledge for this course.

Instructions:
1. Use core concepts and common theories.
2. Ensure a diversity of topics.
3. Maintain consistent difficulty.
`
}
