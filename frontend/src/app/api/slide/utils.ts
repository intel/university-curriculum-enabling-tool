import type { ContextChunk } from '@/lib/types/context-chunk'
import type { ClientSource } from '@/lib/types/client-source'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import type { AssessmentQuestion } from './types'
import { fallbackDiscussionIdeas } from './fallback-content'

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

// Utility function to safely parse JSON with fallbacks
export function safeJsonParse(jsonString: string, fallback: unknown = {}) {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return fallback
  }
}

// More robust JSON extraction function
export function extractAndParseJSON(text: string) {
  try {
    // First try to parse the entire text as JSON
    return JSON.parse(text)
  } catch {
    console.log('Failed to parse entire response as JSON, attempting to extract JSON...')

    // Try to extract JSON object or array from the text using regex
    const jsonRegex = /(\{[\s\S]*\}|\[[\s\S]*\])/
    const match = text.match(jsonRegex)

    if (match && match[0]) {
      try {
        return JSON.parse(match[0])
      } catch {
        console.log('Failed to parse extracted JSON, attempting cleanup...')

        // Try to clean up common issues and parse again
        const cleanedJSON = match[0]
          // Fix trailing commas
          .replace(/,(\s*[}\]])/g, '$1')
          // Fix missing quotes around property names
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
          // Fix unquoted string values
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
export async function prepareSourceContent(selectedSources: ClientSource[]) {
  try {
    // Use the getStoredChunks function to retrieve chunks from Payload CMS
    const retrievedChunks = await getStoredChunks(selectedSources)
    console.log('Retrieved chunks:', retrievedChunks.length)

    if (retrievedChunks.length === 0) {
      throw new Error('No content found in the selected sources.')
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
    lecture: `Create a comprehensive lecture including:
- Clear, measurable learning outcomes
- At least 5-10 key terms with detailed definitions
- Engaging introduction that establishes relevance and context
- At least 5-10 detailed slides with substantial teaching material on each slide
- Comprehensive speaker notes for each slide with additional examples and explanations
- Relevant in-class activities with clear instructions and purpose
- Specific assessment ideas that align with learning outcomes
- Annotated further reading suggestions with brief descriptions`,

    tutorial: `Create a detailed tutorial including:
- Specific learning outcomes that build practical skills
- At least 5-10 key terms with detailed definitions
- Clear step-by-step instructions with examples and explanations
- Scaffolded practice exercises with increasing difficulty
- Sample solutions with detailed explanations of the process
- Common misconceptions and how to address them
- Formative assessment opportunities throughout
- Reflection points to consolidate learning
- Practical applications that demonstrate real-world relevance
- Differentiated activities for various skill levels`,

    workshop: `Create an interactive workshop including:
- Clear learning outcomes focused on skills development
- At least 5-10 key terms with detailed definitions
- Hands-on collaborative activities with detailed instructions
- Comprehensive facilitator notes for each activity
- Required materials with specific quantities and preparation notes
- Timing guidelines for each section of the workshop
- Discussion prompts that connect activities to learning objectives
- Reflection questions for participants
- Formative assessment methods that measure skill acquisition
- Guidance for managing group dynamics and participation`,
  }
  return contentPrompts[type as keyof typeof contentPrompts] || contentPrompts.lecture
}

// Get content style prompt
export function getContentStylePrompt(style: string) {
  const stylePrompts = {
    interactive: `Make the content highly interactive with:
  - Discussion questions throughout
  - Think-pair-share activities
  - Student-led components
  - Opportunities for reflection
  - Real-time feedback mechanisms`,

    caseStudy: `Structure content around case studies with:
  - Detailed real-world examples
  - Analysis questions
  - Application exercises
  - Problem-solving components
  - Critical thinking prompts`,

    problemBased: `Focus on problem-based learning with:
  - Central problem statements
  - Guided inquiry activities
  - Research components
  - Collaborative problem-solving
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
  - Define all specialized terms
  - Include more background context
  - Provide numerous examples
  - Avoid complex theoretical models
  - Focus on foundational concepts`,

    intermediate: `Target mid-program undergraduate level:
  - Build on foundational knowledge
  - Introduce more specialized terminology
  - Include some theoretical frameworks
  - Expect basic prior knowledge
  - Balance theory and application`,

    advanced: `Target final-year undergraduate or graduate level:
  - Assume strong background knowledge
  - Engage with complex theories
  - Include current research
  - Address nuances and exceptions
  - Emphasize critical analysis`,
  }
  return (
    difficultyPrompts[level as keyof typeof difficultyPrompts] || difficultyPrompts.intermediate
  )
}
