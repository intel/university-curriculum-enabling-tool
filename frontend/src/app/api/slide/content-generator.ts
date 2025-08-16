import { createOllama } from 'ollama-ai-provider'
import { type CoreMessage, generateText } from 'ai'
import type { ClientSource } from '@/lib/types/client-source'
import type {
  LectureContent,
  AssessmentQuestion,
  AssessmentIdea,
  LectureSlide,
  SpecialSlide,
} from './types'
import {
  prepareSourceContent,
  extractAndParseJSON,
  parseQuestionsText,
  getContentTypePrompt,
  getContentStylePrompt,
  getDifficultyLevelPrompt,
  TEMPERATURE,
  TOKEN_RESPONSE_BUDGET,
} from './utils'
import {
  getMetadataSystemPrompt,
  getActivitiesSystemPrompt,
  getAssessmentSystemPrompt,
  getReadingsSystemPrompt,
  getQuizQuestionPrompt,
  getDiscussionQuestionPrompt,
} from './prompts'
import { validateAndSanitizeContent } from './content-validator'
import { createFallbackContent } from './fallback-content'

// Define the AssessmentQuestion type

export async function generateCourseContent(
  selectedModel: string,
  selectedSources: ClientSource[],
  contentType: string,
  contentStyle: string,
  sessionLength: number,
  difficultyLevel: string,
  topicName: string,
): Promise<LectureContent> {
  try {
    // Check for required environment variables
    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }

    // Create Ollama client
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    // Prepare source content
    console.log('Preparing source content...')
    const { content: assistantContent, metadata: sourceMetadata } =
      await prepareSourceContent(selectedSources)

    // Ensure assistant content fits within context window
    const assistantMessage: CoreMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    console.log('Generating course content with Ollama in sequential steps...')

    // STEP 1: Generate basic metadata (title, contentType, difficultyLevel, learningOutcomes, keyTerms)
    console.log('STEP 1: Generating basic metadata...')

    const contentTypePrompt = getContentTypePrompt(contentType)
    const contentStylePrompt = getContentStylePrompt(contentStyle)

    // Add specialized prompts for tutorials and workshops
    const specializedPrompt =
      contentType === 'tutorial'
        ? `For this tutorial, ensure you:
    - Structure content as a learning journey with clear progression
    - Include detailed step-by-step instructions that build skills incrementally
    - Provide sample solutions with explanations of the reasoning process
    - Include troubleshooting tips for common mistakes
    - Add reflection questions after each major section
    - Ensure activities have clear success criteria
    - Include both basic exercises and extension activities for differentiation`
        : contentType === 'workshop'
          ? `For this workshop, ensure you:
    - Design activities that promote active participation and collaboration
    - Include detailed facilitation notes for the instructor
    - Provide clear timing guidelines for each activity
    - Include discussion prompts that connect theory to practice
    - Structure activities with clear phases (introduction, main activity, debrief)
    - Include guidance on managing group dynamics
    - Provide templates and worksheets that support the activities`
          : ''

    const difficultyLevelPrompt = getDifficultyLevelPrompt(difficultyLevel)

    const metadataSystemPrompt = getMetadataSystemPrompt(
      difficultyLevel,
      contentType,
      contentTypePrompt,
      contentStylePrompt,
      difficultyLevelPrompt,
      specializedPrompt, // Add this parameter
    )

    const metadataSystemMessage: CoreMessage = {
      role: 'system',
      content: metadataSystemPrompt,
    }

    const metadataUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate the title, learning outcomes, and at least 5-10 key terms for a ${difficultyLevel} level ${contentType} on "${topicName}" based STRICTLY on the provided source materials above.`,
    }

    const metadataMessages = [metadataSystemMessage, assistantMessage, metadataUserMessage]

    const metadataTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: metadataMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 4),
    })

    console.log('Raw metadata response:', metadataTextResponse.text.substring(0, 500) + '...')
    const metadataResponse = extractAndParseJSON(metadataTextResponse.text)
    console.log(
      'Parsed metadata:',
      JSON.stringify(metadataResponse, null, 2).substring(0, 200) + '...',
    )

    // STEP 2: Generate introduction
    console.log('STEP 2: Generating introduction...')

    const introSystemPrompt = `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} on "${topicName}" designed for a ${sessionLength}-minute session.

