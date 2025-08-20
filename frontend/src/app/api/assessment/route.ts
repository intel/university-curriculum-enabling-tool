// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Source } from '../../../payload-types'
import { NextResponse } from 'next/server'
import { createOllama } from 'ollama-ai-provider'
import { type CoreMessage, generateText } from 'ai'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import type { ClientSource } from '@/lib/types/client-source'
import type { AssessmentQuestion, ExplanationObject } from '@/lib/types/assessment-types'
import type { ProjectRubric, ProjectRubricCriterion } from '@/lib/types/project-rubric-criterion'
import type { CourseInfo } from '@/lib/types/course-info-types'

type OllamaFn = ReturnType<typeof createOllama>
type ExtractedJson = {
  type?: string
  duration?: string
  description?: string
  questions?: unknown[]
}
type GeneratedQuestion = { question: string; type: string } | string
type AssessmentMetadata = {
  type: string
  duration: string
  description: string
}
type ChunkWithSourceName = {
  id: number
  source: number | Source
  chunk: string
  order: number
  updatedAt: string
  createdAt: string
  sourceName?: string
}
export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_RATIO = Number.parseFloat(process.env.RESPONSE_TOKEN_PERCENTAGE || '0.7')
const TOKEN_RESPONSE_BUDGET = Math.floor(TOKEN_MAX * TOKEN_RESPONSE_RATIO)
const TOKEN_CONTEXT_BUDGET = 500

// Update the getDefaultDuration function to ensure exam duration is 2 hours
const getDefaultDuration = (assessmentType: string): string => {
  switch (assessmentType.toLowerCase()) {
    case 'quiz':
      return '30 minutes'
    case 'test':
      return '1 hour'
    case 'exam':
      return '2 hours' // Ensure exam is always 2 hours
    case 'assignment':
      return '1 week'
    case 'project':
      return '2 weeks'
    case 'discussion':
      return '45 minutes'
    default:
      return '1 hour'
  }
}

// Utility function to count tokens (simple approximation)
function countTokens(text: string): number {
  return text.split(/\s+/).length
}

// Utility function to truncate text to fit within token limit
function truncateToTokenLimit(text: string, maxTokens: number): string {
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

// Improve the extractJsonFromText function to be more robust
function extractJsonFromText(text: string): string | null {
  try {
    // Clean up the text first - remove markdown code block markers
    const cleanedText = text.replace(/```json|```/g, '').trim()

    // First, try to parse the entire text as JSON directly
    try {
      JSON.parse(cleanedText)
      console.log('Direct JSON parsing successful')
      return cleanedText // If it parses successfully, return the entire text
    } catch {
      console.log('Direct parsing failed, trying alternative extraction methods')
    }

    // Look for JSON array pattern with more flexible regex
    const arrayRegex = /(\[[\s\S]*?\])/g
    const arrayMatches = cleanedText.match(arrayRegex)

    if (arrayMatches && arrayMatches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of arrayMatches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          console.log('Found valid JSON array in text fragment')
          return sanitized
        } catch {
          // Continue to next match if this one isn't valid
          continue
        }
      }
    }

    // Look for JSON object pattern with more flexible regex
    const jsonRegex = /(\{[\s\S]*?\})/g
    const matches = cleanedText.match(jsonRegex)

    if (matches && matches.length > 0) {
      // Try each match until we find valid JSON
      for (const match of matches) {
        try {
          const sanitized = sanitizeJsonString(match)
          // Test if it's valid JSON by parsing it
          JSON.parse(sanitized)
          console.log('Found valid JSON in text fragment')
          return sanitized
        } catch {
          // Continue to next match if this one isn't valid
          continue
        }
      }
    }

    // If no valid JSON object found, try to extract JSON from the text
    // This handles cases where the JSON might be embedded in other text
    const startBrace = cleanedText.indexOf('{')
    const endBrace = cleanedText.lastIndexOf('}')
    const startBracket = cleanedText.indexOf('[')
    const endBracket = cleanedText.lastIndexOf(']')

    // Try to extract object
    if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
      const jsonCandidate = cleanedText.substring(startBrace, endBrace + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        console.log('Extracted JSON object from text using brace positions')
        return sanitized
      } catch (e) {
        console.log('Failed to parse JSON object extracted using brace positions:', e)
      }
    }

    // Try to extract array
    if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
      const jsonCandidate = cleanedText.substring(startBracket, endBracket + 1)
      try {
        const sanitized = sanitizeJsonString(jsonCandidate)
        JSON.parse(sanitized)
        console.log('Extracted JSON array from text using bracket positions')
        return sanitized
      } catch (e) {
        console.log('Failed to parse JSON array extracted using bracket positions:', e)
      }
    }

    // Try to extract specific fields if full JSON parsing fails
    const extractedJson: ExtractedJson = {}

    // Extract type
    const typeMatch = cleanedText.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedJson.type = typeMatch[1]
    }

    // Extract duration
    const durationMatch = cleanedText.match(/"duration"\s*:\s*"([^"]+)"/)
    if (durationMatch && durationMatch[1]) {
      extractedJson.duration = durationMatch[1]
    }

    // Extract description
    const descMatch = cleanedText.match(/"description"\s*:\s*"([^"]+)"/)
    if (descMatch && descMatch[1]) {
      extractedJson.description = descMatch[1]
    }

    // Extract questions array if present
    const questionsMatch = cleanedText.match(/"questions"\s*:\s*(\[[\s\S]*?\])/)
    if (questionsMatch && questionsMatch[1]) {
      try {
        extractedJson.questions = JSON.parse(questionsMatch[1])
        console.log('Extracted questions array from text')
      } catch (e) {
        console.log('Failed to parse extracted questions array:', e)
      }
    }

    // If we extracted any fields, return the constructed JSON
    if (Object.keys(extractedJson).length > 0) {
      console.log('Constructed JSON from extracted fields:', extractedJson)
      return JSON.stringify(extractedJson)
    }

    console.log('No valid JSON structure found in text')
    return null
  } catch (e) {
    console.error('Error in extractJsonFromText:', e)
    return null
  }
}

