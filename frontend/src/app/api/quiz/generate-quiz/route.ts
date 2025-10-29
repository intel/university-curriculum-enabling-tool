// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { createOllama } from 'ollama-ai-provider-v2'
import { type ModelMessage, generateObject } from 'ai'
import { NextResponse } from 'next/server'
import { getStoredChunks } from '@/lib/chunk/get-stored-chunks'
import { effectiveTokenCountForText } from '@/lib/utils'
import { errorResponse } from '@/lib/api-response'
import type { ClientSource } from '@/lib/types/client-source'
import type { ContextChunk } from '@/lib/types/context-chunk'

export const dynamic = 'force-dynamic'

// Configuration constants
const TEMPERATURE = Number.parseFloat(process.env.RAG_TEMPERATURE || '0.1')
const TOKEN_MAX = Number.parseInt(process.env.RAG_TOKEN_MAX ?? '2048')
const TOKEN_RESPONSE_BUDGET = 2048
const TOKEN_CONTEXT_BUDGET = 1024

export async function POST(req: Request) {
  try {
    const {
      selectedModel,
      selectedSources,
      difficulty,
      numQuestions,
      questionType,
      language,
      courseInfo,
      searchKeywords,
    } = await req.json()

    console.log('Data from request:', {
      selectedModel,
      selectedSources,
      difficulty,
      numQuestions,
      questionType,
      courseInfo,
      searchKeywords,
    })

    const ollamaUrl = process.env.OLLAMA_URL
    if (!ollamaUrl) {
      throw new Error('OLLAMA_URL is not defined in environment variables.')
    }
    const ollama = createOllama({ baseURL: ollamaUrl + '/api' })

    const getQuestionTypePrompt = (type: string, difficulty: string, lang: 'en' | 'id') => {
      const basePromptsEN = {
        mcq: `Create multiple choice questions with:
        - Clear question text
        - Exactly 4 options per question
        - One correct answer
        - Other options should be plausible but clearly incorrect
        - ${
          difficulty === 'easy'
            ? 'Simple, distinct options'
            : difficulty === 'medium'
              ? 'Moderately challenging distractors'
              : 'Sophisticated distractors that require careful analysis'
        }
        - Detailed explanation of why the correct answer is right`,

        fillInTheBlank: `Create fill-in-the-blank questions with:
        - Complete sentences or paragraphs
        - Exactly one [BLANK] per question where key terms should be filled
        - ${
          difficulty === 'easy'
            ? 'Basic vocabulary and simple concepts'
            : difficulty === 'medium'
              ? 'More complex terminology and relationships'
              : 'Advanced concepts and technical terminology'
        }
        - The blank should test important concepts
        - Provide the exact word or phrase that should fill the blank
        - Include context clues in the sentence
        `,

        shortAnswer: `Create short answer questions with:
        - Open-ended questions that require understanding
        - Clear, focused questions that can be answered in ${
          difficulty === 'easy'
            ? '1-2 simple sentences'
            : difficulty === 'medium'
              ? '2-3 detailed sentences'
              : '3-4 comprehensive sentences'
        }
        - Model answers that include key points
        - List of acceptable variations or key concepts
        - ${
          difficulty === 'easy'
            ? 'Basic concepts and straightforward answers'
            : difficulty === 'medium'
              ? 'Multiple concepts and relationships'
              : 'Complex analysis and comprehensive explanations'
        }
        - Scoring criteria in the explanation`,

        trueFalse: `Create true/false questions with:
        - Clear, unambiguous statements that are either true or false
        - ${
          difficulty === 'easy'
            ? 'Basic facts and simple concepts'
            : difficulty === 'medium'
              ? 'Relationships between multiple concepts'
              : 'Complex relationships and nuanced understanding'
        }
        - No double negatives or tricky wording
        - Detailed explanation of why the statement is true or false
        - Focus on important concepts from the context
        - Include both true and false statements in a balanced way`,
      }

      const basePromptsID = {
        mcq: `Buat soal pilihan ganda dengan:
        - Teks pertanyaan yang jelas
        - Tepat 4 opsi per pertanyaan
        - Satu jawaban benar
        - Opsi lain harus masuk akal namun jelas salah
        - ${
          difficulty === 'easy'
            ? 'Opsi sederhana dan berbeda jelas'
            : difficulty === 'medium'
              ? 'Pengecoh dengan tingkat kesulitan sedang'
              : 'Pengecoh canggih yang membutuhkan analisis cermat'
        }
        - Penjelasan rinci mengapa jawaban benar tepat`,

        fillInTheBlank: `Buat soal isian dengan:
        - Kalimat atau paragraf yang utuh
        - Tepat satu [BLANK] per pertanyaan untuk mengisi istilah kunci
        - ${
          difficulty === 'easy'
            ? 'Kosakata dasar dan konsep sederhana'
            : difficulty === 'medium'
              ? 'Terminologi dan relasi yang lebih kompleks'
              : 'Konsep lanjutan dan terminologi teknis'
        }
        - Bagian kosong harus menguji konsep penting
        - Sertakan kata atau frasa tepat yang mengisi bagian kosong
        - Sertakan petunjuk konteks dalam kalimat`,

        shortAnswer: `Buat soal jawaban singkat dengan:
        - Pertanyaan terbuka yang menuntut pemahaman
        - Pertanyaan jelas dan fokus yang dapat dijawab dalam ${
          difficulty === 'easy'
            ? '1–2 kalimat sederhana'
            : difficulty === 'medium'
              ? '2–3 kalimat rinci'
              : '3–4 kalimat komprehensif'
        }
        - Jawaban contoh yang memuat poin kunci
        - Daftar variasi jawaban yang dapat diterima atau konsep kunci
        - ${
          difficulty === 'easy'
            ? 'Konsep dasar dan jawaban lugas'
            : difficulty === 'medium'
              ? 'Beberapa konsep dan hubungan'
              : 'Analisis kompleks dan penjelasan menyeluruh'
        }
        - Kriteria penilaian pada penjelasan`,

        trueFalse: `Buat soal benar/salah dengan:
        - Pernyataan yang jelas dan tidak ambigu (benar atau salah)
        - ${
          difficulty === 'easy'
            ? 'Fakta dasar dan konsep sederhana'
            : difficulty === 'medium'
              ? 'Hubungan antar beberapa konsep'
              : 'Relasi kompleks dan pemahaman yang bernuansa'
        }
        - Hindari kalimat berlapis negatif atau menjebak
        - Penjelasan rinci mengapa pernyataan benar atau salah
        - Fokus pada konsep penting dari konteks
        - Seimbangkan jumlah pernyataan benar dan salah`,
      }

      const dict = lang === 'id' ? basePromptsID : basePromptsEN
      return dict[type as keyof typeof dict] || ''
    }

    const getDifficultyPrompt = (difficulty: string, lang: 'en' | 'id') => {
      if (lang === 'id') {
        switch (difficulty) {
          case 'easy':
            return `Buat soal ramah pemula yang:
      - Menggunakan bahasa sederhana dan jelas
      - Berfokus pada konsep dasar dan definisi
      - Memberikan jawaban yang langsung
      - Menyertakan petunjuk konteks yang membantu
      - Menghindari terminologi yang rumit`
          case 'medium':
            return `Buat soal tingkat menengah yang:
      - Menggabungkan beberapa konsep
      - Membutuhkan pemikiran analitis
      - Menguji pemahaman hubungan antar konsep
      - Menyertakan sebagian terminologi teknis
      - Menantang peserta untuk menerapkan pengetahuannya`
          case 'hard':
            return `Buat soal tingkat lanjut yang:
      - Menguji pemahaman mendalam terhadap konsep kompleks
      - Membutuhkan pemikiran kritis dan analisis
      - Menyertakan terminologi dan konsep tingkat lanjut
      - Menantang peserta mensintesis informasi
      - Menguji kasus tepi dan pemahaman yang bernuansa`
          default:
            return ''
        }
      }
      // English default
      switch (difficulty) {
        case 'easy':
          return `Create beginner-friendly questions that:
      - Use simple, clear language
      - Focus on basic concepts and definitions
      - Provide straightforward answers
      - Include helpful context clues
      - Avoid complex terminology`
        case 'medium':
          return `Create intermediate-level questions that:
      - Combine multiple concepts
      - Require analytical thinking
      - Test understanding of relationships between concepts
      - Include some technical terminology
      - Challenge learners to apply their knowledge`
        case 'hard':
          return `Create advanced-level questions that:
      - Test deep understanding of complex concepts
      - Require critical thinking and analysis
      - Include advanced terminology and concepts
      - Challenge learners to synthesize information
      - Test edge cases and nuanced understanding`
        default:
          return ''
      }
    }

    const quizLanguageDirective =
      language === 'id'
        ? 'PENTING: Anda harus menghasilkan seluruh keluaran kuis dalam Bahasa Indonesia.'
        : 'IMPORTANT: You must produce the entire quiz output in English.'

    const quizSystemPrompt =
      language === 'id'
        ? `${quizLanguageDirective}\n\nAnda adalah generator kuis. Buat kuis tingkat kesulitan ${difficulty} dengan TEPAT ${numQuestions} pertanyaan bertipe "${questionType}" berdasarkan konteks yang diberikan.

${getDifficultyPrompt(difficulty, language)}

${getQuestionTypePrompt(questionType, difficulty, language)}

Format SEMUA pertanyaan sebagai objek JSON dengan struktur berikut (JANGAN terjemahkan kunci JSON — gunakan tepat: questions, question, options, statement, correctAnswer, explanation, type, difficulty):
{
  "questions": [
    ${
      questionType === 'trueFalse'
        ? `{
              "statement": "Pernyataan yang dievaluasi sebagai benar atau salah",
              "correctAnswer": "true",
              "explanation": "Penjelasan rinci mengapa pernyataan benar atau salah. HARUS berupa string (bukan objek/array) dan tersusun baik untuk dibaca manusia. Dalam 1 atau 2 kalimat.",
              "type": "trueFalse",
              "difficulty": "${difficulty}"
            }`
        : `{
              "question": "Teks pertanyaan ${questionType === 'fillInTheBlank' ? 'dengan [BLANK]' : ''}",
              ${questionType === 'mcq' ? '"options": ["Option 1", "Option 2", "Option 3", "Option 4"],' : ''}
              "correctAnswer": "Jawaban benar atau kata untuk mengisi blank",
              "explanation": "Penjelasan rinci beserta kriteria penilaian. HARUS berupa string (bukan objek/array) dan terstruktur baik untuk dibaca manusia.",
              "type": "${questionType}",
              "difficulty": "${difficulty}"
            }`
    }
  ]
}

PENTING:
- SEMUA pertanyaan HARUS bertipe "${questionType}"
- SEMUA pertanyaan HARUS mempertahankan tingkat kesulitan ${difficulty}
- Penjelasan harus sesuai dengan tingkat kesulitan`
        : `${quizLanguageDirective}\n\nYou are a quiz generator. Create a ${difficulty} difficulty quiz with EXACTLY ${numQuestions} questions of type "${questionType}" based on the provided context.

${getDifficultyPrompt(difficulty, language)}

${getQuestionTypePrompt(questionType, difficulty, language)}

Format ALL questions as a JSON object with this structure (Do NOT translate JSON keys — use exactly: questions, question, options, statement, correctAnswer, explanation, type, difficulty):
{
  "questions": [
    ${
      questionType === 'trueFalse'
        ? `{
              "statement": "Statement to evaluate as true or false",
              "correctAnswer": "true",
              "explanation": "Detailed explanation of why the statement is true or false. MUST be a string (not an object or array) and should be well-structured for human readability. In 1 or 2 sentences.",
              "type": "trueFalse",
              "difficulty": "${difficulty}"
            }`
        : `{
              "question": "Question text ${questionType === 'fillInTheBlank' ? 'with [BLANK]' : ''}",
              ${questionType === 'mcq' ? '"options": ["Option 1", "Option 2", "Option 3", "Option 4"],' : ''}
              "correctAnswer": "Correct answer or word for blank",
              "explanation": "Detailed explanation with scoring criteria. MUST be a string (not an object or array) and should be well-structured for human readability.",
              "type": "${questionType}",
              "difficulty": "${difficulty}"
            }`
    }
  ]
}

IMPORTANT: 
- ALL questions MUST be of type "${questionType}"
- ALL questions MUST maintain the specified ${difficulty} difficulty level
- Explanations should be appropriate for the difficulty level`

    const systemMessage: ModelMessage = {
      role: 'system',
      content: quizSystemPrompt,
    }

    const userMessage: ModelMessage = {
      role: 'user',
      content:
        language === 'id'
          ? `Hasilkan ${numQuestions} pertanyaan bertipe ${questionType} berdasarkan konteks yang diberikan.`
          : `Generate ${numQuestions} ${questionType} questions based on the provided context.`,
    }

    let usedTokens =
      effectiveTokenCountForText(quizSystemPrompt) +
      effectiveTokenCountForText(userMessage.content.toString())
    let chunkContent = ''
    let chunksAdded = 0
    let assistantContent = ''

    const keywordQuery =
      searchKeywords && typeof searchKeywords === 'string' ? searchKeywords.trim() : ''

    let effectiveSources: ClientSource[] = []
    if (Array.isArray(selectedSources)) {
      const sources = selectedSources as ClientSource[]
      const anyHasSelectedFlag = sources.some((source) => typeof source?.selected === 'boolean')
      effectiveSources = anyHasSelectedFlag ? sources.filter((source) => source?.selected) : sources
    }
    const hasSelectedSources = effectiveSources.length > 0

    const courseName =
      typeof courseInfo?.courseName === 'string' ? courseInfo.courseName.trim() : ''
    const courseCode =
      typeof courseInfo?.courseCode === 'string' ? courseInfo.courseCode.trim() : ''
    const courseDescription =
      typeof courseInfo?.courseDescription === 'string' ? courseInfo.courseDescription.trim() : ''

    const courseContextSegments: string[] = []
    const primaryCourseLabel = [courseCode, courseName].filter(Boolean).join(' ').trim()
    if (primaryCourseLabel) {
      courseContextSegments.push(
        `${language === 'id' ? 'Mata kuliah' : 'Course'}: ${primaryCourseLabel}`,
      )
    }
    if (courseDescription) {
      courseContextSegments.push(
        language === 'id'
          ? `Deskripsi mata kuliah:\n${courseDescription}`
          : `Course description:\n${courseDescription}`,
      )
    }
    const courseContext = courseContextSegments.join('\n\n')

    try {
      let retrievedChunks: ContextChunk[] = []

      if (hasSelectedSources) {
        retrievedChunks = await getStoredChunks(effectiveSources)
        console.log('Retrieved chunks:', retrievedChunks.length)
      } else {
        console.log('No sources selected; using course description context.')
      }

      for (const chunk of retrievedChunks) {
        const chunkTokens = effectiveTokenCountForText(chunk.chunk)
        if (usedTokens + chunkTokens <= TOKEN_CONTEXT_BUDGET) {
          chunkContent += `\n\n${chunk.chunk}`
          usedTokens += chunkTokens
          chunksAdded++
        } else {
          break
        }
      }

      if (chunkContent) {
        assistantContent = keywordQuery
          ? `${chunkContent}\n\nFocus on these user-provided topics and keywords:\n${keywordQuery}`
          : chunkContent
      } else if (courseContext) {
        assistantContent = keywordQuery
          ? `${courseContext}\n\nAdditional user-provided topics and keywords:\n${keywordQuery}`
          : courseContext
      } else if (keywordQuery) {
        assistantContent = `Focus the quiz on the following topics and keywords:\n${keywordQuery}`
      } else {
        assistantContent =
          language === 'id'
            ? 'Tidak ada konteks khusus yang ditemukan. Gunakan pengetahuan umum akademik untuk menyusun kuis.'
            : 'No specific context provided. Use general academic knowledge to craft the quiz.'
      }
      console.log(
        `Total Chunks: ${chunksAdded}/${retrievedChunks.length} | ` +
          `Prompt tokens: ` +
          `system(${effectiveTokenCountForText(systemMessage.content.toString())}) ` +
          `user(${effectiveTokenCountForText(userMessage.content.toString())}) ` +
          `assistant(${effectiveTokenCountForText(assistantContent)}) | ` +
          `Budget tokens: ` +
          `context(${TOKEN_CONTEXT_BUDGET}) ` +
          `response(${TOKEN_RESPONSE_BUDGET}) ` +
          `max(${TOKEN_MAX})`,
      )
    } catch (error) {
      console.error('Error retrieving knowledge:', error)
      assistantContent =
        courseContext ||
        (language === 'id'
          ? 'Terjadi kesalahan saat mengambil konteks. Gunakan pengetahuan umum akademik untuk menyusun kuis.'
          : 'An error occurred while retrieving context. Use general academic knowledge to craft the quiz.')
    }

    const assistantMessage: ModelMessage = {
      role: 'assistant',
      content: assistantContent,
    }

    const fullMessages = [systemMessage, assistantMessage, userMessage]

    console.log('Generating quiz with Ollama...')
    const startTime = Date.now()
    const { object: quiz, usage } = await generateObject({
      model: ollama(selectedModel),
      output: 'no-schema',
      messages: fullMessages,
      temperature: TEMPERATURE,
      maxOutputTokens: TOKEN_RESPONSE_BUDGET,
      providerOptions: {
        ollama: {
          mode: 'json',
          options: {
            numCtx: TOKEN_RESPONSE_BUDGET,
          },
        },
      },
    })

    // End timing and calculate the time taken.
    const endTime = Date.now()
    const timeTakenMs = endTime - startTime
    const timeTakenSeconds = timeTakenMs / 1000

    // Calculate token generation speed (prefer totalTokens, fallback to input+output).
    const totalTokens =
      typeof usage?.totalTokens === 'number'
        ? usage.totalTokens
        : (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)
    const tokenGenerationSpeed = timeTakenSeconds > 0 ? totalTokens / timeTakenSeconds : 0

    console.log(
      `Usage tokens: promptEst(${usedTokens}) prompt(${usage?.inputTokens ?? 0}) completion(${usage?.outputTokens ?? 0}) | ${tokenGenerationSpeed.toFixed(2)} t/s | Duration: ${timeTakenSeconds.toFixed(2)} s`,
    )
    console.log('Generated Quiz:', JSON.stringify(quiz, null, 2))

    // Normalize the quiz shape to always be { questions: [...] } and fix true/false specifics
    type NormalizedQuestion = {
      type: string
      difficulty: string
      question: string
      statement?: string
      options?: string[]
      correctAnswer: string
      explanation: string
      // allow passthrough unknown extra fields without typing here
      [key: string]: unknown
    }

    const isRecord = (val: unknown): val is Record<string, unknown> =>
      typeof val === 'object' && val !== null

    const normalizeQuiz = (
      raw: unknown,
      expectedType: string,
      expectedDifficulty: string,
    ): { questions: NormalizedQuestion[] } => {
      const extractQuestionsArray = (input: unknown): unknown[] => {
        if (!input) return []
        if (Array.isArray(input)) return input
        if (isRecord(input)) {
          const qVal = input.questions
          if (Array.isArray(qVal)) return qVal as unknown[]
          // try to find array value in object values
          const arrVal = Object.values(input).find((v) => Array.isArray(v))
          if (Array.isArray(arrVal)) return arrVal as unknown[]
        }
        return []
      }

      const toStringSafe = (v: unknown): string => {
        if (v === undefined || v === null) return ''
        if (typeof v === 'string') return v
        if (typeof v === 'boolean') {
          // Language-independent normalization for boolean-like fields
          return v ? 'True' : 'False'
        }
        try {
          return JSON.stringify(v)
        } catch {
          return String(v)
        }
      }

      const normType = (val: unknown): string => {
        const s = toStringSafe(val).toLowerCase()
        return s
      }

      const isTrueFalseType = (t: string): boolean => {
        const cleaned = t.replace(/[^a-z]/gi, '').toLowerCase()
        return cleaned === 'truefalse'
      }

      const normalized = extractQuestionsArray(raw).map((item): NormalizedQuestion => {
        const q = isRecord(item) ? (item as Record<string, unknown>) : {}
        const rawType = q.type ?? expectedType
        const typeStr = toStringSafe(rawType)
        const isTF = isTrueFalseType(normType(typeStr)) || expectedType === 'trueFalse'
        const statementVal = q.statement ?? q.Question ?? q.text
        const statement = statementVal !== undefined ? toStringSafe(statementVal) : undefined
        const questionTextVal = q.question ?? statementVal ?? ''
        const questionText = toStringSafe(questionTextVal)
        const correctAnsRaw = q.correctAnswer ?? q.answer
        const correctAnswer = isTF
          ? toStringSafe(
              typeof correctAnsRaw === 'boolean'
                ? correctAnsRaw
                : typeof correctAnsRaw === 'string'
                  ? /^(true|false)$/i.test(correctAnsRaw)
                    ? correctAnsRaw.toLowerCase() === 'true'
                      ? 'True'
                      : 'False'
                    : correctAnsRaw
                  : correctAnsRaw,
            )
          : toStringSafe(correctAnsRaw)

        // ensure options for true/false
        let options: string[] | undefined
        if (isTF) {
          options = ['True', 'False']
        } else if (Array.isArray(q.options)) {
          options = (q.options as unknown[]).map((o) => toStringSafe(o))
        }

        const explanation = toStringSafe(q.explanation)

        return {
          ...q,
          type: isTF ? 'trueFalse' : typeStr || expectedType,
          difficulty: toStringSafe(q.difficulty || expectedDifficulty) || expectedDifficulty,
          question: questionText,
          ...(statement ? { statement } : {}),
          correctAnswer,
          ...(options ? { options } : {}),
          explanation,
        }
      })

      return { questions: normalized }
    }

    const normalizedQuiz = normalizeQuiz(quiz, questionType, difficulty)
    // // Validate question types
    // interface QuizQuestion {
    //     type: string
    //     difficulty: string
    //     question: string
    //     options?: string[]
    //     correctAnswer?: string
    //     correctAnswers?: string[]
    //     explanation: string
    //     statement?: string
    //   }

    //   interface Quiz {
    //     questions: QuizQuestion[]
    //   }

    //   const quizResult = quiz as Quiz

    //   if (!quizResult || !quizResult.questions || !Array.isArray(quizResult.questions)) {
    //     throw new Error("Invalid quiz format")
    //   }

    //   if (quizResult.questions.length !== numQuestions) {
    //     throw new Error(`Invalid number of questions. Expected ${numQuestions}, got ${quizResult.questions.length}`)
    //   }

    //   // Ensure all questions are of the selected type
    //   const invalidQuestions = quizResult.questions.filter((q) => q.type !== questionType)
    //   if (invalidQuestions.length > 0) {
    //     throw new Error(`Some questions have incorrect type. All questions must be of type "${questionType}"`)
    //   }

    //   // Validate difficulty level
    //   if (!quizResult.questions.every((q) => q.difficulty === difficulty)) {
    //     throw new Error(
    //       `Some questions have incorrect difficulty level. All questions must be "${difficulty}" difficulty`,
    //     )
    //   }

    return NextResponse.json(normalizedQuiz)
  } catch (error) {
    console.error('Error in summary generation:', error)
    return errorResponse('An unexpected error occurred', null, 500)
  }
}