IMPORTANT INSTRUCTIONS:
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.
4. Create an engaging introduction that provides context and importance of the topic.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY these fields:
{
"introduction": "Engaging introduction paragraph that provides context and importance of the topic"
}

CRITICAL: Your response MUST be valid JSON only. Do not include any text, markdown, explanations, or other content outside the JSON object. Do not include backticks or code block markers.`

    const introSystemMessage: CoreMessage = {
      role: 'system',
      content: introSystemPrompt,
    }

    const introUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate an engaging introduction for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above.`,
    }

    const introMessages = [introSystemMessage, assistantMessage, introUserMessage]

    const introTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: introMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 6),
    })

    console.log('Raw intro response:', introTextResponse.text.substring(0, 500) + '...')
    const introResponse = extractAndParseJSON(introTextResponse.text)
    console.log('Parsed intro:', JSON.stringify(introResponse, null, 2).substring(0, 200) + '...')

    // STEP 3: Generate special slides (introduction, agenda, assessment, conclusion)
    console.log('STEP 3: Generating special slides...')

    const specialSlidesSystemPrompt = `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} on "${topicName}" designed for a ${sessionLength}-minute session.

IMPORTANT INSTRUCTIONS:
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.
4. Create ONLY the following special slides:
 - Introduction slide (first slide that introduces the topic)
 - Agenda/Overview slide (outlines what will be covered)
 - Assessment slide(s) (summarizes assessment approaches)
 - Conclusion/Summary slide (wraps up the presentation)

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY these fields:
{
"specialSlides": [
  {
    "type": "introduction",
    "title": "Introduction to [Topic]",
    "content": ["Point 1", "Point 2", "Point 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "agenda",
    "title": "Agenda/Overview",
    "content": ["Topic 1", "Topic 2", "Topic 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "assessment",
    "title": "Assessment Approaches",
    "content": ["Assessment method 1", "Assessment method 2"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "conclusion",
    "title": "Summary and Conclusion",
    "content": ["Key takeaway 1", "Key takeaway 2", "Next steps"],
    "notes": "Speaker notes for this slide"
  }
]
}

CRITICAL: Your response MUST be valid JSON only. Do not include any text, markdown, explanations, or other content outside the JSON object. Do not include backticks or code block markers.`

    const specialSlidesSystemMessage: CoreMessage = {
      role: 'system',
      content: specialSlidesSystemPrompt,
    }

    const specialSlidesUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate the introduction, agenda, assessment, and conclusion slides for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above.`,
    }

    const specialSlidesMessages = [
      specialSlidesSystemMessage,
      assistantMessage,
      specialSlidesUserMessage,
    ]

    const specialSlidesTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: specialSlidesMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 4),
    })

    console.log(
      'Raw special slides response:',
      specialSlidesTextResponse.text.substring(0, 500) + '...',
    )
    const specialSlidesResponse = extractAndParseJSON(specialSlidesTextResponse.text)
    console.log(
      'Parsed special slides:',
      JSON.stringify(specialSlidesResponse, null, 2).substring(0, 200) + '...',
    )

    // STEP 4: Generate content slides in batches to avoid JSON parsing issues
    console.log('STEP 4: Generating content slides in batches...')

    // Calculate total content slides needed based on session length
    const baseSessionLength = 60 // Base session length in minutes
    const baseSlides = 15 // Number of slides for the base session length
    const additionalSlidesPerBatch = 5 // Number of slides per additional 30 minutes

    // Calculate the total number of slides dynamically
    const totalContentSlidesNeeded =
      baseSlides + Math.floor((sessionLength - baseSessionLength) / 30) * additionalSlidesPerBatch

    // Ensure the total slides are not repeated
    const slidesPerBatch = 5
    const batches = Math.ceil(totalContentSlidesNeeded / slidesPerBatch)

    console.log(`Session length: ${sessionLength} minutes`)
    console.log(`Total content slides needed: ${totalContentSlidesNeeded}`)
    console.log(`Number of batches: ${batches}`)

    // Fix for "Variable 'allContentSlides' implicitly has an 'any[]' type"
    // In the content slides generation section, change:
    // let allContentSlides = []
    // to:
    const allContentSlides: LectureSlide[] = []

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startSlideNum = batchIndex * slidesPerBatch + 1
      const endSlideNum = Math.min((batchIndex + 1) * slidesPerBatch, totalContentSlidesNeeded)

      console.log(
        `Generating content slides batch ${batchIndex + 1}/${batches} (slides ${startSlideNum}-${endSlideNum})...`,
      )

      const contentSlidesSystemPrompt = `You are generating content slides ${startSlideNum} through ${endSlideNum} of a total of ${totalContentSlidesNeeded} content slides. Ensure all slides are unique.