// Improve the sanitizeJsonString function to be more robust
function sanitizeJsonString(jsonString: string): string {
  try {
    // Remove any non-printable characters
    let cleaned = jsonString.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

    // Fix common JSON syntax issues
    cleaned = cleaned
      // Fix unescaped backslashes
      .replace(/(?<!\\)\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')
      // Fix unescaped quotes in strings
      .replace(/(?<!\\)"(?=(.*":\s*"))/g, '\\"')
      // Fix trailing commas in objects and arrays
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      // Fix missing quotes around property names
      .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3')
      // Fix newlines in string values
      .replace(/"\s*\n\s*([^"]*)"/g, '" $1"')
      // Fix missing commas between array elements
      .replace(/}(\s*){/g, '},\n$1{')
      .replace(/](\s*)\[/g, '],\n$1[')
      // Fix extra commas
      .replace(/,(\s*[}\]])/g, '$1')

    return cleaned
  } catch (e) {
    console.error('Error in sanitizeJsonString:', e)
    return jsonString // Return original if sanitization fails
  }
}

// Define the default project rubric with a more robust structure
const getDefaultProjectRubric = (): ProjectRubric => ({
  categories: {
    report: [
      {
        name: 'Content and Organization',
        weight: 20,
        description: 'Clarity, structure, and logical flow of the report.',
        levels: {
          excellent: 'Excellent organization with a clear and logical flow.',
          good: 'Good organization with a mostly clear flow.',
          average: 'Adequate organization, but some areas lack clarity.',
          acceptable: 'Poor organization, difficult to follow.',
          poor: 'No discernible organization.',
        },
      },
      {
        name: 'Technical Accuracy',
        weight: 20,
        description: 'Correctness and depth of technical information.',
        levels: {
          excellent: 'Demonstrates a deep and accurate understanding of technical concepts.',
          good: 'Demonstrates a good understanding of technical concepts with minor inaccuracies.',
          average:
            'Demonstrates an adequate understanding of technical concepts with some inaccuracies.',
          acceptable:
            'Demonstrates a poor understanding of technical concepts with significant inaccuracies.',
          poor: 'Demonstrates no understanding of technical concepts.',
        },
      },
      {
        name: 'Data Analysis and Interpretation',
        weight: 15,
        description: 'Quality of data analysis and interpretation of results.',
        levels: {
          excellent: 'Provides insightful and well-supported data analysis.',
          good: 'Provides good data analysis with reasonable interpretations.',
          average: 'Provides adequate data analysis, but interpretations are superficial.',
          acceptable: 'Provides poor data analysis with unsupported interpretations.',
          poor: 'No data analysis provided.',
        },
      },
    ],
    demo: [
      {
        name: 'Presentation Clarity',
        weight: 10,
        description: 'Clarity and effectiveness of the presentation.',
        levels: {
          excellent: 'Presents information clearly and engagingly.',
          good: 'Presents information clearly.',
          average: 'Presentation is understandable, but lacks clarity.',
          acceptable: 'Presentation is difficult to understand.',
          poor: 'No presentation provided.',
        },
      },
      {
        name: 'Technical Demonstration',
        weight: 10,
        description: 'Quality and functionality of the technical demonstration.',
        levels: {
          excellent: 'Demonstrates all technical aspects flawlessly.',
          good: 'Demonstrates most technical aspects effectively.',
          average: 'Demonstrates some technical aspects, but with issues.',
          acceptable: 'Demonstration is incomplete or non-functional.',
          poor: 'No demonstration provided.',
        },
      },
    ],
    individual: [
      {
        name: 'Individual Contribution',
        weight: 15,
        description: 'Demonstrated effort and contribution to the project.',
        levels: {
          excellent: 'Demonstrates exceptional effort and contribution.',
          good: 'Demonstrates significant effort and contribution.',
          average: 'Demonstrates adequate effort and contribution.',
          acceptable: 'Demonstrates minimal effort and contribution.',
          poor: 'No discernible contribution.',
        },
      },
    ],
  },
  markingScale: 'Marking Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5- Excellent.',
  totalMarks: 100,
  reportWeight: 55,
  demoWeight: 30,
  individualWeight: 15,
})

