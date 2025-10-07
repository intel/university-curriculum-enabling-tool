// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider'
import { languageDirective, type Lang } from '@/lib/utils/lang'
import { type CoreMessage, generateText } from 'ai'
import type { ClientSource } from '@/lib/types/client-source'
import type { CourseInfo } from '@/lib/types/course-info-types'
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
  getIntroSystemPrompt,
  getSpecialSlidesSystemPrompt,
  getContentSlidesSystemPrompt,
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
  language: Lang,
  courseInfo?: CourseInfo,
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
    const hasSelectedSources = Array.isArray(selectedSources) && selectedSources.length > 0
    const { content: assistantContent, metadata: sourceMetadata } = hasSelectedSources
      ? await prepareSourceContent(selectedSources, topicName, courseInfo)
      : {
          content: '',
          metadata: { sourceCount: 0, chunkCount: 0, tokenEstimate: 0, sourceNames: [] },
        }

    const hasSourceMaterials = hasSelectedSources && assistantContent.includes('SOURCE')

    // Build assistant message only when we have sources
    const assistantMessage: CoreMessage | null = hasSourceMaterials
      ? { role: 'assistant', content: assistantContent }
      : null

    // Determine effective topic: when sources are selected, use topicName; when no sources, prefer courseInfo.courseName
    const effectiveTopic = hasSelectedSources
      ? topicName && topicName.trim().length > 0
        ? topicName
        : courseInfo?.courseName || 'this course'
      : courseInfo?.courseName && courseInfo.courseName.trim().length > 0
        ? courseInfo.courseName
        : topicName && topicName.trim().length > 0
          ? topicName
          : 'this course'

    console.log('=== TOPIC SELECTION DEBUG ===')
    console.log('hasSelectedSources:', hasSelectedSources)
    console.log('hasSourceMaterials:', hasSourceMaterials)
    console.log('topicName:', topicName)
    console.log('courseInfo?.courseName:', courseInfo?.courseName)
    console.log('effectiveTopic:', effectiveTopic)
    console.log('=== END TOPIC DEBUG ===')

    console.log('Generating course content with Ollama in sequential steps...')

    const langDirective = languageDirective

    // STEP 1: Generate basic metadata (title, contentType, difficultyLevel, learningOutcomes, keyTerms)
    console.log('STEP 1: Generating basic metadata...')

    const contentTypePrompt = getContentTypePrompt(contentType)
    const contentStylePrompt = getContentStylePrompt(contentStyle)

    // Add specialized prompts for tutorials and workshops
    const specializedPrompt =
      contentType === 'tutorial'
        ? `For this tutorial, make sure you:
    - Structure the content as a learning journey with clear progression
    - Include step-by-step instructions that build skills gradually
    - Provide example solutions with reasoning/explanation of the approach
    - Include troubleshooting tips for common mistakes
    - Add reflection questions after each major section
    - Ensure activities have clear success criteria
    - Provide foundational exercises and enrichment activities for differentiation`
        : contentType === 'workshop'
          ? `For this workshop, make sure you:
    - Design activities that encourage active participation and collaboration
    - Include detailed facilitation notes for the instructor
    - Provide clear time guidance for each activity
    - Include discussion prompts that connect theory to practice
    - Structure activities with clear phases (introduction, core activity, closing)
    - Include guidance for managing group dynamics
    - Provide templates and worksheets to support activities`
          : ''

    const difficultyLevelPrompt = getDifficultyLevelPrompt(difficultyLevel)

    const metadataSystemPrompt = getMetadataSystemPrompt(
      difficultyLevel,
      contentType,
      contentTypePrompt,
      contentStylePrompt,
      difficultyLevelPrompt,
      specializedPrompt, // Add this parameter
      language,
      hasSourceMaterials,
    )

    const metadataSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${metadataSystemPrompt}`,
    }

    const metadataUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat judul, capaian pembelajaran, dan setidaknya 5-10 istilah kunci untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" SECARA KETAT berdasarkan materi sumber di atas. Semua dalam Bahasa Indonesia.`
            : `Buat judul, capaian pembelajaran, dan setidaknya 5-10 istilah kunci untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}". Semua dalam Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create a title, learning outcomes, and at least 5-10 key terms for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" STRICTLY based on the source materials provided above. All content MUST be in English.`
            : `Create a title, learning outcomes, and at least 5-10 key terms for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}". All content MUST be in English.`,
    }

    const metadataMessages = assistantMessage
      ? [metadataSystemMessage, assistantMessage, metadataUserMessage]
      : [metadataSystemMessage, metadataUserMessage]

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

    const introSystemPrompt = getIntroSystemPrompt(
      difficultyLevel,
      contentType,
      effectiveTopic,
      sessionLength,
      language,
      hasSourceMaterials,
    )

    const introSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${introSystemPrompt}`,
    }

    const introUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat pengantar yang menarik untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas. Gunakan Bahasa Indonesia.`
            : `Buat pengantar yang menarik untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}". Gunakan Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create an engaging introduction for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above. Use English only.`
            : `Create an engaging introduction for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}". Use English only.`,
    }

    const introMessages = assistantMessage
      ? [introSystemMessage, assistantMessage, introUserMessage]
      : [introSystemMessage, introUserMessage]

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

    const specialSlidesSystemPrompt = getSpecialSlidesSystemPrompt(
      difficultyLevel,
      contentType,
      effectiveTopic,
      sessionLength,
      language,
      hasSourceMaterials,
    )

    const specialSlidesSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${specialSlidesSystemPrompt}`,
    }

    const specialSlidesUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat slide pengantar, agenda, penilaian, dan kesimpulan untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas. Gunakan Bahasa Indonesia.`
            : `Buat slide pengantar, agenda, penilaian, dan kesimpulan untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}". Gunakan Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create the introduction, agenda, assessment, and conclusion slides for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above. Use English only.`
            : `Create the introduction, agenda, assessment, and conclusion slides for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}". Use English only.`,
    }

    const specialSlidesMessages = assistantMessage
      ? [specialSlidesSystemMessage, assistantMessage, specialSlidesUserMessage]
      : [specialSlidesSystemMessage, specialSlidesUserMessage]

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

      const contentSlidesSystemPrompt = getContentSlidesSystemPrompt(
        startSlideNum,
        endSlideNum,
        totalContentSlidesNeeded,
        language,
        hasSourceMaterials,
      )

      const contentSlidesSystemMessage: CoreMessage = {
        role: 'system',
        content: `${langDirective(language)}\n\n${contentSlidesSystemPrompt}`,
      }

      const contentSlidesUserMessage: CoreMessage = {
        role: 'user',
        content:
          language === 'id'
            ? hasSourceMaterials
              ? `Buat slide konten ${startSlideNum} hingga ${endSlideNum} untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas.\n\nJANGAN membuat slide pengantar, agenda, penilaian, atau kesimpulan. Fokus HANYA pada slide konten instruksional inti. Gunakan Bahasa Indonesia.`
              : `Buat slide konten ${startSlideNum} hingga ${endSlideNum} untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}".\n\nJANGAN membuat slide pengantar, agenda, penilaian, atau kesimpulan. Fokus HANYA pada slide konten instruksional inti. Gunakan Bahasa Indonesia.`
            : hasSourceMaterials
              ? `Create content slides ${startSlideNum} to ${endSlideNum} for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above.\n\nDO NOT create introduction, agenda, assessment, or conclusion slides. Focus ONLY on core instructional content slides. Use English only.`
              : `Create content slides ${startSlideNum} to ${endSlideNum} for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}".\n\nDO NOT create introduction, agenda, assessment, or conclusion slides. Focus ONLY on core instructional content slides. Use English only.`,
      }

      const contentSlidesMessages = assistantMessage
        ? [contentSlidesSystemMessage, assistantMessage, contentSlidesUserMessage]
        : [contentSlidesSystemMessage, contentSlidesUserMessage]

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
      2,
      specializedPrompt,
      language,
      hasSourceMaterials,
    )

    const activitiesSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${activitiesSystemPrompt}`,
    }

    const activitiesUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat aktivitas untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas. Gunakan Bahasa Indonesia.`
            : `Buat aktivitas untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}". Gunakan Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create activities for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above. Use English only.`
            : `Create activities for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}". Use English only.`,
    }

    const activitiesMessages = assistantMessage
      ? [activitiesSystemMessage, assistantMessage, activitiesUserMessage]
      : [activitiesSystemMessage, activitiesUserMessage]

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
      effectiveTopic,
      sessionLength,
      '',
      language,
      hasSourceMaterials,
    )

    const assessmentSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${assessmentSystemPrompt}`,
    }

    const assessmentUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat ide penilaian (tanpa contoh pertanyaan) untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas. Gunakan Bahasa Indonesia.`
            : `Buat ide penilaian (tanpa contoh pertanyaan) untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}". Gunakan Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create assessment ideas (without example questions) for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above. Use English only.`
            : `Create assessment ideas (without example questions) for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}". Use English only.`,
    }

    const assessmentMessages = assistantMessage
      ? [assessmentSystemMessage, assistantMessage, assessmentUserMessage]
      : [assessmentSystemMessage, assessmentUserMessage]

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
      effectiveTopic,
      sessionLength,
      '',
      language,
      hasSourceMaterials,
    )

    const readingsSystemMessage: CoreMessage = {
      role: 'system',
      content: `${langDirective(language)}\n\n${readingsSystemPrompt}`,
    }

    const readingsUserMessage: CoreMessage = {
      role: 'user',
      content:
        language === 'id'
          ? hasSourceMaterials
            ? `Buat rekomendasi bacaan lanjutan untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}" SECARA KETAT berdasarkan materi sumber di atas. Gunakan Bahasa Indonesia.`
            : `Buat rekomendasi bacaan lanjutan untuk ${contentType} tingkat ${difficultyLevel} tentang "${effectiveTopic}" dengan judul "${metadataResponse.title}". Gunakan Bahasa Indonesia.`
          : hasSourceMaterials
            ? `Create further reading suggestions for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}" STRICTLY based on the source materials provided above. Use English only.`
            : `Create further reading suggestions for a ${difficultyLevel} level ${contentType} on "${effectiveTopic}" with the title "${metadataResponse.title}". Use English only.`,
    }

    const readingsMessages = assistantMessage
      ? [readingsSystemMessage, assistantMessage, readingsUserMessage]
      : [readingsSystemMessage, readingsUserMessage]

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
          const prompt = `${langDirective(language)}\n\n${getQuizQuestionPrompt(topicName, idea.description, language)}`

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
          const prompt = `${langDirective(language)}\n\n${getDiscussionQuestionPrompt(topicName, idea.description, language)}`

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
