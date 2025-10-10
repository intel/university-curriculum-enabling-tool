// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { ContextChunk } from '@/lib/types/context-chunk'
import type { ClientSource } from '@/lib/types/client-source'
import type { CourseInfo } from '@/lib/types/course-info-types'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import type { AssessmentQuestion } from './types'
import { fallbackDiscussionIdeas } from './fallback-content'
import { jsonrepair } from 'jsonrepair'

// Configuration constants
export const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
export const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
export const TOKEN_RESPONSE_RATIO = Number.parseFloat(
  process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7',
)
export const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
export const TOKEN_CONTEXT_BUDGET = 500

export function countTokens(text: string): number {
  return text.split(/\s+/).length
}

// Utility function to truncate text to fit within token limit
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) {
    return text
  }

  // Simple truncation approach - could be improved with smarter summarization
  const words = text.split(' ')
  let result = ''
  let currentTokens = 0

  for (const word of words) {
    const wordTokens = countTokens(word + ' ')
    if (currentTokens + wordTokens > maxTokens) {
      break
    }
    result += word + ' '
    currentTokens += wordTokens
  }

  return result.trim() + '...'
}

// Safe wrapper around jsonrepair to guard against exceptions and return original text on failure
export function safeJsonRepair(text: string): string {
  try {
    return jsonrepair(text)
  } catch (err) {
    console.warn('jsonrepair failed, using original text:', err)
    return text
  }
}

// Utility function to safely parse JSON with fallbacks
export function safeJsonParse(jsonString: string, fallback: unknown = {}) {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return fallback
  }
}

