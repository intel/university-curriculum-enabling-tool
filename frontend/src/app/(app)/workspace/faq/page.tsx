// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Copy,
  FileText,
  Loader2,
  MessagesSquare,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import { ContextRequirementMessage } from '@/components/context-requirement-message'
import { useCourses } from '@/lib/hooks/use-courses'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Progress } from '@/components/ui/progress'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'

export default function FAQComponent() {
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [faqCount, setFaqCount] = useState(5)
  const [searchQuery, setSearchQuery] = useState('')

  // Multi-pass state
  const [multiPassState, setMultiPassState] = useState(null)
  const [canContinue, setCanContinue] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isContinuing, setIsContinuing] = useState(false)

  // Add reranker toggle state
  const [useReranker, setUseReranker] = useState(true)
  const { getActiveContextModelName, getContextTypeLabel } = useContextAvailability()
  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { data: coursesData } = useCourses()
  const { selectedCourseId } = usePersonaStore()

  // Function to trigger the API and fetch initial FAQs
  const fetchAPI = async () => {
    // Validation
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before start generate FAQs.')}`,
      )
      return false
    }
    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length
    // Allow generation with no sources or exactly one source, but not multiple sources
    if (selectedSourcesCount > 1) {
      toast.error(
        'Multiple sources selected. Please select only one source or none to use course context.',
      )
      return
    }

    // Clear previous FAQs immediately when starting a new generation
    setFaqs([])
    setIsLoading(true)
    // Reset multi-pass state for new generation
    setMultiPassState(null)
    setCanContinue(false)
    setProgress(0)

    try {
      const modelName = getActiveContextModelName()

      // Get course information from context - using proven method from assessment page
      const selectedCourse = coursesData?.docs.find((course) => course.id === selectedCourseId)
      const courseDescription = selectedCourse?.description || ''
      const courseInfo = selectedCourse
        ? {
            courseName: selectedCourse.name,
            courseDescription: courseDescription,
          }
        : undefined

      const response = await fetch('/api/faq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources: selectedSources,
          faqCount: faqCount,
          searchQuery: searchQuery.trim(),
          multiPassState: null, // No state for initial request
          continueFaqs: false,
          useReranker: useReranker, // Add this line
          courseInfo, // Add course info
        }),
      })

      const data = await response.json()

      if (data.faqs?.FAQs) {
        setFaqs(data.faqs.FAQs)
        // Store multi-pass state and continuation status
        setMultiPassState(data.multiPassState)
        setCanContinue(data.canContinue)
        setProgress(data.progress || 0)
      } else {
        toast.error('Failed to generate FAQs. Please try again.')
      }
    } catch (err) {
      toast.error('Failed to Generate FAQs. Please try again.')
      console.log('Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Function to continue FAQ generation with more chunks
  const continueFAQs = async () => {
    if (!multiPassState) {
      toast.error('No previous generation state found.')
      return
    }

    setIsContinuing(true)

    try {
      const modelName = getActiveContextModelName()

      // Get course information from context (same as initial call) - using proven method
      const selectedCourse = coursesData?.docs.find((course) => course.id === selectedCourseId)
      const courseDescription = selectedCourse?.description || ''
      const courseInfo = selectedCourse
        ? {
            courseName: selectedCourse.name,
            courseDescription: courseDescription,
          }
        : undefined

      const response = await fetch('/api/faq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources: selectedSources,
          faqCount: faqCount,
          searchQuery: searchQuery.trim(),
          multiPassState: multiPassState, // Pass the state for continuation
          continueFaqs: true, // Flag that this is a continuation request
          useReranker: useReranker, // Add this line
          courseInfo, // Add course info
        }),
      })

      const data = await response.json()

      if (data.faqs?.FAQs) {
        // Simply append new FAQs to the existing list
        setFaqs([...faqs, ...data.faqs.FAQs])

        // Show success message
        toast.success(`Added ${data.faqs.FAQs.length} new FAQs to the list`)

        // Update multi-pass state
        setMultiPassState(data.multiPassState)
        setCanContinue(data.canContinue)
        setProgress(data.progress || 0)

        if (!data.canContinue) {
          toast.success('All available content has been processed!')
        }
      } else {
        toast.error('Failed to continue FAQ generation.')
      }
    } catch (err) {
      toast.error('Failed to continue FAQ generation.')
      console.log('Error:', err)
    } finally {
      setIsContinuing(false)
    }
  }

  // Function to copy FAQs to clipboard (with fallback)
  const copyToClipboard = async () => {
    const text = faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')
    await navigator.clipboard.writeText(text)
    toast.success('FAQs copied to clipboard', {
      description: 'Use ctrl + v to paste it',
    })
  }

  // Function to export FAQs to a TXT file
  const exportToTxt = () => {
    const text = faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'faqs.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before start generate FAQs."
    >
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 lg:min-w-[750px] xl:min-w-[1000px]">
        {/* Scrollable Content Area */}
        <div className="hide-scrollbar flex-1 overflow-auto">
          <div className="w-full py-6">
            <Card className="w-full">
              {faqs.length > 0 ? (
                <CardContent className="h-full p-6">
                  {/* Progress bar for multi-pass processing */}
                  {progress > 0 && progress < 100 && (
                    <div className="mb-4">
                      <div className="mb-1 flex justify-between text-sm">
                        <span>FAQ Generation Progress</span>
                        <span>{progress}% of document analyzed</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                      <AccordionItem value={`item-${index}`} key={index}>
                        <AccordionTrigger>{`${index + 1}. ${faq.question}`}</AccordionTrigger>
                        <AccordionContent>{faq.answer}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  <CardFooter className="flex justify-between gap-2 border-t pb-0 pt-5">
                    <div>
                      {/* Add Continue button when more chunks are available */}
                      {canContinue && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={continueFAQs}
                          disabled={isContinuing}
                        >
                          {isContinuing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Continuing...
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 h-4 w-4" />
                              Continue
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyToClipboard}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportToTxt}>
                        <FileText className="mr-2 h-4 w-4" />
                        Export as TXT
                      </Button>
                    </div>
                  </CardFooter>
                </CardContent>
              ) : (
                <CardHeader className="flex flex-col items-center text-center">
                  <CardTitle className="flex items-center gap-2">
                    <MessagesSquare strokeWidth={1.6} className="h-5 w-5" />
                    Welcome to FAQ Generator
                  </CardTitle>
                  <CardDescription>
                    Generate comprehensive FAQs from your documents in seconds
                  </CardDescription>
                </CardHeader>
              )}
              {faqs.length === 0 && (
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <h3 className="mb-2 font-medium">How it works:</h3>
                    <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                      <li>Upload your document using the file selector on the sidebar</li>
                      <li>
                        <span className="font-medium">Click the Generate FAQs button</span> to
                        create general FAQs
                        <span className="ml-5 mt-0.5 block text-xs">
                          (Optionally enter keywords to focus on specific topics)
                        </span>
                      </li>
                      <li>View, copy, or export your generated FAQs</li>
                      <li>Use the Continue button to process more document chunks</li>
                    </ol>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto max-w-5xl space-y-4">
            {/* Primary Row: Search and Generate - Adjusted for wider search bar */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <div className="relative w-full">
                <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Enter keywords for focused results or leave empty for general FAQs..."
                  className="w-full rounded-md border py-2 pl-8 focus:outline-none focus:ring-2 focus:ring-primary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isLoading) {
                      fetchAPI()
                    }
                  }}
                  disabled={isLoading || isContinuing}
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" disabled={isLoading || isContinuing}>
                    <Settings2 className="h-4 w-4" />
                    <span className="sr-only">Settings</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">FAQ Settings</h4>

                    {/* FAQ Count Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="faq-count" className="text-sm">
                          Number of questions
                        </label>
                        <span className="text-sm font-medium">{faqCount}</span>
                      </div>
                      <Slider
                        id="faq-count"
                        min={1}
                        max={10}
                        step={1}
                        value={[faqCount]}
                        onValueChange={(value) => setFaqCount(value[0])}
                      />
                    </div>

                    {/* Reranker Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label htmlFor="reranker-toggle" className="text-sm">
                          Improve FAQs Relevance
                        </label>
                        <p className="text-xs text-muted-foreground">
                          May be slower, but gives more accurate FAQs
                        </p>
                      </div>
                      <Switch
                        id="reranker-toggle"
                        checked={useReranker}
                        onCheckedChange={setUseReranker}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={fetchAPI}
                disabled={isLoading || isContinuing}
                className="whitespace-nowrap"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate FAQs
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ContextRequirementMessage>
  )
}
