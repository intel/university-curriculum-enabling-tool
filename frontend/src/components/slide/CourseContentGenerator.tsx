// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ContextRequirementMessage } from '@/components/context-requirement-message'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { useCourses } from '@/lib/hooks/use-courses'
import type { Course } from '@/payload-types'
import { useSourcesStore } from '@/lib/store/sources-store'
import type { LectureContent, View } from '@/lib/types/slide'
import { WelcomeView } from './WelcomeView'
import { ConfigView } from './ConfigView'
import { ContentView } from './ContentView'
import { usePersonaStore } from '@/lib/store/persona-store'

export default function CourseContentGenerator() {
  const [courseContent, setCourseContent] = useState<LectureContent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [contentType, setContentType] = useState('lecture')
  const [contentStyle, setContentStyle] = useState('traditional')
  const [sessionLength, setSessionLength] = useState(60)
  const [difficultyLevel, setDifficultyLevel] = useState('intermediate')
  const [topicName, setTopicName] = useState('')
  const [currentView, setCurrentView] = useState<View>('welcome')
  const [activeTab, setActiveTab] = useState('overview')
  const [progress, setProgress] = useState(0)
  const [isPptxGenerating, setIsPptxGenerating] = useState(false)
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({})
  const [sourceMetadata, setSourceMetadata] = useState<{
    sourceCount: number
    chunkCount: number
    tokenEstimate: number
    sourceNames: string[]
  } | null>(null)

  const { getActiveContextModelName } = useContextAvailability()
  const { data: coursesData } = useCourses()
  const selectedModel = getActiveContextModelName()
  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const activePersona = usePersonaStore((s) => s.activePersona)
  const getPersonaLanguage = usePersonaStore((s) => s.getPersonaLanguage)
  const selectedCourseId = usePersonaStore((s) => s.selectedCourseId)

  const generateCourseContent = async () => {
    if (!selectedModel) {
      toast.error('Please select a model.')
      return
    }

    if (!topicName.trim()) {
      toast.error('Please enter a topic name.')
      return
    }

    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length
    // Allow 0 or 1 source selected; block only if more than one
    if (selectedSourcesCount > 1) {
      toast.error('Please select at most one source.')
      return
    }

    setIsLoading(true)
    setProgress(0)
    setGenerationError(null)
    setSourceMetadata(null)
    setExpandedQuestions({})

    try {
      // Derive courseInfo from the selected course (if available)
      const selectedCourse = coursesData?.docs?.find((c: Course) => c.id === selectedCourseId)
      const courseInfo = selectedCourse
        ? {
            courseCode: selectedCourse.code || '',
            courseName: selectedCourse.name || '',
          }
        : undefined

      const response = await fetch('/api/slide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel,
          selectedSources,
          contentType,
          contentStyle,
          sessionLength,
          difficultyLevel,
          topicName,
          language: getPersonaLanguage(activePersona),
          courseInfo,
        }),
      })

      setProgress(100)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate course content')
      }

      const data = await response.json()

      // Check if there was an error in generation but the API still returned fallback content
      if (data._error) {
        setGenerationError(data._error)
        toast.warning('Content generation had issues. Using fallback content.')
      } else {
        toast.success('Course content generated successfully (using sources if provided).')
      }

      // Store source metadata if available
      if (data._sourceMetadata) {
        setSourceMetadata(data._sourceMetadata)
      }

      setCourseContent(data)
      setCurrentView('content')
    } catch (err) {
      console.error('Error generating course content:', err)
      toast.error(
        err instanceof Error ? err.message : 'Failed to generate course content. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadPPTX = async () => {
    if (!courseContent) return

    setIsPptxGenerating(true)
    try {
      // Add content type and difficulty level to the content if not already present
      const enhancedContent = {
        ...courseContent,
        contentType: contentType,
        difficultyLevel: difficultyLevel,
      }

      console.log('Sending PPTX generation request for:', enhancedContent.title)

      const response = await fetch('/api/slide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'download-pptx',
          content: enhancedContent,
          // Pass persona language so the PPTX headings can be localized
          language: getPersonaLanguage(activePersona),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.error || 'Failed to generate PowerPoint presentation')
        } catch {
          throw new Error(errorText || 'Failed to generate PowerPoint presentation')
        }
      }

      // Get the blob from the response
      const blob = await response.blob()

      if (blob.size === 0) {
        throw new Error('Generated PowerPoint file is empty')
      }

      // Create a download link and trigger the download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${courseContent.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('PowerPoint presentation downloaded successfully!')
    } catch (error) {
      console.error('Error generating PPTX:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to generate PowerPoint presentation. Please try again.',
      )
    } finally {
      setIsPptxGenerating(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!courseContent) return

    setIsPdfGenerating(true)
    try {
      // Add content type and difficulty level to the content if not already present
      const enhancedContent = {
        ...courseContent,
        contentType: contentType,
        difficultyLevel: difficultyLevel,
      }

      console.log('Sending PDF generation request for:', enhancedContent.title)

      const response = await fetch('/api/slide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'download-pdf',
          content: enhancedContent,
          // Pass persona language so the PDF headings can be localized
          language: getPersonaLanguage(activePersona),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.error || 'Failed to generate PDF document')
        } catch {
          throw new Error(errorText || 'Failed to generate PDF document')
        }
      }

      // Get the blob from the response
      const blob = await response.blob()

      if (blob.size === 0) {
        throw new Error('Generated PDF file is empty')
      }

      // Create a download link and trigger the download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${courseContent.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('PDF document downloaded successfully!')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to generate PDF document. Please try again.',
      )
    } finally {
      setIsPdfGenerating(false)
    }
  }

  const resetContent = () => {
    setCourseContent(null)
    setCurrentView('welcome')
    setGenerationError(null)
    setSourceMetadata(null)
    setExpandedQuestions({})
  }

  const toggleQuestionExpansion = (questionId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }))
  }

  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before generating a slide."
    >
      <div className="min-h-screen bg-background">
        {currentView === 'welcome' && <WelcomeView setCurrentView={setCurrentView} />}

        {currentView === 'config' && (
          <ConfigView
            setCurrentView={setCurrentView}
            topicName={topicName}
            setTopicName={setTopicName}
            contentType={contentType}
            setContentType={setContentType}
            contentStyle={contentStyle}
            setContentStyle={setContentStyle}
            sessionLength={sessionLength}
            setSessionLength={setSessionLength}
            difficultyLevel={difficultyLevel}
            setDifficultyLevel={setDifficultyLevel}
            isLoading={isLoading}
            progress={progress}
            generateCourseContent={generateCourseContent}
            selectedModel={selectedModel}
          />
        )}

        {currentView === 'content' && courseContent && (
          <ContentView
            courseContent={courseContent}
            contentType={contentType}
            setCurrentView={setCurrentView}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            generationError={generationError}
            sourceMetadata={sourceMetadata}
            expandedQuestions={expandedQuestions}
            toggleQuestionExpansion={toggleQuestionExpansion}
            resetContent={resetContent}
            handleDownloadPDF={handleDownloadPDF}
            handleDownloadPPTX={handleDownloadPPTX}
            isPdfGenerating={isPdfGenerating}
            isPptxGenerating={isPptxGenerating}
          />
        )}
      </div>
    </ContextRequirementMessage>
  )
}
