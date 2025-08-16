import { NextResponse } from 'next/server'
import type { CourseContentRequest } from './types'
import { generateCourseContent } from './content-generator'

export const dynamic = 'force-dynamic'

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
        // Call the backend's generate-pptx endpoint
        const backendGeneratePptxUrl = new URL('/generate-pptx', process.env.FASTAPI_SERVER_URL)
          .href
        const response = await fetch(backendGeneratePptxUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: requestData.content }),
        })

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
          body: JSON.stringify({ content: requestData.content }),
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
    } = requestData

    console.log('Data from request:', {
      selectedModel,
      selectedSources,
      contentType,
      contentStyle,
      sessionLength,
      difficultyLevel,
      topicName,
    })

    // Generate course content
    const generatedContent = await generateCourseContent(
      selectedModel,
      selectedSources,
      contentType,
      contentStyle,
      sessionLength,
      difficultyLevel,
      topicName,
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