// Lightweight cleanup that fixes common JSON issues without external libraries
export function basicJsonCleanup(json: string): string {
  try {
    let s = json
    // Remove non-printable characters
    s = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Remove trailing commas in objects/arrays
    s = s.replace(/,(\s*[}\]])/g, '$1')
    // Quote unquoted object keys
    s = s.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
    // Quote simple bareword values (conservative)
    s = s.replace(/:\s*([^"{}\[\],\s][^{}\[\],]*?)(\s*[,}])/g, ':"$1"$2')
    return s
  } catch (e) {
    console.warn('basicJsonCleanup failed; returning original string:', e)
    return json
  }
}

/**
 * Extracts JSON content from code-fenced blocks (e.g., ```json ... ```) within the input text.
 * Employs multiple fallback strategies to maximize the chance of retrieving valid JSON:
 * 1. Returns the first code-fenced block that parses as JSON.
 * 2. Attempts to repair and parse each block using `jsonrepair` if direct parsing fails.
 * 3. If multiple blocks are present, tries to combine all parseable blocks into a JSON array.
 * 4. If all else fails, returns the first code-fenced block or the trimmed original text.
 *
 * @param {string} text - The input string potentially containing code-fenced JSON blocks.
 * @returns {string} The extracted or repaired JSON string, or the original text if extraction fails.
 */

// Utility function to extract JSON from code-fenced blocks in text.
function stripCodeFences(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` fences if present.
  // If multiple code fences are present, prefer returning the first valid JSON block.
  // If none are individually valid, attempt to return a JSON array of all parseable blocks.
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi
  const contents: string[] = []
  let match: RegExpExecArray | null
  while ((match = fenceRegex.exec(text)) !== null) {
    contents.push(match[1].trim())
  }
  if (contents.length > 0) {
    // 1) Try to return the first block that parses as JSON
    for (const block of contents) {
      try {
        JSON.parse(block)
        return block
      } catch {
        // Try lightweight cleanup before falling back to jsonrepair
        try {
          const cleaned = basicJsonCleanup(block)
          JSON.parse(cleaned)
          return cleaned
        } catch {
          // continue
        }
        try {
          const repaired = safeJsonRepair(block)
          JSON.parse(repaired)
          return repaired
        } catch {
          // continue checking next block
        }
      }
    }

    // 2) Try to combine all parseable blocks into a JSON array
    const parsedItems: unknown[] = []
    let allParsed = true
    for (const block of contents) {
      try {
        parsedItems.push(JSON.parse(block))
      } catch {
        try {
          parsedItems.push(JSON.parse(basicJsonCleanup(block)))
        } catch {
          try {
            parsedItems.push(JSON.parse(safeJsonRepair(block)))
          } catch {
            allParsed = false
            break
          }
        }
      }
    }
    if (allParsed) {
      return JSON.stringify(parsedItems)
    }

    // 3) Fallback: return the first block (better than concatenation which may be invalid JSON)
    return contents[0]
  }
  return text.trim()
}

// More robust JSON extraction function
export function extractAndParseJSON(text: string) {
  const input = stripCodeFences(text)
  try {
    return JSON.parse(input)
  } catch {
    // Try jsonrepair on the whole response first
    try {
      return JSON.parse(safeJsonRepair(input))
    } catch {
      console.log('Failed to parse entire response as JSON, attempting to extract JSON...')
    }

    // Try to extract JSON object or array from the text using regex
    const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/
    const match = input.match(jsonRegex)

    if (match && match[0]) {
      const candidate = stripCodeFences(match[0])
      // Try direct parse
      try {
        return JSON.parse(candidate)
      } catch {
        console.log('Failed to parse extracted JSON, attempting cleanup/repair...')
      }

      // Try jsonrepair on the extracted candidate
      try {
        return JSON.parse(safeJsonRepair(candidate))
      } catch {
        // Fallback minimal cleanup
        const cleanedJSON = candidate
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
          .replace(/:\s*([^"{}[\],\s][^{}[\],]*?)(\s*[,}])/g, ':"$1"$2')

        try {
          return JSON.parse(cleanedJSON)
        } catch {
          console.log('All JSON parsing attempts failed, returning empty object')
          return {}
        }
      }
    }

    console.log('No JSON object found in response')
    return {}
  }
}

// Prepare source content for the AI model
export async function prepareSourceContent(
  selectedSources: ClientSource[],
  topicName?: string,
  courseInfo?: CourseInfo,
) {
  try {
    // Check if we have any selected sources
    const selectedSourcesFiltered = selectedSources?.filter((source) => source.selected) || []
    // If no sources are selected, create course-based content
    if (selectedSourcesFiltered.length === 0) {
      console.log('No sources selected, using course context for content generation')
      const courseContent = `COURSE CONTEXT:\n\n`
      let structuredContent = courseContent
      if (courseInfo) {
        structuredContent += `Course: ${courseInfo.courseCode || ''} ${courseInfo.courseName || 'Academic Course'}\n`
        structuredContent += `Semester: ${courseInfo.semester || 'Current Semester'}\n`
        structuredContent += `Academic Year: ${courseInfo.academicYear || 'Current Academic Year'}\n\n`
      }
      structuredContent += `Topic: ${topicName || 'Course Topic'}\n\n`
      structuredContent += `GENERAL KNOWLEDGE CONTEXT:\n`
      structuredContent += `Since no specific source materials were provided, this content should be generated based on:\n`
      structuredContent += `1. Standard academic knowledge for the topic "${topicName}"\n`
      structuredContent += `2. Common educational practices and pedagogical approaches\n`
      structuredContent += `3. Typical curriculum content for this subject area\n`
      structuredContent += `4. Best practices in educational content development\n\n`
      const sourceMetadata = {
        sourceCount: 0,
        chunkCount: 0,
        tokenEstimate: countTokens(structuredContent),
        sourceNames: [],
        usingCourseContext: true,
      }
      return { content: structuredContent, metadata: sourceMetadata }
    }

    // Use the getStoredChunks function to retrieve chunks from Payload CMS
    const retrievedChunks = await getStoredChunks(selectedSourcesFiltered)
    console.log('Retrieved chunks:', retrievedChunks.length)

    if (retrievedChunks.length === 0) {
      // If we have selected sources but no chunks found, fallback to course context
      console.log('No content found in selected sources, falling back to course context')
      const courseContent = `COURSE CONTEXT (Source Fallback):\n\n`
      let structuredContent = courseContent
      if (courseInfo) {
        structuredContent += `Course: ${courseInfo.courseCode || ''} ${courseInfo.courseName || 'Academic Course'}\n`
        structuredContent += `Semester: ${courseInfo.semester || 'Current Semester'}\n`
        structuredContent += `Academic Year: ${courseInfo.academicYear || 'Current Academic Year'}\n\n`
      }
      structuredContent += `Topic: ${topicName || 'Course Topic'}\n\n`
      structuredContent += `GENERAL KNOWLEDGE CONTEXT:\n`
      structuredContent += `Content should be generated based on standard academic knowledge for "${topicName}"\n\n`
      const sourceMetadata = {
        sourceCount: 0,
        chunkCount: 0,
        tokenEstimate: countTokens(structuredContent),
        sourceNames: [],
        usingCourseContext: true,
      }
      return { content: structuredContent, metadata: sourceMetadata }
    }

    // Process chunks to create a more structured context
    let structuredContent = 'SOURCE MATERIALS:\n\n'

    // Group chunks by source
    const sourceGroups = new Map<string, ContextChunk[]>()

    retrievedChunks.forEach((chunk) => {
      const sourceName = chunk.sourceName || 'Unknown Source'
      if (!sourceGroups.has(sourceName)) {
        sourceGroups.set(sourceName, [])
      }
      sourceGroups.get(sourceName)!.push(chunk)
    })

    // Format chunks by source for better context
    let chunkIndex = 1
    for (const [sourceName, chunks] of sourceGroups.entries()) {
      structuredContent += `SOURCE: ${sourceName}\n\n`

      // Sort chunks by order if available
      const sortedChunks = [...chunks].sort((a, b) =>
        a.order !== undefined && b.order !== undefined ? a.order - b.order : 0,
      )

      sortedChunks.forEach((chunkObj) => {
        structuredContent += `EXCERPT ${chunkIndex}:\n${chunkObj.chunk}\n\n`
        chunkIndex++
      })

      structuredContent += '---\n\n'
    }

    // If the content is too large, we need to summarize it to fit within context window
    if (countTokens(structuredContent) > TOKEN_CONTEXT_BUDGET) {
      console.log(
        `Content too large (${countTokens(structuredContent)} tokens), summarizing to fit context window`,
      )

      // Take the most important parts - beginning, some middle, and end of each source
      let summarizedContent = 'SOURCE MATERIALS (SUMMARIZED):\n\n'

      for (const [sourceName, chunks] of sourceGroups.entries()) {
        summarizedContent += `SOURCE: ${sourceName}\n\n`

        // Sort chunks by order
        const sortedChunks = [...chunks].sort((a, b) =>
          a.order !== undefined && b.order !== undefined ? a.order - b.order : 0,
        )

        // Take first chunk
        if (sortedChunks.length > 0) {
          summarizedContent += `BEGINNING EXCERPT:\n${sortedChunks[0].chunk}\n\n`
        }

        // Take a middle chunk if available
        if (sortedChunks.length > 2) {
          const middleIndex = Math.floor(sortedChunks.length / 2)
          summarizedContent += `MIDDLE EXCERPT:\n${sortedChunks[middleIndex].chunk}\n\n`
        }

        // Take last chunk if different from first
        if (sortedChunks.length > 1) {
          summarizedContent += `END EXCERPT:\n${sortedChunks[sortedChunks.length - 1].chunk}\n\n`
        }

        summarizedContent += '---\n\n'
      }

      structuredContent = summarizedContent
    }

    console.log(`Final context size: ${countTokens(structuredContent)} tokens`)

    // Create source metadata for the response
    const sourceMetadata = {
      sourceCount: sourceGroups.size,
      chunkCount: retrievedChunks.length,
      tokenEstimate: countTokens(structuredContent),
      sourceNames: Array.from(sourceGroups.keys()),
      usingCourseContext: false,
    }

    return { content: structuredContent, metadata: sourceMetadata }
  } catch (error) {
    console.error('Error retrieving knowledge:', error)
    return {
      content: 'An error occurred while retrieving knowledge from the selected sources.',
      metadata: {
        sourceCount: 0,
        chunkCount: 0,
        tokenEstimate: 0,
        sourceNames: [],
        usingCourseContext: false,
      },
    }
  }
}

// Updated parseQuestionsText function to handle the new simplified discussion format
export function parseQuestionsText(text: string, assessmentType: string): AssessmentQuestion[] {
  const questions: AssessmentQuestion[] = []

  try {
    // Handle different assessment types
    if (assessmentType.toLowerCase().includes('quiz')) {
      // Split by blank lines and look for question patterns
      const sections = text.split(/\n\s*\n/)

      for (const section of sections) {
        try {
          // Using multiline regex without 's' flag
          const questionMatch = section.match(/QUESTION:\s*([\s\S]*?)(?=\s*[A-D]\.|\s*CORRECT|$)/)

          // Improved regex to capture options with their letter labels
          const optionsMatches = Array.from(
            section.matchAll(/([A-D])\.\s*([\s\S]*?)(?=\s*[A-D]\.|\s*CORRECT|$)/g),
          )
          const correctAnswerMatch = section.match(/CORRECT ANSWER:\s*([A-D])/)
          const explanationMatch = section.match(/EXPLANATION:\s*([\s\S]*?)$/)

          if (questionMatch) {
            const question = questionMatch[1].trim()

            // Extract options text only (without the A., B., etc. prefixes)
            const options = optionsMatches.map((match) => match[2].trim())

            // If no options were found with the regex, try a simpler approach
            let finalOptions = options.length > 0 ? options : []

            // If still no options, try to extract them with a simpler pattern
            if (finalOptions.length === 0) {
              // Look for lines starting with A., B., C., D.
              const simpleOptionMatches = section.match(/[A-D]\.\s*(.*?)(?:\n|$)/g)
              if (simpleOptionMatches) {
                finalOptions = simpleOptionMatches.map((opt) =>
                  opt.replace(/^[A-D]\.\s*/, '').trim(),
                )
              }
            }

            // Ensure correctAnswer is never undefined
            const correctAnswer = correctAnswerMatch ? correctAnswerMatch[1].trim() : 'A'
            const explanation = explanationMatch
              ? explanationMatch[1].trim()
              : 'No explanation provided.'

            questions.push({
              question,
              options: finalOptions,
              correctAnswer,
              explanation,
              pointAllocation: 'Default', // Add a suitable default or calculated value
            })
          }
        } catch (error) {
          console.error('Error parsing quiz question:', error)
        }
      }
    } else if (assessmentType.toLowerCase().includes('discussion')) {
      // Split by blank lines and look for discussion patterns
      const sections = text.split(/\n\s*\n/)

      for (const section of sections) {
        try {
          // Sanitize the section text to remove problematic characters
          const sanitizedSection = section.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')

          // Part 1: Extract question and correct answer (guidance)
          const discussionMatch = sanitizedSection.match(
            /(?:DISCUSSION|QUESTION):\s*([\s\S]*?)(?=\s*GUIDANCE|\s*CORRECT ANSWER|\s*MODEL ANSWER|\s*EXPLANATION|$)/i,
          )
          const guidanceMatch = sanitizedSection.match(
            /(?:GUIDANCE|CORRECT ANSWER):\s*([\s\S]*?)(?=\s*MODEL ANSWER|\s*EXPLANATION|$)/i,
          )

          // Part 2: Extract model answer and explanation
          const modelAnswerMatch = sanitizedSection.match(
            /MODEL ANSWER:\s*([\s\S]*?)(?=\s*EXPLANATION|$)/i,
          )
          const explanationMatch = sanitizedSection.match(/EXPLANATION:\s*([\s\S]*?)$/i)

          if (discussionMatch) {
            const question = discussionMatch[1].trim()
            // Ensure correctAnswer is never undefined
            const correctAnswer = guidanceMatch
              ? guidanceMatch[1].trim()
              : 'Discussion should cover key aspects of the topic.'

            // Extract model answer and explanation
            const modelAnswer = modelAnswerMatch
              ? modelAnswerMatch[1].trim()
              : 'A comprehensive answer would address key aspects of the topic.'

            const explanation = explanationMatch
              ? explanationMatch[1].trim()
              : 'This question helps students explore important concepts.'

            questions.push({
              question,
              correctAnswer,
              modelAnswer,
              explanation,
              pointAllocation: 'Default', // Add a suitable default or calculated value
            })
          }
        } catch (error) {
          console.error('Error parsing discussion question:', error)
        }
      }
    } else {
      // Generic question pattern
      const sections = text.split(/\n\s*\n/)

      for (const section of sections) {
        try {
          // Using multiline regex without 's' flag
          const questionMatch = section.match(/QUESTION:\s*([\s\S]*?)(?=\s*MODEL|$)/)
          const answerMatch = section.match(/MODEL ANSWER:\s*([\s\S]*?)(?=\s*EXPLANATION|$)/)
          const explanationMatch = section.match(/EXPLANATION:\s*([\s\S]*?)$/)

          if (questionMatch) {
            const question = questionMatch[1].trim()
            // Ensure correctAnswer is never undefined
            const correctAnswer = answerMatch
              ? answerMatch[1].trim()
              : 'See explanation for guidance.'
            const explanation = explanationMatch
              ? explanationMatch[1].trim()
              : 'No explanation provided.'

            questions.push({
              question,
              correctAnswer,
              explanation,
              pointAllocation: 'Default', // Add a suitable default or calculated value
            })
          }
        } catch (error) {
          console.error('Error parsing generic question:', error)
        }
      }
    }
  } catch (error) {
    console.error('Error parsing questions text:', error)
  }

  // If no questions were successfully parsed, add a fallback question
  if (questions.length === 0) {
    // Use fallbackDiscussionIdeas instead of hardcoded questions
    fallbackDiscussionIdeas.forEach((idea) => {
      // Add first example question if it exists
      if (idea.exampleQuestions[0]) {
        questions.push({
          question: idea.exampleQuestions[0].question,
          correctAnswer: idea.exampleQuestions[0].correctAnswer,
          explanation: idea.exampleQuestions[0].explanation,
          pointAllocation: idea.exampleQuestions[0].pointAllocation,
        })
      }
      // Add second example question if it exists
      if (idea.exampleQuestions[1]) {
        questions.push({
          question: idea.exampleQuestions[1].question,
          correctAnswer: idea.exampleQuestions[1].correctAnswer,
          explanation: idea.exampleQuestions[1].explanation,
          pointAllocation: idea.exampleQuestions[1].pointAllocation,
        })
      }
    })
  }
  return questions
}

// Get content type prompt
export function getContentTypePrompt(type: string) {
  const contentPrompts = {
    lecture: `Create a comprehensive lecture that includes:
  - Clear, measurable learning outcomes
  - At least 5-10 key terms with detailed definitions
  - An engaging introduction that sets relevance and context
  - At least 5-10 detailed slides with substantial teaching material on each slide
  - Comprehensive speaker notes for each slide with examples and additional explanations
  - In-class activities with clear instructions and objectives
  - Specific assessment ideas aligned to the learning outcomes
  - Suggested further readings with brief annotations`,

    tutorial: `Create a detailed tutorial that includes:
  - Specific learning outcomes that build practical skills
  - At least 5-10 key terms with detailed definitions
  - Clear step-by-step instructions with examples and explanations
  - Scaffolded exercises with increasing difficulty
  - Sample solutions with detailed reasoning
  - Common misconceptions and how to address them
  - Formative assessment opportunities throughout the tutorial
  - Reflection points to consolidate learning
  - Practical applications that show real-world relevance
  - Differentiated activities for varying skill levels`,

    workshop: `Create an interactive workshop that includes:
  - Clear learning outcomes focused on skill development
  - At least 5-10 key terms with detailed definitions
  - Hands-on collaborative activities with detailed instructions
  - Comprehensive facilitator notes for each activity
  - Required materials list with specific quantities and preparation notes
  - Timing guide for each section of the workshop
  - Discussion prompts that connect activities to learning objectives
  - Reflection questions for participants
  - Formative assessment methods to measure skill achievement
  - Guidance for managing group dynamics and participation`,
  }
  return contentPrompts[type as keyof typeof contentPrompts] || contentPrompts.lecture
}

// Get content style prompt
export function getContentStylePrompt(style: string) {
  const stylePrompts = {
    interactive: `Create highly interactive content with:
  - Discussion questions throughout
  - Think-pair-share activities
  - Student-led components
  - Opportunities for reflection
  - Real-time feedback mechanisms`,

    caseStudy: `Structure case-study-based content with:
  - Detailed real-world examples
  - Analysis questions
  - Application exercises
  - Problem-solving components
  - Critical thinking prompts`,

    problemBased: `Focus on problem-based learning with:
  - A central problem statement
  - Guided inquiry activities
  - Research components
  - Collaborative problem solving
  - Solution development and presentation`,

    traditional: `Use a traditional lecture format with:
  - Clear section transitions
  - Systematic topic development
  - Comprehensive coverage
  - Summary points
  - Review questions`,
  }
  return stylePrompts[style as keyof typeof stylePrompts] || stylePrompts.traditional
}

// Get difficulty level prompt
export function getDifficultyLevelPrompt(level: string) {
  const difficultyPrompts = {
    introductory: `Target first-year undergraduate level:
  - Define all domain-specific terms
  - Include more background context
  - Provide many examples
  - Avoid complex theoretical models
  - Focus on foundational concepts`,

    intermediate: `Target mid-level undergraduate:
  - Build on foundational knowledge
  - Introduce more specialized terminology
  - Include some theoretical frameworks
  - Expect basic prior knowledge
  - Balance theory and application`,

    advanced: `Target advanced level (final-year undergraduate or postgraduate):
  - Assume a strong knowledge background
  - Discuss complex theories
  - Include current research
  - Cover nuances and exceptions
  - Emphasize critical analysis`,
  }
  return (
    difficultyPrompts[level as keyof typeof difficultyPrompts] || difficultyPrompts.intermediate
  )
}