// Modify the generateProjectRubric function to separate generation and combination
async function generateProjectRubric(
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo: CourseInfo,
): Promise<ProjectRubric> {
  console.log(`Generating project rubric for ${difficultyLevel} level course...`)

  try {
    // Step 1: Generate report criteria
    const reportCriteria = await generateRubricSection(
      'report',
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    // Step 2: Generate demo criteria
    const demoCriteria = await generateRubricSection(
      'demo',
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    // Step 3: Generate individual criteria
    const individualCriteria = await generateRubricSection(
      'individual',
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    // Step 4: Combine all criteria into a complete rubric
    const defaultRubric = getDefaultProjectRubric()

    const combinedRubric: ProjectRubric = {
      categories: {
        report:
          reportCriteria && reportCriteria.length > 0
            ? reportCriteria
            : defaultRubric.categories.report,
        demo:
          demoCriteria && demoCriteria.length > 0 ? demoCriteria : defaultRubric.categories.demo,
        individual:
          individualCriteria && individualCriteria.length > 0
            ? individualCriteria
            : defaultRubric.categories.individual,
      },
      markingScale: 'Marking Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5- Excellent.',
      totalMarks: 100,
      reportWeight: 55,
      demoWeight: 30,
      individualWeight: 15,
    }

    console.log('Successfully generated project rubric with all sections')
    return combinedRubric
  } catch (error) {
    console.error('Error generating complete project rubric:', error)
    // Return default rubric if generation fails
    return getDefaultProjectRubric()
  }
}

// Add a new function to generate each section of the rubric separately
async function generateRubricSection(
  section: 'report' | 'demo' | 'individual',
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo: CourseInfo,
): Promise<ProjectRubricCriterion[]> {
  console.log(`Generating ${section} criteria for ${difficultyLevel} level course...`)

  const sectionTitles = {
    report: 'Report',
    demo: 'Demo Presentation',
    individual: 'Individual Contribution',
  }

  const systemPrompt = `You are an expert educational assessment developer for a university course. Create ${sectionTitles[section]} criteria for a ${difficultyLevel} level course in ${courseInfo.courseName || 'Big Data Storage and Management'}.

IMPORTANT INSTRUCTIONS:
1. Focus ONLY on creating criteria for the ${sectionTitles[section]} section.
2. For each criterion, provide detailed descriptions for each level: Excellent (5), Good (4), Average (3), Acceptable (2), and Poor (1).
3. Your response MUST be valid JSON only.

RESPONSE FORMAT:
[
  {
    "name": "Criterion 1",
    "weight": 10,
    "levels": {
      "excellent": "Description for excellent performance",
      "good": "Description for good performance",
      "average": "Description for average performance",
      "acceptable": "Description for acceptable performance",
      "poor": "Description for poor performance"
    }
  },
  {
    "name": "Criterion 2",
    "weight": 10,
    "levels": {
      "excellent": "Description for excellent performance",
      "good": "Description for good performance",
      "average": "Description for average performance",
      "acceptable": "Description for acceptable performance",
      "poor": "Description for poor performance"
    }
  }
]

DO NOT include any text, markdown, explanations, or other content outside the JSON array.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate ${sectionTitles[section]} criteria for ${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 3), // Ensure integer by using Math.floor
    })

    console.log(`${section} criteria response:`, response.text.substring(0, 100) + '...')

    // Try to parse the response as JSON
    try {
      const criteria = JSON.parse(response.text)
      if (Array.isArray(criteria)) {
        console.log(`Successfully parsed ${section} criteria directly`)
        return criteria
      }
    } catch {
      console.log(`Direct parsing of ${section} criteria failed, trying JSON extraction`)
    }

    // Try to extract JSON from the response
    const jsonStr = extractJsonFromText(response.text)
    if (jsonStr) {
      try {
        const criteria = JSON.parse(jsonStr)
        if (Array.isArray(criteria)) {
          console.log(`Successfully extracted and parsed ${section} criteria JSON`)
          return criteria
        }
      } catch (e) {
        console.error(`Failed to parse extracted ${section} criteria JSON:`, e)
      }
    }

    // If all extraction methods fail, return default criteria for this section
    console.log(`Using default ${section} criteria due to parsing failure`)
    return getDefaultProjectRubric().categories[section]
  } catch (error) {
    console.error(`Error generating ${section} criteria:`, error)
    return getDefaultProjectRubric().categories[section]
  }
}

// Generate project description based on course information and source materials
async function generateProjectDescription(
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo: CourseInfo,
): Promise<string> {
  console.log(`Generating project description for ${difficultyLevel} level course...`)

  // Determine if we have source materials or need to use course info only
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  const systemPrompt = `You are an expert educational assessment developer for a university course. Create a comprehensive project description for a ${difficultyLevel} level course in ${courseInfo.courseName || 'Big Data Storage and Management'} ${hasSourceMaterials ? 'based STRICTLY on the provided source materials' : 'based on standard curriculum for this subject'}.

IMPORTANT INSTRUCTIONS:
${
  hasSourceMaterials
    ? `
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.`
    : `
1. As no source materials are provided, base your project on standard curriculum content for ${courseInfo.courseName || 'this subject'}.
2. Focus on core concepts, theories, and applications typically covered in ${courseInfo.courseCode || ''} ${courseInfo.courseName || 'this type of course'}.
3. Ensure the project is academically rigorous and appropriate for university-level education.`
}
4. Create a detailed project description with clear deliverables and requirements.
5. Include specific instructions for both report and presentation components.
6. The project should be designed for groups of ${courseInfo.groupSize || 4} students.
7. The project should be challenging but achievable within ${courseInfo.duration || '2 weeks'}.
8. Include the following sections exactly, each of the following titles should be bold:
   - Instruction
   - Project Description
   - Deliverables
   - Report Structure
   - Presentation Requirements
   - Submission Guidelines
   - Deadline Information
9. Format the output in Markdown. 
10. For text formatting, use only bold for headings, "**" is allowed but not "#". 

FORMAT YOUR RESPONSE AS A COMPLETE PROJECT DESCRIPTION DOCUMENT, not as JSON. Include all necessary formatting, headers, and sections.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate a comprehensive project description for ${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'} ${hasSourceMaterials ? 'based STRICTLY on the provided source materials' : 'based on standard curriculum for this subject'}. The project should be for ${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'} with a deadline of ${courseInfo.deadline || '10th January 2024, by 6:15 pm'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE + 0.1,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    console.log('Project description generated successfully')
    return response.text.trim()
  } catch (error) {
    console.error('Error generating project description:', error)
    return `
School of Computer Sciences, Universiti Sains Malaysia 
 
Deadline for submission is ${courseInfo.deadline || '10th January 2024'}, by 6:15 pm. Online submission via elearn. 
 
${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}  
${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'} 
 
PROJECT (20%) – REPORT & PRESENTATION
(Group Work: Up to ${courseInfo.groupSize || 4} members per group) 
 
Instruction: The project will be evaluated based on group work and as well as individual performance via written report and group presentation. Every group must submit a written report and provide a group presentation. Group formation is conducted via Padlet link provided in the elearn portal. 
 
Deadline: ${courseInfo.deadline || '10th January 2024'} (6:15 pm), submit your softcopy of your report/slides & source codes through e-learning portal during the class time. Group presentation will be conducted in the class for two weeks. Random drawing will be made to determine which groups to present.
 
Project Description: Each group should identify a dataset related to the course content. Build appropriate data storage and processing solutions based on the course materials. You may need to download and install necessary software or use cloud services. You may use your local machine i.e laptop or cloud services i.e. Google Cloud, Amazon etc, or container technology i.e. Docker to set up your environment. Enter the data set into the databases. Run at least four meaningful queries that are best describing the data. Compare and discuss their performance in terms of ease of use, creating queries and data processing speed.
 
Your deliverables must include the following requirements:
• Chosen platform for implementation
• Installation process and data entry
• At least five meaningful queries or operations
• Compare and discuss their performance
• Recommendation & lesson learned
 
Below are some points that guide you in preparing the report:
i. Abstract  
ii. Introduction  
iii. Project Content
   1. Brief description of the given dataset  
   2. Selection of implementation platform
   3. Installation process, system construction and data entry
   4. At least 4 meaningful operations
   5. Comparison, discussion and recommendation
   6. Concluding remarks
iv. Lesson learned from the project
v. Clear division of group members' roles  
vi. Conclusion
vii. References (At least 8 references which include 4 journal papers)
viii. Appendices (If any)
 
Marking Scheme: refer to the rubrics posted on the elearn
 
For the in class presentation, each group is allocated about 15 minutes including Q & A:
• Everyone in the group is expected to present some portion of the project
 
Submit the following together with well formatted report (One submission per group):
• IEEE format (refer to the elearn for the sample template)
• Soft copy - (Report + source codes and slides): e-learning
 
Note:  
The report should include an appendix indicating detailed descriptions on contributions of each group member in the project. In the event that parts of the report are directly copied from others without references, F grade is given.
`
  }
}

async function generateQuestions(
  assessmentType: string,
  difficultyLevel: string,
  numQuestions: number,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo?: CourseInfo,
): Promise<GeneratedQuestion[]> {
  console.log(`Generating ${numQuestions} questions for ${assessmentType} assessment...`)

  // Coverity fix: check for null/undefined courseInfo before use
  if (!courseInfo) {
    console.error('generateQuestions: courseInfo is null or undefined')
    return [
      {
        question: 'Unable to generate questions: course information is missing.',
        type: assessmentType,
      },
    ]
  }

  // For project assessments, generate a specialized project question
  if (assessmentType.toLowerCase() === 'project') {
    console.log('Generating project description instead of standard questions')
    try {
      const projectDescription = await generateProjectDescription(
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
      )

      console.log('Project description generated successfully')

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
Project Title: ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || ''} Project

Instructions: This project is designed to assess your understanding of the course material. 
Please work in groups of ${courseInfo?.groupSize || 4} to complete this project.

Project Description: 
Create a comprehensive project that demonstrates your understanding of the key concepts covered in this course.
Your project should include both implementation and documentation components.

Deliverables:
1. A detailed report explaining your approach, methodology, and findings
2. Source code or implementation files
3. A presentation summarizing your project

Deadline: ${courseInfo?.deadline || 'End of semester'}
          `,
          type: 'project',
        },
      ]
    }
  }

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  // Standard question generation for non-project assessments
  const systemPrompt = `You are an expert educational assessment developer specializing in ${courseInfo?.courseName || 'the subject area'}. Generate ${numQuestions} unique questions for a ${difficultyLevel} level ${assessmentType} assessment.

IMPORTANT INSTRUCTIONS:
${
  hasSourceMaterials
    ? `
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.`
    : `
1. As no source materials are provided, base your questions on standard curriculum content for ${courseInfo?.courseName || 'this subject'}.
2. Focus on core concepts, theories, and applications typically covered in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this type of course'}.
3. Ensure questions are academically rigorous and appropriate for university-level education.`
}
4. Ensure that the questions are diverse and cover a range of topics.
5. Your response MUST be a JSON array of strings.

RESPONSE FORMAT:
[
  "Question 1",
  "Question 2",
  "Question 3"
]

DO NOT include any text, markdown, explanations, or other content outside the JSON array.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate ${numQuestions} unique questions for the ${assessmentType} assessment for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_MAX / 2),
    })

    console.log('Questions response:', response.text)

    // Try to parse the response as JSON
    try {
      const questions = JSON.parse(response.text)
      if (Array.isArray(questions)) {
        console.log('Successfully parsed questions directly')
        return questions
      }
    } catch {
      console.log('Direct parsing failed, trying JSON extraction')
    }

    // Try to extract JSON from the response
    const jsonStr = extractJsonFromText(response.text)
    if (jsonStr) {
      try {
        const questions = JSON.parse(jsonStr)
        if (Array.isArray(questions)) {
          console.log('Successfully extracted and parsed questions JSON')
          return questions
        }
      } catch (e) {
        console.error('Failed to parse extracted questions JSON:', e)
      }
    }

    // If all extraction methods fail, extract questions from the response text
    console.log('Extracting questions from response text')
    const questionsArray: string[] = []
    const lines = response.text.split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.length > 0) {
        questionsArray.push(trimmedLine)
      }
    }

    if (questionsArray.length > 0) {
      console.log('Successfully extracted questions from response text')
      return questionsArray
    }

    // If all extraction methods fail, return a default question
    console.log('Using default question due to parsing failure')
    return ['What are the key concepts covered in this course?']
  } catch (error) {
    console.error('Error generating questions:', error)
    return ['What are the key concepts covered in this course?']
  }
}