IMPORTANT INSTRUCTIONS:
1. You MUST base your content ENTIRELY on the source materials provided.
2. Extract key concepts, terminology, examples, and explanations directly from the source materials.
3. Do not introduce concepts or information that is not present in the source materials.
4. Create detailed teaching slides with substantial content on each slide.
5. Focus ONLY on core teaching content slides.
6. Each slide should have comprehensive speaker notes with additional details and examples.
7. You are generating content slides ${startSlideNum} through ${endSlideNum} of a total of ${totalContentSlidesNeeded} content slides.
8. DO NOT create introduction, agenda, assessment, or conclusion slides - these are handled separately.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY these fields:
{
"contentSlides": [
  {
    "title": "Slide Title",
    "content": [
      "Include multiple detailed points with examples and context",
      "Each array item represents a bullet point or paragraph on the slide"
    ],
    "notes": "Comprehensive speaker notes with additional details, examples, and teaching tips"
  }
]
}

CRITICAL: Your response MUST be valid JSON only. Do not include any text, markdown, explanations, or other content outside the JSON object. Do not include backticks or code block markers.`

      const contentSlidesSystemMessage: CoreMessage = {
        role: 'system',
        content: contentSlidesSystemPrompt,
      }

      const contentSlidesUserMessage: CoreMessage = {
        role: 'user',
        content: `Generate content slides ${startSlideNum} through ${endSlideNum} for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above. 
        
