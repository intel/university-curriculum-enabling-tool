// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, Copy } from 'lucide-react'
import useSummaryStore from '@/lib/store/summary-store'
import { generateUUID } from '@/lib/utils'
import { useSourcesStore } from '@/lib/store/sources-store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import { ContextRequirementMessage } from '@/components/context-requirement-message'
import { useCourses } from '@/lib/hooks/use-courses'
import type { CitationReference, Citation } from '@/lib/types/citation-types'
import React from 'react'

function preprocessMarkdown(md: string): string {
  let processed = md

  // Ensure list items are separated by newlines
  processed = processed.replace(/([^\n])(\n)?(\s*[-*+] )/g, '$1\n$3')
  processed = processed.replace(/([^\n])(\n)?(\s*\d+\. )/g, '$1\n$3')

  // Ensure headings are separated by newlines
  processed = processed.replace(/([^\n])(\n)?(#+ )/g, '$1\n$3')

  // Ensure bold text is not joined with other words
  processed = processed.replace(/([^\s])(\*\*[^*]+\*\*)([^\s])/g, '$1 $2 $3')

  // Ensure bold headings are on their own line
  processed = processed.replace(/(\*\*[^\*]+\*\*)[ \t]*-?[ \t]*(.+)/g, '$1\n$2')

  // Debug log
  console.log('DEBUG: Preprocessed markdown:', processed)

  return processed
}

function hasHighlightedSentences(
  ref: CitationReference,
): ref is CitationReference & { highlightedSentences: string[] } {
  return Array.isArray((ref as { highlightedSentences?: unknown }).highlightedSentences)
}

export default function SummaryPage() {
  // Add this variable at the top of the component
  const showHighlight = false // Set to true to enable yellow highlight

  const [id] = useState(generateUUID())
  const {
    summaries,
    isGenerating,
    setSummary,
    setCurrentSummaryId,
    startGenerating,
    stopGenerating,
    setError,
    setSelectedModel,
  } = useSummaryStore()
  const { activePersona, selectedCourseId, getPersonaLanguage } = usePersonaStore()
  const lang = getPersonaLanguage(activePersona)
  const labels =
    lang === 'id'
      ? { sourceChunk: 'Potongan Sumber', sourceId: 'ID Sumber', order: 'Urutan' }
      : { sourceChunk: 'Source Chunk', sourceId: 'Source ID', order: 'Order' }
  const { selectedSources } = useSourcesStore()
  const { getActiveContextModelName, getContextTypeLabel } = useContextAvailability()
  const { data: coursesData } = useCourses()
  const summary = summaries[id]?.summary || ''
  const [, setIsMobile] = useState(false)
  const [citations, setCitations] = useState<Citation[]>([])
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null)
  const [cardPositions, setCardPositions] = useState<Record<string, string>>({})
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const hideCardTimeout = useRef<Record<string, NodeJS.Timeout | null>>({})

  useEffect(() => {
    setCurrentSummaryId(id)
  }, [id, setCurrentSummaryId])

  const validateInputs = () => {
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before start generate a summary.')}`,
      )
      return false
    }
    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length
    // Allow generation with no sources or exactly one source, but not multiple sources
    if (selectedSourcesCount > 1) {
      toast.error(
        'Multiple sources selected. Please select only one source or none to use course context.',
      )
      return false
    }
    return true
  }

  const generateSummary = async () => {
    startGenerating()

    if (!validateInputs()) {
      stopGenerating()
      return
    }

    try {
      const modelName = getActiveContextModelName()

      // Get course information from context
      const selectedCourse = coursesData?.docs.find((course) => course.id === selectedCourseId)
      const courseInfo = selectedCourse
        ? {
            courseName: selectedCourse.name,
            courseDescription: selectedCourse.description,
          }
        : undefined

      if (!selectedSources.length && !courseInfo) {
        toast.error('Select at least one reference source or choose a course before generating.')
        stopGenerating()
        return
      }

      // Fallback: if no sources selected, use course description as a pseudo-source
      const sourcesToUse = selectedSources.length
        ? selectedSources
        : courseInfo?.courseDescription
          ? [{ content: courseInfo.courseDescription, name: 'Course Description' }]
          : []

      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources: sourcesToUse,
          courseInfo,
          language: getPersonaLanguage(activePersona),
        }),
      })

      if (!response.ok) {
        let message = 'Failed to generate summary'
        try {
          const errorBody = await response.json()
          message = errorBody?.message || errorBody?.error?.details || message
        } catch {
          // Ignore JSON parsing errors and keep default message
        }
        throw new Error(message)
      }

      const data = await response.json()
      setSummary(id, data.summary)
      setSelectedModel(modelName)
      setCitations(data.citations || [])
      console.log('DEBUG: Received citations:', data.citations)
    } catch (error) {
      console.error('Error generating summary:', error)
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'An error occurred while generating the summary.'
      setError(message)
      toast.error(message)
    }

    stopGenerating()
  }

  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth <= 1023)
    }

    // Initial check
    checkScreenWidth()

    // Event listener for screen width changes
    window.addEventListener('resize', checkScreenWidth)

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('resize', checkScreenWidth)
    }
  }, [])

  const copyToClipboard = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(summary)
        toast.success('Summary copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    } else {
      // Fallback method
      const textarea = document.createElement('textarea')
      textarea.value = summary
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        toast.success('Summary copied to clipboard', {
          description: 'Use ctrl + v to paste it',
        })
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
      document.body.removeChild(textarea)
    }
  }

  // Helper: determine section and inverted card position
  const getSectionAndInvertedPosition = (rect: DOMRect) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    // 3x3 grid
    const col = x < vw / 3 ? 0 : x < (2 * vw) / 3 ? 1 : 2
    const row = y < vh / 3 ? 0 : y < (2 * vh) / 3 ? 1 : 2
    // Section names
    const sectionNames = [
      ['upper-left', 'center-up', 'upper-right'],
      ['center-left', 'center', 'center-right'],
      ['lower-left', 'center-down', 'lower-right'],
    ]
    const section = sectionNames[row][col] as keyof typeof invertedMap
    // Inverted direction mapping
    const invertedMap = {
      'upper-left': 'down-right',
      'center-up': 'down',
      'upper-right': 'down-left',
      'center-left': 'right',
      center: 'down',
      'center-right': 'left',
      'lower-left': 'up-right',
      'center-down': 'up',
      'lower-right': 'up-left',
    }
    const inverted = invertedMap[section] || 'down'
    return { section, inverted }
  }

  // Helper: get card style for position
  const getCardStyleForPosition = (pos: string, btnRect?: DOMRect): React.CSSProperties => {
    // Default card size assumptions
    const CARD_WIDTH = 400
    const CARD_HEIGHT = 400
    const PADDING = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    let style: React.CSSProperties = {}
    if (!btnRect) {
      // fallback to original logic if no rect
      switch (pos) {
        case 'up':
          return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 }
        case 'down':
          return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 }
        case 'left':
          return { top: '50%', right: '100%', transform: 'translateY(-50%)', marginRight: 8 }
        case 'right':
          return { top: '50%', left: '100%', transform: 'translateY(-50%)', marginLeft: 8 }
        case 'center-up':
          return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 }
        case 'center-down':
          return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 }
        case 'center-left':
          return { top: '50%', right: '100%', transform: 'translateY(-50%)', marginRight: 8 }
        case 'center-right':
          return { top: '50%', left: '100%', transform: 'translateY(-50%)', marginLeft: 8 }
        case 'up-left':
          return { bottom: '100%', right: '0', marginBottom: 8 }
        case 'up-right':
          return { bottom: '100%', left: '0', marginBottom: 8 }
        case 'down-left':
          return { top: '100%', right: '0', marginTop: 8 }
        case 'down-right':
          return { top: '100%', left: '0', marginTop: 8 }
        default:
          return { top: '100%', left: '0', marginTop: 8 }
      }
    }

    // Calculate initial position
    let top = 0,
      left = 0
    switch (pos) {
      case 'up':
      case 'center-up':
        top = btnRect.top - CARD_HEIGHT - PADDING
        left = btnRect.left + btnRect.width / 2 - CARD_WIDTH / 2
        break
      case 'down':
      case 'center-down':
        top = btnRect.bottom + PADDING
        left = btnRect.left + btnRect.width / 2 - CARD_WIDTH / 2
        break
      case 'left':
      case 'center-left':
        top = btnRect.top + btnRect.height / 2 - CARD_HEIGHT / 2
        left = btnRect.left - CARD_WIDTH - PADDING
        break
      case 'right':
      case 'center-right':
        top = btnRect.top + btnRect.height / 2 - CARD_HEIGHT / 2
        left = btnRect.right + PADDING
        break
      case 'up-left':
        top = btnRect.top - CARD_HEIGHT - PADDING
        left = btnRect.right - CARD_WIDTH
        break
      case 'up-right':
        top = btnRect.top - CARD_HEIGHT - PADDING
        left = btnRect.left
        break
      case 'down-left':
        top = btnRect.bottom + PADDING
        left = btnRect.right - CARD_WIDTH
        break
      case 'down-right':
        top = btnRect.bottom + PADDING
        left = btnRect.left
        break
      default:
        top = btnRect.bottom + PADDING
        left = btnRect.left
        break
    }

    // Clamp to viewport
    let adjusted = false
    if (left < 0) {
      left = PADDING
      adjusted = true
    }
    if (left + CARD_WIDTH > vw) {
      left = vw - CARD_WIDTH - PADDING
      adjusted = true
    }
    if (top < 0) {
      top = PADDING
      adjusted = true
    }
    if (top + CARD_HEIGHT > vh) {
      top = vh - CARD_HEIGHT - PADDING
      adjusted = true
    }

    style = {
      position: 'fixed',
      top,
      left,
      width: CARD_WIDTH,
      maxWidth: '90vw',
      maxHeight: CARD_HEIGHT,
      overflow: 'auto',
      zIndex: 9999,
      boxSizing: 'border-box',
    }
    if (adjusted) {
      console.log('DEBUG: Card position adjusted to stay within viewport:', {
        top,
        left,
        CARD_WIDTH,
        CARD_HEIGHT,
        vw,
        vh,
      })
    } else {
      console.log('DEBUG: Card position (no adjustment needed):', {
        top,
        left,
        CARD_WIDTH,
        CARD_HEIGHT,
        vw,
        vh,
      })
    }
    return style
  }

  // Add debugging for markdown content rendering
  useEffect(() => {
    if (summary) {
      console.log('DEBUG: Rendering summary markdown:', summary)
    }
    if (citations && citations.length > 0) {
      console.log('DEBUG: Rendering citations markdown:', citations)
    }
  }, [summary, citations])

  // Map to store unique citation keys and their assigned numbers
  const citationNumberMap = new Map<string, number>()
  let citationCounter = 1

  // Helper to get a unique key for a chunk (adjust as needed)
  const getCitationUniqueKey = (ref: CitationReference) => `${ref.sourceId ?? ''}-${ref.chunkIndex}`

  // Preprocess all citations to assign numbers
  citations.forEach((c) => {
    if ((c.type === 'paragraph' || c.type === 'list') && c.references && c.references.length > 0) {
      c.references.forEach((ref: CitationReference) => {
        const key = getCitationUniqueKey(ref)
        if (!citationNumberMap.has(key)) {
          citationNumberMap.set(key, citationCounter++)
        }
      })
    }
  })

  // Helper: highlight all substrings in highlightedSentences
  function highlightMatches(text: string, highlights: string[]): React.ReactNode {
    if (!highlights || highlights.length === 0) return text
    // Sort highlights by length descending to avoid nested matches
    const sorted = [...highlights].sort((a, b) => b.length - a.length)
    let result: React.ReactNode[] = [text]
    for (const h of sorted) {
      result = result.flatMap((part) => {
        if (typeof part !== 'string' || !h) return part
        const split = part.split(h)
        if (split.length === 1) return part
        const arr: React.ReactNode[] = []
        for (let i = 0; i < split.length; i++) {
          arr.push(split[i])
          if (i < split.length - 1) {
            arr.push(
              showHighlight ? (
                <span
                  key={h + i}
                  className="rounded bg-yellow-200 px-1 font-bold transition-colors duration-200"
                >
                  {h}
                </span>
              ) : (
                <span key={h + i} className="font-bold">
                  {h}
                </span>
              ),
            )
          }
        }
        return arr
      })
    }
    return result
  }

  // --- Export Handlers ---
  // Export summary as plain text
  const exportToTxt = () => {
    const text = summary
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'summary.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Export summary as PDF
  const downloadAsPDF = async () => {
    try {
      const res = await fetch('/api/summary/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: summary, sourceName: 'Summary' }),
      })
      if (!res.ok) throw new Error('Failed to export PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'summary.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      setError('Failed to export PDF')
    }
  }

  // Export summary as Word (docx)
  const downloadAsWord = async () => {
    try {
      const res = await fetch('/api/summary/download-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: summary, sourceName: 'Summary' }),
      })
      if (!res.ok) throw new Error('Failed to export Word')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'summary.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export Word:', err)
      setError('Failed to export Word')
    }
  }

  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before start generate a summary."
    >
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 lg:min-w-[750px] xl:min-w-[1000px]">
        <div className="hide-scrollbar flex-1 overflow-auto">
          <div className="w-full py-6">
            <Card className="h-full w-full">
              {!summary && (
                <>
                  <CardHeader className="flex flex-col items-center text-center">
                    <CardTitle className="flex items-center gap-2">
                      <FileText strokeWidth={1.6} className="h-5 w-5" />
                      Welcome to Summary Generator
                    </CardTitle>
                    <CardDescription>
                      Generate comprehensive summary from your documents in seconds
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-muted/50 p-4">
                      <h3 className="mb-2 font-medium">How it works:</h3>
                      <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                        <li>
                          Upload your document using the file selector on the sidebar (only one
                          document is supported)
                        </li>
                        <li>{`Select a ${activePersona === 'faculty' ? 'model' : 'course'} from the dropdown on the top left`}</li>
                        <li>Click Generate Summary Button on the bottom to create summary</li>
                        <li>View and copy your generated summary</li>
                      </ol>
                    </div>
                  </CardContent>
                </>
              )}
              {summary && (
                <>
                  <CardContent className="flex flex-col gap-2 overflow-auto p-0 px-6 py-6">
                    {citations.length > 0 ? (
                      citations.map((c, idx) => {
                        if (c.type === 'heading-title') {
                          // Render title as large h1
                          return (
                            <h1 key={idx} className="mb-6 mt-2 text-3xl font-bold leading-tight">
                              {c.content}
                            </h1>
                          )
                        }
                        if (c.type === 'heading') {
                          // Render headings with appropriate size
                          if (c.level === 1) {
                            return (
                              <h1 key={idx} className="mb-2 mt-6 text-2xl font-bold leading-tight">
                                {c.content}
                              </h1>
                            )
                          } else if (c.level === 2) {
                            return (
                              <h2
                                key={idx}
                                className="mb-2 mt-5 text-xl font-semibold leading-tight"
                              >
                                {c.content}
                              </h2>
                            )
                          } else {
                            return (
                              <h3
                                key={idx}
                                className="mb-2 mt-4 text-lg font-semibold leading-tight"
                              >
                                {c.content}
                              </h3>
                            )
                          }
                        }
                        // For paragraphs and lists, render content and citation buttons if references exist
                        if (c.type === 'paragraph') {
                          // Split paragraph into sentences (same regex as backend)
                          const sentences =
                            c.content
                              .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
                              ?.map((s: string) => s.trim())
                              .filter(Boolean) || []
                          return (
                            <div key={idx} className="group relative mb-2">
                              <span className="inline-block w-full align-baseline">
                                <span className="inline-flex w-full items-baseline">
                                  {/* Always render summary text as normal, never highlight on hover */}
                                  <span className="inline-block">
                                    {sentences.map((sentence: string, sidx: number) => (
                                      <span key={sidx}>
                                        {sentence + (sentence.match(/[.!?]$/) ? ' ' : '. ')}
                                      </span>
                                    ))}
                                  </span>
                                  {c.references && c.references.length > 0 && (
                                    <span className="relative ml-1 inline-flex align-baseline">
                                      {c.references.map(
                                        (ref: CitationReference, refIdx: number) => {
                                          const citationKey = `${idx}-${refIdx}`
                                          const uniqueKey = getCitationUniqueKey(ref)
                                          const citationNumber = citationNumberMap.get(uniqueKey)
                                          const setButtonRef = (el: HTMLButtonElement | null) => {
                                            buttonRefs.current[citationKey] = el
                                          }
                                          const handleMouseEnter = () => {
                                            const btn = buttonRefs.current[citationKey]
                                            if (btn) {
                                              const rect = btn.getBoundingClientRect()
                                              const { inverted } =
                                                getSectionAndInvertedPosition(rect)
                                              setCardPositions((pos) => ({
                                                ...pos,
                                                [citationKey]: inverted,
                                              }))
                                              setHoveredCitation(citationKey)
                                              if (hideCardTimeout.current[citationKey]) {
                                                clearTimeout(hideCardTimeout.current[citationKey]!)
                                                hideCardTimeout.current[citationKey] = null
                                              }
                                            }
                                          }
                                          const handleMouseLeave = () => {
                                            hideCardTimeout.current[citationKey] = setTimeout(
                                              () => {
                                                setHoveredCitation((current) =>
                                                  current === citationKey ? null : current,
                                                )
                                              },
                                              200,
                                            )
                                          }
                                          const pos = cardPositions[citationKey]
                                          const btn = buttonRefs.current[citationKey]
                                          const btnRect = btn
                                            ? btn.getBoundingClientRect()
                                            : undefined
                                          const cardStyle = getCardStyleForPosition(pos, btnRect)
                                          return (
                                            <span
                                              key={refIdx}
                                              className="relative ml-1 inline-block"
                                            >
                                              <button
                                                ref={setButtonRef}
                                                className={`flex h-6 w-6 items-center justify-center rounded-full border border-input bg-background text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-primary/30`}
                                                onMouseEnter={handleMouseEnter}
                                                onMouseLeave={handleMouseLeave}
                                                type="button"
                                              >
                                                {citationNumber}
                                              </button>
                                              {/* Render the card as a sibling, not a child, to avoid layout shift */}
                                              {hoveredCitation === citationKey && (
                                                <div
                                                  className="absolute z-50 w-[500px] max-w-[98vw] overflow-auto rounded-lg border border-primary bg-popover p-4 text-popover-foreground"
                                                  style={{
                                                    ...cardStyle,
                                                    boxSizing: 'border-box',
                                                    pointerEvents: 'auto',
                                                  }}
                                                  onMouseEnter={() => {
                                                    if (hideCardTimeout.current[citationKey]) {
                                                      clearTimeout(
                                                        hideCardTimeout.current[citationKey]!,
                                                      )
                                                      hideCardTimeout.current[citationKey] = null
                                                    }
                                                  }}
                                                  onMouseLeave={() => {
                                                    hideCardTimeout.current[citationKey] =
                                                      setTimeout(() => {
                                                        setHoveredCitation((current) =>
                                                          current === citationKey ? null : current,
                                                        )
                                                      }, 200)
                                                  }}
                                                >
                                                  <div className="mb-6 text-xs opacity-80">
                                                    {labels.sourceChunk} #{ref.chunkIndex + 1}
                                                    {ref.sourceId && (
                                                      <span className="ml-2 opacity-80">
                                                        {'('}
                                                        {labels.sourceId}: {ref.sourceId}
                                                        {', '}
                                                        {labels.order}: {ref.order}
                                                        {')'}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="mb-6 mt-6 text-sm">
                                                    {(() => {
                                                      if (
                                                        hasHighlightedSentences(ref) &&
                                                        ref.chunk
                                                      ) {
                                                        console.debug(
                                                          '[HIGHLIGHT DEBUG] CitationKey:',
                                                          citationKey,
                                                          'Chunk:',
                                                          ref.chunk,
                                                          'Highlighted:',
                                                          ref.highlightedSentences,
                                                        )
                                                        return highlightMatches(
                                                          ref.chunk,
                                                          ref.highlightedSentences,
                                                        )
                                                      }
                                                      // fallback: show all sentences
                                                      const chunkSentences =
                                                        (ref.chunk as string)
                                                          .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
                                                          ?.map((s: string) => s.trim())
                                                          .filter(Boolean) || []
                                                      return chunkSentences.map(
                                                        (sentence: string, i: number) => (
                                                          <div key={i}>{sentence}</div>
                                                        ),
                                                      )
                                                    })()}
                                                  </div>
                                                </div>
                                              )}
                                            </span>
                                          )
                                        },
                                      )}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </div>
                          )
                        }
                        // For paragraphs and lists, render content and citation buttons if references exist
                        return (
                          <div key={idx} className="group relative mb-2">
                            <span className="inline-block w-full align-baseline">
                              <span className="inline-flex w-full items-baseline">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkBreaks]}
                                  className={`prose-sm inline max-w-none text-sm markdown-content${c.type === 'list' ? 'mb-0' : ''}`}
                                >
                                  {preprocessMarkdown(
                                    c.type === 'list' && c.items
                                      ? c.ordered
                                        ? c.items
                                            .map((item: string, i: number) => `${i + 1}. ${item}`)
                                            .join('\n')
                                        : c.items.map((item: string) => `- ${item}`).join('\n')
                                      : c.content,
                                  )}
                                </ReactMarkdown>
                                {c.references && c.references.length > 0 && (
                                  <span className="relative ml-1 inline-flex align-baseline">
                                    {c.references.map((ref: CitationReference, refIdx: number) => {
                                      const citationKey = `${idx}-${refIdx}`
                                      const uniqueKey = getCitationUniqueKey(ref)
                                      const citationNumber = citationNumberMap.get(uniqueKey)
                                      const setButtonRef = (el: HTMLButtonElement | null) => {
                                        buttonRefs.current[citationKey] = el
                                      }
                                      const handleMouseEnter = () => {
                                        const btn = buttonRefs.current[citationKey]
                                        if (btn) {
                                          const rect = btn.getBoundingClientRect()
                                          const { inverted } = getSectionAndInvertedPosition(rect)
                                          setCardPositions((pos) => ({
                                            ...pos,
                                            [citationKey]: inverted,
                                          }))
                                          setHoveredCitation(citationKey)
                                          if (hideCardTimeout.current[citationKey]) {
                                            clearTimeout(hideCardTimeout.current[citationKey]!)
                                            hideCardTimeout.current[citationKey] = null
                                          }
                                        }
                                      }
                                      const handleMouseLeave = () => {
                                        hideCardTimeout.current[citationKey] = setTimeout(() => {
                                          setHoveredCitation((current) =>
                                            current === citationKey ? null : current,
                                          )
                                        }, 200)
                                      }
                                      const pos = cardPositions[citationKey]
                                      const btn = buttonRefs.current[citationKey]
                                      const btnRect = btn ? btn.getBoundingClientRect() : undefined
                                      const cardStyle = getCardStyleForPosition(pos, btnRect)
                                      return (
                                        <span key={refIdx} className="relative ml-1 inline-block">
                                          <button
                                            ref={setButtonRef}
                                            className={`flex h-6 w-6 items-center justify-center rounded-full border border-input bg-background text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-primary/30`}
                                            onMouseEnter={handleMouseEnter}
                                            onMouseLeave={handleMouseLeave}
                                            type="button"
                                          >
                                            {citationNumber}
                                          </button>
                                          {/* Render the card as a sibling, not a child, to avoid layout shift */}
                                          {hoveredCitation === citationKey && (
                                            <div
                                              className="absolute z-50 w-[500px] max-w-[98vw] overflow-auto rounded-lg border border-primary bg-popover p-4 text-popover-foreground"
                                              style={{
                                                ...cardStyle,
                                                boxSizing: 'border-box',
                                                pointerEvents: 'auto',
                                              }}
                                              onMouseEnter={() => {
                                                if (hideCardTimeout.current[citationKey]) {
                                                  clearTimeout(
                                                    hideCardTimeout.current[citationKey]!,
                                                  )
                                                  hideCardTimeout.current[citationKey] = null
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                hideCardTimeout.current[citationKey] = setTimeout(
                                                  () => {
                                                    setHoveredCitation((current) =>
                                                      current === citationKey ? null : current,
                                                    )
                                                  },
                                                  200,
                                                )
                                              }}
                                            >
                                              <div className="mb-6 text-xs opacity-80">
                                                {labels.sourceChunk} #{ref.chunkIndex + 1}
                                                {ref.sourceId && (
                                                  <span className="ml-2 opacity-80">
                                                    {'('}
                                                    {labels.sourceId}: {ref.sourceId}
                                                    {', '}
                                                    {labels.order}: {ref.order}
                                                    {')'}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="mb-6 mt-6 text-sm">
                                                {(() => {
                                                  if (hasHighlightedSentences(ref) && ref.chunk) {
                                                    console.debug(
                                                      '[HIGHLIGHT DEBUG] CitationKey:',
                                                      citationKey,
                                                      'Chunk:',
                                                      ref.chunk,
                                                      'Highlighted:',
                                                      ref.highlightedSentences,
                                                    )
                                                    return highlightMatches(
                                                      ref.chunk,
                                                      ref.highlightedSentences,
                                                    )
                                                  }
                                                  // fallback: show all sentences
                                                  const chunkSentences =
                                                    (ref.chunk as string)
                                                      .match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)
                                                      ?.map((s: string) => s.trim())
                                                      .filter(Boolean) || []
                                                  return chunkSentences.map(
                                                    (sentence: string, i: number) => (
                                                      <div key={i}>{sentence}</div>
                                                    ),
                                                  )
                                                })()}
                                              </div>
                                            </div>
                                          )}
                                        </span>
                                      )
                                    })}
                                  </span>
                                )}
                              </span>
                            </span>
                          </div>
                        )
                      })
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        className="prose-sm markdown-content max-w-none text-sm"
                      >
                        {preprocessMarkdown(summary)}
                      </ReactMarkdown>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToTxt}>
                      <FileText className="h-4 w-4" />
                      Export as TXT
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadAsWord}>
                      <FileText className="h-4 w-4" />
                      Export as Word
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadAsPDF}>
                      <FileText className="h-4 w-4" />
                      Export as PDF
                    </Button>
                  </CardFooter>
                </>
              )}
            </Card>
          </div>
        </div>
        {/* Bottom Controls */}
        <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button
            onClick={generateSummary}
            className="w-full md:max-w-[700px]"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating...</span>
              </div>
            ) : (
              'Generate Summary'
            )}
          </Button>
        </div>
      </div>
    </ContextRequirementMessage>
  )
}