async function generateAssessmentMetadata(
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo?: CourseInfo,
): Promise<AssessmentMetadata> {
  console.log(`Generating metadata for ${assessmentType} assessment...`)

  // For project assessments, use specialized metadata
  if (assessmentType.toLowerCase() === 'project' && courseInfo) {
    return {
      type: 'Project',
      duration: courseInfo.duration || '2 weeks',
      // Ensure clean description without duplication
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

  // Rest of the function remains the same...
  const systemPrompt = `You are an expert educational assessment developer. Create metadata for a ${assessmentType} assessment for a ${difficultyLevel} level course ${hasSourceMaterials ? 'based STRICTLY on the provided source materials' : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`}.

IMPORTANT INSTRUCTIONS:
${
  hasSourceMaterials
    ? `
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.`
    : `
1. As no source materials are provided, base your metadata on standard curriculum content for ${courseInfo?.courseName || 'this subject'}.
2. Focus on core concepts, theories, and applications typically covered in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this type of course'}.`
}
3. Create a title, duration, and description for the assessment.
4. Your response MUST be valid JSON only.

RESPONSE FORMAT:
{
  "type": "${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)}",
  "duration": "Appropriate time for completion (e.g., '2 hours')",
  "description": "Brief description of the assessment and its purpose"
}

DO NOT include any text, markdown, explanations, or other content outside the JSON object.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate metadata for a ${assessmentType} assessment for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_MAX / 4),
    })

    console.log('Metadata response:', response.text)

    // Try to parse the response as JSON
    try {
      const metadata = JSON.parse(response.text)
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

    // Try to extract JSON from the response
    const jsonStr = extractJsonFromText(response.text)
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
    const typeMatch = response.text.match(/"type"\s*:\s*"([^"]+)"/)
    if (typeMatch && typeMatch[1]) {
      extractedType = typeMatch[1]
    }

    // Extract duration from the response text, but override for exam type
    let extractedDuration =
      assessmentType.toLowerCase() === 'exam' ? '2 hours' : getDefaultDuration(assessmentType)
    if (assessmentType.toLowerCase() !== 'exam') {
      const durationMatch = response.text.match(/"duration"\s*:\s*"([^"]+)"/)
      if (durationMatch && durationMatch[1]) {
        extractedDuration = durationMatch[1]
      }
    }

    // Extract description from the response text or use a clean one if courseInfo is provided
    let extractedDescription = `A ${difficultyLevel} level ${assessmentType} assessment.`
    if (courseInfo?.courseCode && courseInfo?.courseName) {
      extractedDescription = `${courseInfo.courseCode} ${courseInfo.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
    } else {
      const descMatch = response.text.match(/"description"\s*:\s*"([^"]+)"/)
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

async function generateModelAnswer(
  question: string,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo?: CourseInfo,
): Promise<string> {
  console.log(`Generating model answer for question: ${question.substring(0, 100)}...`)

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  const systemPrompt = `You are an expert educational assessment developer. Generate a model answer for the following question ${hasSourceMaterials ? 'based STRICTLY on the provided source materials' : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`}.

IMPORTANT INSTRUCTIONS:
${
  hasSourceMaterials
    ? `
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.`
    : `
1. As no source materials are provided, base your answer on standard curriculum content for ${courseInfo?.courseName || 'this subject'}.
2. Focus on core concepts, theories, and applications typically covered in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this type of course'}.
3. Ensure the answer is academically rigorous and appropriate for university-level education.`
}
4. Provide a comprehensive and accurate answer to the question.
5. Your response MUST be a plain text answer only.

QUESTION: ${question}

DO NOT include any text, markdown, explanations, or other content outside the answer.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate a model answer for the question for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    console.log('Model answer response:', response.text.substring(0, 100) + '...')
    return response.text.trim()
  } catch (error) {
    console.error('Error generating model answer:', error)
    return `Unable to generate a model answer due to an error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

async function generateMarkingCriteria(
  question: string,
  modelAnswer: string,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  courseInfo?: CourseInfo,
): Promise<ExplanationObject> {
  console.log(`Generating marking criteria for question: ${question.substring(0, 100)}...`)

  // Determine if we have source materials
  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')

  const systemPrompt = `You are an expert educational assessment developer. Create marking criteria for the following question based on the model answer ${hasSourceMaterials ? 'and STRICTLY on the provided source materials' : `for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}`}.

IMPORTANT INSTRUCTIONS:
${
  hasSourceMaterials
    ? `
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.`
    : `
1. As no source materials are provided, base your criteria on standard curriculum content for ${courseInfo?.courseName || 'this subject'}.
2. Focus on core concepts, theories, and applications typically covered in ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this type of course'}.
3. Ensure the criteria are academically rigorous and appropriate for university-level education.`
}
4. Provide a detailed grading rubric with specific criteria and mark allocation.
5. Your response MUST be valid JSON only.

QUESTION: ${question}

MODEL ANSWER: ${modelAnswer}

RESPONSE FORMAT:
{
  "criteria": [
    {
      "name": "Criterion 1",
      "weight": 40,
      "description": "Description of criterion 1"
    },
    {
      "name": "Criterion 2",
      "weight": 30,
      "description": "Description of criterion 2"
    },
    {
      "name": "Criterion 3",
      "weight": 30,
      "description": "Description of criterion 3"
    }
  ],
  "markAllocation": [
    {
      "component": "Component 1",
      "marks": 5,
      "description": "Description of component 1"
    },
    {
      "component": "Component 2",
      "marks": 10,
      "description": "Description of component 2"
    },
    {
      "component": "Component 3",
      "marks": 5,
      "description": "Description of component 3"
    }
  ]
}

DO NOT include any text, markdown, explanations, or other content outside the JSON object.`

  const systemMessage: CoreMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: CoreMessage = {
    role: 'user',
    content: `Generate marking criteria for the question based on the model answer for ${courseInfo?.courseCode || ''} ${courseInfo?.courseName || 'this course'}.`,
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    console.log('Marking criteria response:', response.text.substring(0, 100) + '...')

    // Try to parse the response as JSON
    try {
      const markingCriteria = JSON.parse(response.text)
      console.log('Successfully parsed marking criteria directly')
      return markingCriteria
    } catch {
      console.log('Direct parsing of marking criteria failed, trying JSON extraction')
    }

    // Try to extract JSON from the response
    const jsonStr = extractJsonFromText(response.text)
    if (jsonStr) {
      try {
        const markingCriteria = JSON.parse(jsonStr)
        console.log('Successfully extracted and parsed marking criteria JSON')
        return markingCriteria
      } catch (e) {
        console.error('Failed to parse extracted marking criteria JSON:', e)
      }
    }

    // If all extraction methods fail, return default marking criteria
    console.log('Using default marking criteria due to parsing failure')
    return {
      criteria: [
        {
          name: 'Understanding of concepts',
          weight: 40,
          description: 'Demonstrates understanding of key concepts from the course',
        },
        {
          name: 'Application of knowledge',
          weight: 30,
          description: 'Applies knowledge to the specific context of the question',
        },
        {
          name: 'Critical analysis',
          weight: 30,
          description: 'Shows critical thinking and analysis of the subject matter',
        },
      ],
      markAllocation: [],
      error: 'Failed to generate marking criteria',
    }
  } catch (error) {
    console.error('Error generating marking criteria:', error)
    return {
      criteria: [
        {
          name: 'Understanding of concepts',
          weight: 40,
          description: 'Demonstrates understanding of key concepts from the course',
        },
        {
          name: 'Application of knowledge',
          weight: 30,
          description: 'Applies knowledge to the specific context of the question',
        },
        {
          name: 'Critical analysis',
          weight: 30,
          description: 'Shows critical thinking and analysis of the subject matter',
        },
      ],
      markAllocation: [],
      error: error instanceof Error ? error.message : 'Unknown error during criteria generation',
    }
  }
}

// Update the processQuestion function to better handle project assessments
async function processQuestion(
  questionText: GeneratedQuestion,
  assessmentType: string,
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: CoreMessage,
  questionIndex: number,
  courseInfo?: CourseInfo,
): Promise<AssessmentQuestion> {
  // Handle case where questionText might be an object instead of a string
  let questionString: string
  let questionType = ''

  if (typeof questionText === 'object') {
    // If it's an object, extract the relevant text
    questionType = questionText.type || ''
    questionString = questionText.question || JSON.stringify(questionText)

    console.log(`Processing ${assessmentType} question ${questionIndex + 1}:`, {
      type: questionType,
      description: questionString.substring(0, 100) + '...',
    })
  } else {
    // If it's already a string, use it directly
    questionString = questionText
    console.log(
      `Processing ${assessmentType} question ${questionIndex + 1}: ${questionString.substring(0, 100)}...`,
    )
  }

  try {
    // Special handling for project assessments
    if (assessmentType.toLowerCase() === 'project') {
      console.log('Processing project assessment question...')

      // For project assessments, we need to generate a model answer and rubric
      const modelAnswer = await generateModelAnswer(
        questionString,
        assessmentType,
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo,
      )

      // Get the default project rubric
      const projectRubric = await generateProjectRubric(
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        courseInfo || { courseName: 'Project Assessment' }, // Use courseInfo if provided
      )

      // Return the project assessment question with the model answer and rubric
      return {
        question: questionString,
        correctAnswer: modelAnswer,
        explanation: {
          criteria: [
            ...projectRubric.categories.report.map((c) => ({
              name: `Report - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
            ...projectRubric.categories.demo.map((c) => ({
              name: `Demo - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
            ...projectRubric.categories.individual.map((c) => ({
              name: `Individual Contribution - ${c.name}`,
              weight: c.weight,
              description: c.description,
            })),
          ],
          markAllocation: [
            {
              component: 'Report',
              marks: projectRubric.reportWeight,
              description: 'Written report component',
            },
            {
              component: 'Demo',
              marks: projectRubric.demoWeight,
              description: 'Presentation component',
            },
            {
              component: 'Individual Contribution',
              marks: projectRubric.individualWeight,
              description: 'Individual assessment component',
            },
          ],
          rubricLevels: [
            {
              level: 'Excellent (5)',
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.excellent)
                  .map((c) => [c.name, c.levels?.excellent || '']),
              ),
            },
            {
              level: 'Good (4)',
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.good)
                  .map((c) => [c.name, c.levels?.good || '']),
              ),
            },
            {
              level: 'Average (3)',
              criteria: Object.fromEntries(
                [
                  ...projectRubric.categories.report,
                  ...projectRubric.categories.demo,
                  ...projectRubric.categories.individual,
                ]
                  .filter((c) => c.levels?.average)
                  .map((c) => [c.name, c.levels?.average || '']),
              ),
            },
          ],
          markingScale: projectRubric.markingScale,
        },
        // Add the type if it was present in the original question
        ...(questionType ? { type: questionType } : {}),
      }
    }

    // For non-project assessments, proceed with the standard approach
    // Step 2: Generate model answer
    console.log(`Generating model answer for ${assessmentType} question...`)
    const modelAnswer = await generateModelAnswer(
      questionString,
      assessmentType,
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    // Step 3: Generate marking criteria
    console.log(`Generating marking criteria for ${assessmentType} question...`)
    const markingCriteria = await generateMarkingCriteria(
      questionString,
      modelAnswer,
      assessmentType,
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    // Step 4: Combine into a complete question
    return {
      question: questionString,
      correctAnswer: modelAnswer,
      explanation: markingCriteria,
      // Add the type if it was present in the original question
      ...(questionType ? { type: questionType } : {}),
    }
  } catch (error) {
    console.error(`Error processing ${assessmentType} question ${questionIndex + 1}:`, error)

    // Return a fallback question with error information
    return {
      question: questionString,
      correctAnswer: `Unable to generate a model answer due to an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      explanation: {
        criteria: [
          {
            name: 'Understanding of concepts',
            weight: 40,
            description: 'Demonstrates understanding of key concepts from the course',
          },
          {
            name: 'Application of knowledge',
            weight: 30,
            description: 'Applies knowledge to the specific context of the question',
          },
          {
            name: 'Critical analysis',
            weight: 30,
            description: 'Shows critical thinking and analysis of the subject matter',
          },
        ],
        markAllocation: [],
        error: error instanceof Error ? error.message : 'Unknown error during criteria generation',
      },
    }
  }
}

// Update the main POST handler to ensure metadata is correctly passed
export async function POST(req: Request) {
  try {
    const {
      selectedModel,
      selectedSources,
      assessmentType,
      difficultyLevel,
      numQuestions,
      courseInfo,
    } = await req.json()

    if (!assessmentType || !difficultyLevel) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    console.log('=== ASSESSMENT GENERATION STARTED ===')
    console.log('Parameters:', { assessmentType, difficultyLevel, numQuestions })
    console.log('Course Info:', courseInfo)

    // Make selected sources optional
    const hasSelectedSources =
      selectedSources &&
      Array.isArray(selectedSources) &&
      selectedSources.filter((s: ClientSource) => s.selected).length > 0

    console.log(
      'Selected sources count:',
      hasSelectedSources
        ? selectedSources.filter((s: ClientSource) => s.selected).length
        : 'No sources selected',
    )

    // Get the Ollama URL from environment variables
    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }

    // Create Ollama client
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    // Prepare source content
    let assistantContent = ''

    try {
      // Only retrieve chunks if there are selected sources
      if (hasSelectedSources) {
        // Use the getStoredChunks function to retrieve chunks from selected sources
        const retrievedChunks = await getStoredChunks(selectedSources as ClientSource[])
        console.log('Retrieved chunks:', retrievedChunks.length)

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
            structuredContent = truncateToTokenLimit(structuredContent, TOKEN_CONTEXT_BUDGET)
          }

          console.log(`Final context size: ${countTokens(structuredContent)} tokens`)
          assistantContent = structuredContent
        }
      }

      // If no sources were selected or no chunks were retrieved, use a course-specific prompt
      if (!assistantContent) {
        console.log('No source content available, using course-specific prompt')
        // Replace the generic prompt with a course-specific one
        if (courseInfo?.courseCode && courseInfo?.courseName) {
          assistantContent = `Generate a ${difficultyLevel} level ${assessmentType} assessment for the course "${courseInfo.courseCode} ${courseInfo.courseName}".
          
As an expert in this subject area, create content that would be appropriate for a university-level course on this topic.
          
For this ${assessmentType}:
1. Include questions that test understanding of core concepts in ${courseInfo.courseName}
2. Cover a range of topics typically included in a ${courseInfo.courseName} curriculum
3. Ensure the difficulty level is appropriate for ${difficultyLevel} students
4. Include both theoretical and practical aspects of the subject where appropriate
5. Ensure questions are clear, unambiguous, and academically rigorous

The assessment should reflect standard academic expectations for a course with this title at university level.`
        } else {
          assistantContent = `Generate a ${difficultyLevel} level ${assessmentType} assessment based on your knowledge of the subject.`
        }
      }
    } catch (error) {
      console.error('Error retrieving knowledge:', error)
      // Use course-specific prompt even in error case
      if (courseInfo?.courseCode && courseInfo?.courseName) {
        assistantContent = `Generate a ${difficultyLevel} level ${assessmentType} assessment for the course "${courseInfo.courseCode} ${courseInfo.courseName}".
        
As an expert in this subject area, create content that would be appropriate for a university-level course on this topic.
        
For this ${assessmentType}:
1. Include questions that test understanding of core concepts in ${courseInfo.courseName}
2. Cover a range of topics typically included in a ${courseInfo.courseName} curriculum
3. Ensure the difficulty level is appropriate for ${difficultyLevel} students
4. Include both theoretical and practical aspects of the subject where appropriate
5. Ensure questions are clear, unambiguous, and academically rigorous

The assessment should reflect standard academic expectations for a course with this title at university level.`
      } else {
        assistantContent = `Generate a ${difficultyLevel} level ${assessmentType} assessment based on your knowledge of the subject.`
      }
    }

    // Create assistant message with the source content
    const assistantMessage: CoreMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    // Generate assessment metadata using the new function
    const assessmentMetadata = await generateAssessmentMetadata(
      assessmentType,
      difficultyLevel,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    console.log('Final metadata:', assessmentMetadata)

    // Step 1: Generate unique questions
    const questionTexts = await generateQuestions(
      assessmentType,
      difficultyLevel,
      numQuestions,
      ollama,
      selectedModel,
      assistantMessage,
      courseInfo,
    )

    console.log(`Generated ${questionTexts.length} unique questions`)

    // Step 5: Process each question sequentially
    const generatedQuestions: AssessmentQuestion[] = []

    for (let i = 0; i < questionTexts.length; i++) {
      const processedQuestion = await processQuestion(
        questionTexts[i],
        assessmentType,
        difficultyLevel,
        ollama,
        selectedModel,
        assistantMessage,
        i,
        courseInfo,
      )

      generatedQuestions.push(processedQuestion)
      console.log(`Completed processing question ${i + 1} of ${questionTexts.length}`)
    }

    console.log(`Successfully processed ${generatedQuestions.length} questions`)

    // Step 6: Combine metadata and questions into the final assessment
    const assessmentData = {
      assessmentIdeas: [
        {
          type:
            assessmentMetadata.type ||
            assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1),
          duration: assessmentMetadata.duration || getDefaultDuration(assessmentType),
          description:
            assessmentMetadata.description ||
            `A ${difficultyLevel} level ${assessmentType} assessment.`,
          exampleQuestions: generatedQuestions,
          courseCode: courseInfo?.courseCode,
          courseName: courseInfo?.courseName,
        },
      ],
    }

    console.log('=== ASSESSMENT GENERATION COMPLETED ===')

    // Return the assessment data to the frontend
    return NextResponse.json(assessmentData)
  } catch (error: unknown) {
    console.error('Error generating assessment:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to generate assessment: ' + errorMessage,
        details: error instanceof Error ? error.stack : 'No stack trace available',
      },
      { status: 500 },
    )
  }
}