DO NOT create introduction, agenda, assessment, or conclusion slides. Focus ONLY on core teaching content slides.`,
      }

      const contentSlidesMessages = [
        contentSlidesSystemMessage,
        assistantMessage,
        contentSlidesUserMessage,
      ]

      const contentSlidesTextResponse = await generateText({
        model: ollama(selectedModel),
        // messages: [
        //   { role: 'system', content: contentSlidesSystemPrompt },
        //   assistantMessage,
        //   {
        //     role: 'user',
        //     content: `Generate unique content slides ${startSlideNum}-${endSlideNum}.`,
        //   },
        // ],
        messages: contentSlidesMessages,
        temperature: TEMPERATURE,
        maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 2),
      })

      const contentSlidesResponse = extractAndParseJSON(contentSlidesTextResponse.text)

      if (contentSlidesResponse && Array.isArray(contentSlidesResponse.contentSlides)) {
        contentSlidesResponse.contentSlides.forEach((slide: LectureSlide) => {
          if (!allContentSlides.some((existingSlide) => existingSlide.title === slide.title)) {
            allContentSlides.push(slide)
          }
        })
      }
    }

    console.log(`Total unique content slides generated: ${allContentSlides.length}`)

    // STEP 3: Generate activities
    console.log('STEP 3: Generating activities...')

    const activitiesSystemPrompt = getActivitiesSystemPrompt(
      difficultyLevel,
      contentType,
      contentTypePrompt,
      contentStylePrompt,
      difficultyLevelPrompt,
    )

    const activitiesSystemMessage: CoreMessage = {
      role: 'system',
      content: activitiesSystemPrompt,
    }

    const activitiesUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate the activities for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above.`,
    }

    const activitiesMessages = [activitiesSystemMessage, assistantMessage, activitiesUserMessage]

    const activitiesTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: activitiesMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 4),
    })

    console.log('Raw activities response:', activitiesTextResponse.text.substring(0, 500) + '...')
    const activitiesResponse = extractAndParseJSON(activitiesTextResponse.text)
    console.log(
      'Parsed activities:',
      JSON.stringify(activitiesResponse, null, 2).substring(0, 200) + '...',
    )

    // STEP 4: Generate assessment ideas (without example questions)
    console.log('STEP 4: Generating assessment ideas...')

    const assessmentSystemPrompt = getAssessmentSystemPrompt(
      difficultyLevel,
      contentType,
      topicName,
      sessionLength,
    )

    const assessmentSystemMessage: CoreMessage = {
      role: 'system',
      content: assessmentSystemPrompt,
    }

    const assessmentUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate assessment ideas (without example questions) for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above.`,
    }

    const assessmentMessages = [assessmentSystemMessage, assistantMessage, assessmentUserMessage]

    const assessmentTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: assessmentMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 6),
    })

    console.log('Raw assessment response:', assessmentTextResponse.text.substring(0, 500) + '...')
    const assessmentResponse = extractAndParseJSON(assessmentTextResponse.text)
    console.log('Parsed assessment:', JSON.stringify(assessmentResponse, null, 2))

    // Filter assessment ideas to only include Quiz and Discussion types
    let filteredAssessmentIdeas = []
    if (Array.isArray(assessmentResponse.assessmentIdeas)) {
      filteredAssessmentIdeas = assessmentResponse.assessmentIdeas.filter(
        (idea: AssessmentIdea) => {
          const type = typeof idea === 'object' ? (idea.type || '').toLowerCase() : ''
          return type.includes('quiz') || type.includes('discussion')
        },
      )

      // If no Quiz or Discussion assessments were found, add default ones
      if (filteredAssessmentIdeas.length === 0) {
        filteredAssessmentIdeas = [
          {
            type: 'Quiz',
            duration: '20 minutes',
            description: 'Multiple-choice quiz covering the main concepts',
            exampleQuestions: [],
          },
          {
            type: 'Discussion',
            duration: '30 minutes',
            description: 'Group discussion on key topics and applications',
            exampleQuestions: [],
          },
        ]
      }
    }

    // STEP 5: Generate further readings separately
    console.log('STEP 5: Generating further readings...')

    const readingsSystemPrompt = getReadingsSystemPrompt(
      difficultyLevel,
      contentType,
      topicName,
      sessionLength,
    )

    const readingsSystemMessage: CoreMessage = {
      role: 'system',
      content: readingsSystemPrompt,
    }

    const readingsUserMessage: CoreMessage = {
      role: 'user',
      content: `Generate further reading suggestions for a ${difficultyLevel} level ${contentType} on "${topicName}" with title "${metadataResponse.title}" based STRICTLY on the provided source materials above.`,
    }

    const readingsMessages = [readingsSystemMessage, assistantMessage, readingsUserMessage]

    const readingsTextResponse = await generateText({
      model: ollama(selectedModel),
      messages: readingsMessages,
      temperature: TEMPERATURE,
      maxTokens: Math.floor(TOKEN_RESPONSE_BUDGET / 6),
    })

    console.log('Raw readings response:', readingsTextResponse.text.substring(0, 500) + '...')
    const readingsResponse = extractAndParseJSON(readingsTextResponse.text)
    console.log('Parsed readings:', JSON.stringify(readingsResponse, null, 2))

    // STEP 6: Generate example questions for each assessment idea
    console.log('STEP 6: Generating example questions for each assessment idea...')

    // Initialize an array to store assessment ideas with example questions
    const assessmentIdeasWithQuestions: AssessmentIdea[] = []

    // Process each assessment idea to add example questions
    for (let i = 0; i < filteredAssessmentIdeas.length; i++) {
      const idea = filteredAssessmentIdeas[i]

      // Skip if not an object
      if (typeof idea !== 'object') {
        assessmentIdeasWithQuestions.push({
          type: 'Assessment',
          duration: 'Varies',
          description: String(idea),
          exampleQuestions: [],
        })
        continue
      }

      console.log(`Generating example questions for assessment idea ${i + 1}: ${idea.type}`)

      try {
        if (idea.type.toLowerCase().includes('quiz')) {
          const prompt = getQuizQuestionPrompt(topicName, idea.description)

          // Generate JSON-formatted questions for quiz
          const { text: questionsText } = await generateText({
            model: ollama(selectedModel),
            prompt: prompt,
            temperature: TEMPERATURE,
            maxTokens: 1000,
          })

          console.log(
            `Generated questions text for quiz assessment ${i + 1}:`,
            questionsText.substring(0, 200) + '...',
          )

          // Try to parse the JSON response
          try {
            // Extract JSON from the response (case there's any extra text)
            const jsonMatch = questionsText.match(/\[[\s\S]*\]/)
            const jsonString = jsonMatch ? jsonMatch[0] : questionsText

            // Parse the JSON
            const questions = JSON.parse(jsonString)

            if (Array.isArray(questions) && questions.length > 0) {
              console.log(`Successfully parsed ${questions.length} quiz questions from JSON`)

              // Add the example questions to the assessment idea
              assessmentIdeasWithQuestions.push({
                ...idea,
                exampleQuestions: questions,
              })
            } else {
              console.log(
                'Parsed JSON is not a valid array of quiz questions, falling back to text parsing',
              )

              // If JSON parsing failed, fall back to the text-based parsing
              const exampleQuestions = parseQuestionsText(questionsText, idea.type)

              console.log(
                `Parsed ${exampleQuestions.length} quiz questions using fallback text parser`,
              )

              // Add the example questions to the assessment idea
              assessmentIdeasWithQuestions.push({
                ...idea,
                exampleQuestions: exampleQuestions,
              })
            }
          } catch (error) {
            console.error(`Error parsing quiz questions JSON:`, error)
            console.log('Falling back to text-based parsing for quiz')

            // If JSON parsing failed, fall back to the text-based parsing
            const exampleQuestions = parseQuestionsText(questionsText, idea.type)

            console.log(
              `Parsed ${exampleQuestions.length} quiz questions using fallback text parser`,
            )

            // Add the example questions to the assessment idea
            assessmentIdeasWithQuestions.push({
              ...idea,
              exampleQuestions: exampleQuestions,
            })
          }
        } else if (idea.type.toLowerCase().includes('discussion')) {
          const prompt = getDiscussionQuestionPrompt(topicName, idea.description)

          // Generate JSON-formatted questions for discussion
          const { text: questionsText } = await generateText({
            model: ollama(selectedModel),
            prompt: prompt,
            temperature: TEMPERATURE,
            maxTokens: 1500,
          })

          console.log(
            `Generated questions text for discussion assessment ${i + 1}:`,
            questionsText.substring(0, 200) + '...',
          )

          try {
            // Process the discussion questions with the new simplified format
            const processedQuestions = await processDiscussionQuestions(questionsText, topicName)

            // Add the processed questions to the assessment idea
            assessmentIdeasWithQuestions.push({
              ...idea,
              exampleQuestions: processedQuestions,
            })
          } catch (error) {
            console.error(`Error processing discussion questions:`, error)
            // Fallback to default discussion questions
            assessmentIdeasWithQuestions.push({
              ...idea,
              exampleQuestions: createDefaultDiscussionQuestions(topicName),
            })
          }
        } else {
          // For other assessment types, add a default question
          assessmentIdeasWithQuestions.push({
            ...idea,
            exampleQuestions: [
              {
                question: `Sample question for ${idea.type}`,
                explanation: 'This is a placeholder question for this assessment type.',
                correctAnswer: 'Sample answer',
                pointAllocation: 'Default',
              },
            ],
          })
        }
      } catch (error) {
        console.error(`Error generating questions for assessment idea ${i + 1}:`, error)
        // Add the assessment idea with fallback questions if there was an error
        assessmentIdeasWithQuestions.push({
          ...idea,
          exampleQuestions: [
            {
              question: `Sample question for ${idea.type}`,
              explanation: 'This is a fallback question due to an error in question generation.',
              correctAnswer: 'Sample answer',
              pointAllocation: 'Default',
            },
          ],
        })
      }
    }

    // Create a modified assessment response with the questions
    const assessmentResponseWithQuestions = {
      assessmentIdeas: assessmentIdeasWithQuestions,
    }

    // Combine all slides (special slides + content slides)
    let allSlides = []

    // Add introduction slide
    if (specialSlidesResponse && Array.isArray(specialSlidesResponse.specialSlides)) {
      // And in the slide combination section, update the find calls with type annotations:
      const introSlide = specialSlidesResponse.specialSlides.find(
        (slide: SpecialSlide) => slide.type === 'introduction',
      )
      if (introSlide) {
        allSlides.push({
          title: introSlide.title,
          content: introSlide.content,
          notes: introSlide.notes,
        })
      }
    }

    // Add agenda slide
    if (specialSlidesResponse && Array.isArray(specialSlidesResponse.specialSlides)) {
      const agendaSlide = specialSlidesResponse.specialSlides.find(
        (slide: SpecialSlide) => slide.type === 'agenda',
      )
      if (agendaSlide) {
        allSlides.push({
          title: agendaSlide.title,
          content: agendaSlide.content,
          notes: agendaSlide.notes,
        })
      }
    }

    // Add content slides
    allSlides = [...allSlides, ...allContentSlides]

    // Add assessment slide
    if (specialSlidesResponse && Array.isArray(specialSlidesResponse.specialSlides)) {
      const assessmentSlide = specialSlidesResponse.specialSlides.find(
        (slide: SpecialSlide) => slide.type === 'assessment',
      )
      if (assessmentSlide) {
        allSlides.push({
          title: assessmentSlide.title,
          content: assessmentSlide.content,
          notes: assessmentSlide.notes,
        })
      }
    }

    // Add conclusion slide
    if (specialSlidesResponse && Array.isArray(specialSlidesResponse.specialSlides)) {
      const conclusionSlide = specialSlidesResponse.specialSlides.find(
        (slide: SpecialSlide) => slide.type === 'conclusion',
      )
      if (conclusionSlide) {
        allSlides.push({
          title: conclusionSlide.title,
          content: conclusionSlide.content,
          notes: conclusionSlide.notes,
        })
      }
    }

    console.log(`Total slides (including special slides): ${allSlides.length}`)

    // Ensure all responses are objects before spreading
    const metadataObj =
      typeof metadataResponse === 'object' && metadataResponse !== null ? metadataResponse : {}
    const introObj =
      typeof introResponse === 'object' && introResponse !== null
        ? introResponse
        : { introduction: '' }
    const slidesObj = { slides: allSlides }
    const activitiesObj =
      typeof activitiesResponse === 'object' && activitiesResponse !== null
        ? activitiesResponse
        : {}
    const assessmentObj =
      typeof assessmentResponseWithQuestions === 'object' &&
      assessmentResponseWithQuestions !== null
        ? assessmentResponseWithQuestions
        : {}
    const readingsObj =
      typeof readingsResponse === 'object' && readingsResponse !== null ? readingsResponse : {}

    // Combine all responses into a single object
    const combinedResponse = {
      ...metadataObj,
      ...introObj,
      ...slidesObj,
      ...activitiesObj,
      ...assessmentObj,
      ...readingsObj,
      _sourceMetadata: sourceMetadata,
    }

    // Log the full response for debugging
    console.log('Combined response (full):', JSON.stringify(combinedResponse, null, 2))

    // Validate and sanitize the combined response
    const validatedContent = validateAndSanitizeContent(
      combinedResponse,
      contentType,
      difficultyLevel,
    )

    // Log the validated content for debugging
    console.log('Validated content (full):', JSON.stringify(validatedContent, null, 2))

    return validatedContent
  } catch (error) {
    console.error('Error generating content with AI model:', error)

    // Create a fallback content structure with default values
    const fallbackContent = createFallbackContent(topicName, contentType, difficultyLevel)

    // Log the fallback response
    console.log('Using fallback content due to AI model error')

    // Return the fallback content with an error message
    return {
      ...fallbackContent,
      _error: `AI model failed to generate content: ${error instanceof Error ? error.message : String(error)}. Using fallback structure.`,
    }
  }
}

/**
 * Process discussion questions with the new simplified format
 * @param questionsText The raw text containing discussion questions
 * @param topicName The topic name for fallback questions
 * @returns Processed discussion questions
 */
async function processDiscussionQuestions(
  questionsText: string,
  topicName: string,
): Promise<AssessmentQuestion[]> {
  // Step 1: Extract and clean the JSON
  let cleanedText = questionsText.trim()

  // Extract JSON array if embedded in other text
  const jsonMatch = cleanedText.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (jsonMatch) {
    cleanedText = jsonMatch[0]
  }

  // Fix common JSON syntax issues and remove control characters
  cleanedText = cleanedText
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove all control characters
    .replace(/\\(?!["\\/bfnrt])/g, '\\\\') // Escape backslashes not part of escape sequences
    .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
    .replace(/([{,])\s*'([^']*)':/g, '$1"$2":') // Replace single quotes with double quotes for keys
    .replace(/:\s*'([^']*)'/g, ':"$1"') // Replace single quotes with double quotes for string values
    .replace(/\\n/g, '\\n') // Ensure newlines are properly escaped
    .replace(/\\r/g, '\\r') // Ensure carriage returns are properly escaped
    .replace(/\\t/g, '\\t') // Ensure tabs are properly escaped

  try {
    // Step 2: Parse the JSON
    const questions = JSON.parse(cleanedText)

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions format')
    }

    // Step 3: Process each question separately
    return questions.map((q) => {
      // Part 1: Process question and correct answer
      const questionPart = {
        question: q.question || `How does ${topicName} apply in real-world scenarios?`,
        // Ensure correctAnswer is never undefined
        correctAnswer:
          q.correctAnswer || `Discussion should cover practical applications of ${topicName}.`,
      }

      // Part 2: Process model answer and explanation
      const explanationPart = {
        modelAnswer:
          q.modelAnswer ||
          `A comprehensive answer would address key aspects of ${topicName} including...`,
        explanation:
          q.explanation ||
          `This question helps students explore the practical implications of ${topicName}.`,
      }

      // Merge the parts
      return {
        ...questionPart,
        ...explanationPart,
        pointAllocation: 'Default',
      }
    })
  } catch (error) {
    console.error('Error parsing discussion questions JSON:', error)

    // Fallback to text-based parsing
    const textParsedQuestions = parseQuestionsText(questionsText, 'discussion')

    if (textParsedQuestions.length > 0) {
      // Ensure all questions have the required fields
      return textParsedQuestions.map((q) => ({
        question: q.question || `How does ${topicName} apply in real-world scenarios?`,
        correctAnswer: q.correctAnswer || `Discussion should cover key aspects of ${topicName}.`,
        modelAnswer:
          q.modelAnswer ||
          `A comprehensive answer would address key aspects of ${topicName} including...`,
        explanation:
          q.explanation ||
          `This question helps students explore the practical implications of ${topicName}.`,
        pointAllocation: 'Default',
      }))
    }

    // If all parsing fails, return default questions
    return createDefaultDiscussionQuestions(topicName)
  }
}

/**
 * Create default discussion questions when all parsing fails
 * @param topicName The topic name
 * @returns Default discussion questions
 */
function createDefaultDiscussionQuestions(topicName: string): AssessmentQuestion[] {
  return [
    {
      question: `How does ${topicName} relate to real-world applications?`,
      correctAnswer:
        'Discussion should cover practical applications, implementation challenges, and potential outcomes.',
      modelAnswer: `A comprehensive answer would address how ${topicName} is applied in various industries, the technical challenges that arise during implementation, and the benefits that can be achieved. For example, in the context of neural networks, pruning techniques are widely used in mobile applications to reduce model size and improve inference speed. The answer should also discuss how different approaches might be suitable for different hardware constraints.`,
      explanation: `This question encourages students to think beyond theoretical concepts and consider practical implications. It helps bridge the gap between academic knowledge and industry applications.`,
      pointAllocation: 'Default',
    },
    {
      question: `What are the ethical implications of ${topicName} in different contexts?`,
      correctAnswer:
        'Discussion should address ethical considerations, potential conflicts, and responsible implementation approaches.',
      modelAnswer: `A thorough response would examine the ethical dimensions of ${topicName}, including potential biases, accessibility concerns, and societal impacts. The answer should consider multiple stakeholder perspectives and propose frameworks for ethical decision-making. For instance, when discussing neural network pruning, considerations about how pruning might affect model fairness and whether certain pruning techniques might disproportionately impact performance on minority groups in the data should be addressed.`,
      explanation: `This question helps students develop critical thinking about the broader implications of technical decisions. It encourages consideration of diverse perspectives and responsible technology development.`,
      pointAllocation: 'Default',
    },
  ]
}
