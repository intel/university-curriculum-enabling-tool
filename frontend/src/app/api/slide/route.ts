// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { CourseContentRequest } from './types'
import { generateCourseContent } from './content-generator'
import { normalizeLanguage } from '@/lib/utils/lang'

export const dynamic = 'force-dynamic'

// Timeout for backend requests (ms), configurable via FASTAPI_TIMEOUT env var (default: 15000ms)
const REQUEST_TIMEOUT_MS = (() => {
  const val = process.env.FASTAPI_TIMEOUT
  const parsed = val ? parseInt(val, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000
})()

export async function POST(req: Request) {
  try {
    const requestData: CourseContentRequest = await req.json()

    // Check if this is a PPTX download request
    if (requestData.action === 'download-pptx') {
      console.log('Processing PPTX download request')

      if (!requestData.content) {
        return NextResponse.json(
          { error: 'No content provided for PPTX generation' },
          { status: 400 },
        )
      }

      try {
        // Resolve backend URL with safe fallback and explicit timeout
        const baseBackendUrl =
          process.env.FASTAPI_SERVER_URL ||
          process.env.BACKEND_SERVER_URL ||
          'http://127.0.0.1:8016'

        let backendGeneratePptxUrl: string
        try {
          backendGeneratePptxUrl = new URL('/generate-pptx', baseBackendUrl).href
        } catch (e) {
          console.error('Invalid FASTAPI server URL:', baseBackendUrl, e)
          throw new Error(
            `Invalid FASTAPI_SERVER_URL configuration: ${baseBackendUrl}. Please set FASTAPI_SERVER_URL (e.g., http://127.0.0.1:8016).`,
          )
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        let response: Response
        try {
          response = await fetch(backendGeneratePptxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: requestData.content, language: requestData.language }),
            signal: controller.signal,
          })
        } catch (err: unknown) {
          const isAbortError =
            typeof err === 'object' &&
            err !== null &&
            'name' in err &&
            (err as { name?: string }).name === 'AbortError'
          if (isAbortError) {
            throw new Error(
              `Timed out connecting to backend at ${baseBackendUrl}. Ensure the FastAPI server is running.`,
            )
          }
          // Node fetch ECONNREFUSED or other network errors
          throw new Error(
            `Failed to connect to backend at ${baseBackendUrl}. Ensure the FastAPI server is running and accessible. (Original error: ${(err as Error).message})`,
          )
        } finally {
          clearTimeout(timeout)
        }

        if (!response.ok) {
          const errorText = await response.text()
          let errorMessage = 'Failed to generate PowerPoint presentation'

          try {
            const errorData = JSON.parse(errorText)
            errorMessage = errorData.error || errorMessage
          } catch {
            errorMessage = errorText || errorMessage
          }

          throw new Error(errorMessage)
        }
        // Get the response as a blob
        const blob = await response.blob()

        // Return the response with proper headers
        return new NextResponse(blob, {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(
              requestData.content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
            )}.pptx"`,
          },
        })
      } catch (error) {
        console.error('Error handling PPTX download:', error)
        return NextResponse.json(
          {
            error:
              error instanceof Error ? error.message : 'Failed to generate PowerPoint presentation',
          },
          { status: 500 },
        )
      }
    }

    // Check if this is a PDF download request
    if (requestData.action === 'download-pdf') {
      console.log('Processing PDF download request')

      if (!requestData.content) {
        return NextResponse.json(
          { error: 'No content provided for PDF generation' },
          { status: 400 },
        )
      }

      try {
        // Redirect to the dedicated download-pdf endpoint
        const response = await fetch(new URL('/api/slide/download-pdf', req.url).href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: requestData.content, language: requestData.language }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          let errorMessage = 'Failed to generate PDF document'

          try {
            const errorData = JSON.parse(errorText)
            errorMessage = errorData.error || errorMessage
          } catch {
            // If parsing fails, use the raw error text
            errorMessage = errorText || errorMessage
          }

          throw new Error(errorMessage)
        }

        // Get the response as an array buffer
        const buffer = await response.arrayBuffer()

        // Return the response with proper headers
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(
              requestData.content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
            )}.pdf"`,
          },
        })
      } catch (error) {
        console.error('Error handling PDF download:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to generate PDF document' },
          { status: 500 },
        )
      }
    }

    // Otherwise, handle content generation
    const {
      selectedModel,
      selectedSources,
      contentType,
      contentStyle,
      sessionLength,
      difficultyLevel,
      topicName,
      language,
      courseInfo,
    } = requestData

    console.log('Data from request:', {
      selectedModel,
      selectedSources,
      contentType,
      contentStyle,
      sessionLength,
      difficultyLevel,
      topicName,
      language,
    })

    // Basic validation: ensure either sources or course info is provided
    const hasValidSources =
      Array.isArray(selectedSources) &&
      selectedSources.length > 0 &&
      selectedSources.every(
        (source) => source && typeof source === 'object' && 'id' in source && 'name' in source,
      )

    if (!hasValidSources && !courseInfo?.courseName && !courseInfo?.courseDescription) {
      console.warn('DEBUG: No sources or course information provided in POST /api/slide')
      return NextResponse.json(
        { error: 'Either sources or course information must be provided.' },
        { status: 400 },
      )
    }

    // Generate course content
    const generatedContent = await generateCourseContent(
      selectedModel,
      selectedSources,
      contentType,
      contentStyle,
      sessionLength,
      difficultyLevel,
      topicName,
      normalizeLanguage(language),
      courseInfo,
    )

    return NextResponse.json(generatedContent)
  } catch (error) {
    console.error('Error in POST handler:', error)
    return NextResponse.json(
      { error: 'An error occurred while processing the request.' },
      { status: 500 },
    )
  }
}
