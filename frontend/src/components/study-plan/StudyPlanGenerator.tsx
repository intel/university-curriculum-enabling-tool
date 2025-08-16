'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Calendar,
  Clock,
  BookOpen,
  Download,
  CheckCircle2,
  ArrowRight,
  Brain,
  GraduationCap,
  BookMarked,
  FileText,
  PenTool,
  BarChart4,
} from 'lucide-react'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import type { StudyPlan } from '@/lib/types/study-plan'
import { useCourses } from '@/lib/hooks/use-courses'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

type View = 'welcome' | 'config' | 'plan'

// Difficulty level descriptions for tooltips
const difficultyDescriptions = {
  beginner: 'New to the subject, focusing on foundational concepts',
  intermediate: 'Familiar with basics, ready for more complex concepts',
  advanced: 'Strong foundation, focusing on mastery and advanced applications',
}

export default function StudyPlanGenerator() {
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [studyPeriodWeeks, setStudyPeriodWeeks] = useState(8)
  const [studyHoursPerWeek, setStudyHoursPerWeek] = useState(10)
  const [examDate, setExamDate] = useState('')
  const [difficultyLevel, setDifficultyLevel] = useState('intermediate')
  const [learningStyle] = useState('balanced')
  const [currentView, setCurrentView] = useState<View>('welcome')
  const [activeTab, setActiveTab] = useState('overview')
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  // Add a new state for the confirmation dialog
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

  const { data: coursesData } = useCourses()

  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { getActiveContextModelName, getContextTypeLabel, selectedCourseId } =
    useContextAvailability()
  const modelName = getActiveContextModelName()

  // Replace the generateStudyPlan function with this updated version
  const generateStudyPlan = async () => {
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before start generate assessments.')}`,
      )
      return
    }

    // Get the selected sources count
    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length

    // If no sources are selected, show the confirmation dialog instead of window.confirm
    if (selectedSourcesCount === 0) {
      setIsConfirmDialogOpen(true)
      return
    }

    // If sources are selected, proceed with generation
    await generateStudyPlanWithSources()
  }

  // Add a new function to handle the actual generation
  const generateStudyPlanWithSources = async () => {
    setIsLoading(true)
    setProgress(0)

    try {
      // Get course information from context
      const selectedCourse = coursesData?.docs.find((course) => course.id === selectedCourseId)
      const courseCode = selectedCourse?.code || ''
      const courseName = selectedCourse?.name || ''

      const response = await fetch('/api/study-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources,
          studyPeriodWeeks,
          studyHoursPerWeek,
          examDate,
          difficultyLevel,
          learningStyle,
          courseCode,
          courseName,
        }),
      })

      setProgress(100)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate study plan')
      }

      setStudyPlan(data)
      setCurrentView('plan')
      toast.success('Study plan generated successfully!')
    } catch (err) {
      console.error('Error generating study plan:', err)
      toast.error(
        err instanceof Error ? err.message : 'Failed to generate study plan. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  // Add a function to handle dialog confirmation
  const handleConfirmNoSources = () => {
    setIsConfirmDialogOpen(false)
    generateStudyPlanWithSources()
  }

  const handleDownloadPDF = async () => {
    if (!studyPlan) return

    setIsPdfGenerating(true)
    try {
      // Call the API route to generate the PDF
      const response = await fetch('/api/study-plan/download-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(studyPlan),
      })

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      // Get the PDF data URI from the response
      const pdfDataUri = await response.text()

      // Create a link element and trigger download
      const link = document.createElement('a')
      link.href = pdfDataUri
      link.download = 'study-plan.pdf'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success('Study plan PDF downloaded successfully!')
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error('Failed to generate PDF. Please try again.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  const resetStudyPlan = () => {
    setStudyPlan(null)
    setCurrentView('welcome')
  }

  const renderWelcomeView = () => (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <GraduationCap strokeWidth={1.6} className="h-5 w-5" />
              Welcome to Study Plan Generator
            </CardTitle>
            <CardDescription className="mt-2 text-lg">
              Create a personalized study plan tailored to your learning needs and preferences.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 font-medium">How it works:</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                <li>
                  Upload or select your learning materials using the source selector on the sidebar.
                </li>
                <li>Configure your study period, available time, and difficulty level.</li>
                <li>Generate a personalized study plan tailored to your specific needs.</li>
                <li>View your comprehensive study plan with weekly schedules and resources.</li>
                <li>Download your study plan as a PDF for offline reference.</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button onClick={() => setCurrentView('config')} className="w-full md:max-w-[700px]">
          <span>Create Study Plan</span>
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  const renderConfigView = () => (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar h-[calc(100vh-8rem)] overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('welcome')}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back
              </Button>
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl">Create Your Personalized Study Plan</CardTitle>
              <CardDescription className="mt-2 text-lg">
                Configure your study preferences to generate a plan tailored to your needs
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <Label className="text-md mb-2 font-medium">Selected Sources</Label>
                  <div className="mt-1 rounded-md bg-muted p-2">
                    <div className="flex flex-wrap gap-2">
                      {selectedSources
                        .filter((source) => source.selected)
                        .map((source, index) => (
                          <Badge key={index} variant="secondary" className="text-sm">
                            {source.name}
                          </Badge>
                        ))}
                      {selectedSources.filter((source) => source.selected).length === 0 && (
                        <span className="text-sm text-muted-foreground">
                          No sources selected. The model will generate content based on the course
                          information.
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Adding sources is optional. If no sources are selected, the study plan will be
                    generated based on the model&apos;s knowledge of the course.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <Calendar className="h-5 w-5 text-primary" />
                Study Period
              </h3>
              <p className="text-sm text-muted-foreground">
                How many weeks do you have to prepare?
              </p>
              <div className="relative space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    Study Period: <span className="font-medium">{studyPeriodWeeks} weeks</span>
                  </span>
                </div>
                <div className="group relative">
                  <Slider
                    id="study-period"
                    min={1}
                    max={16}
                    step={1}
                    value={[studyPeriodWeeks]}
                    onValueChange={(value) => setStudyPeriodWeeks(value[0])}
                    className="w-full cursor-pointer"
                  />
                  <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div
                      className="absolute -translate-x-1/2 transform rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                      style={{ left: `${((studyPeriodWeeks - 1) / 15) * 100}%` }}
                    >
                      {studyPeriodWeeks}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <Clock className="h-5 w-5 text-primary" />
                Available Study Time
              </h3>
              <p className="text-sm text-muted-foreground">
                How many hours can you dedicate to studying each week?
              </p>
              <div className="relative space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    Hours per week: <span className="font-medium">{studyHoursPerWeek} hours</span>
                  </span>
                </div>
                <div className="group relative">
                  <Slider
                    id="study-hours"
                    min={1}
                    max={40}
                    step={1}
                    value={[studyHoursPerWeek]}
                    onValueChange={(value) => setStudyHoursPerWeek(value[0])}
                    className="w-full cursor-pointer"
                  />
                  <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div
                      className="absolute -translate-x-1/2 transform rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                      style={{ left: `${((studyHoursPerWeek - 1) / 39) * 100}%` }}
                    >
                      {studyHoursPerWeek}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <Calendar className="h-5 w-5 text-primary" />
                Exam Date (Optional)
              </h3>
              <p className="text-sm text-muted-foreground">
                When is your exam or target completion date?
              </p>
              <div className="space-y-2">
                <Input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <GraduationCap className="h-5 w-5 text-primary" />
                Difficulty Level
              </h3>
              <p className="text-sm text-muted-foreground">
                Select the difficulty level that matches your current knowledge:
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          difficultyLevel === 'beginner' ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => setDifficultyLevel('beginner')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setDifficultyLevel('beginner')
                          }
                        }}
                        aria-pressed={difficultyLevel === 'beginner'}
                      >
                        <h4 className="text-sm font-semibold">Beginner</h4>
                        <p className="text-sm text-muted-foreground">New to the subject</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{difficultyDescriptions.beginner}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          difficultyLevel === 'intermediate' ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => setDifficultyLevel('intermediate')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setDifficultyLevel('intermediate')
                          }
                        }}
                        aria-pressed={difficultyLevel === 'intermediate'}
                      >
                        <h4 className="text-sm font-semibold">Intermediate</h4>
                        <p className="text-sm text-muted-foreground">Familiar with basics</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{difficultyDescriptions.intermediate}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          difficultyLevel === 'advanced' ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => setDifficultyLevel('advanced')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setDifficultyLevel('advanced')
                          }
                        }}
                        aria-pressed={difficultyLevel === 'advanced'}
                      >
                        <h4 className="text-sm font-semibold">Advanced</h4>
                        <p className="text-sm text-muted-foreground">Strong foundation</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{difficultyDescriptions.advanced}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* <div className="space-y-3">
              <h3 className="text-md font-semibold flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Learning Style Preference
              </h3>
              <p className="text-muted-foreground text-sm">How do you prefer to learn?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          learningStyle === "visual" ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setLearningStyle("visual")}
                      >
                        <h4 className="font-semibold text-sm">Visual</h4>
                        <p className="text-sm text-muted-foreground">Images, diagrams, videos</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{learningStyleDescriptions.visual}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          learningStyle === "auditory" ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setLearningStyle("auditory")}
                      >
                        <h4 className="font-semibold text-sm">Auditory</h4>
                        <p className="text-sm text-muted-foreground">Listening, discussing</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{learningStyleDescriptions.auditory}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          learningStyle === "reading/writing" ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setLearningStyle("reading/writing")}
                      >
                        <h4 className="font-semibold text-sm">Reading/Writing</h4>
                        <p className="text-sm text-muted-foreground">Text-based learning</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{learningStyleDescriptions["reading/writing"]}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          learningStyle === "kinesthetic" ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setLearningStyle("kinesthetic")}
                      >
                        <h4 className="font-semibold text-sm">Kinesthetic</h4>
                        <p className="text-sm text-muted-foreground">Hands-on, practical</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{learningStyleDescriptions.kinesthetic}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          learningStyle === "balanced" ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => setLearningStyle("balanced")}
                      >
                        <h4 className="font-semibold text-sm">Balanced</h4>
                        <p className="text-sm text-muted-foreground">Mix of all styles</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{learningStyleDescriptions.balanced}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div> */}
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          onClick={generateStudyPlan}
          disabled={isLoading}
          className="w-full md:max-w-[700px]"
        >
          {isLoading ? (
            <div className="w-full">
              <div className="mb-2 flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Generating Study Plan...</span>
              </div>
              <Progress value={progress} className="h-2 w-full" />
            </div>
          ) : (
            <span>Generate My Study Plan</span>
          )}
        </Button>
      </div>
    </div>
  )

  const renderStudyPlanView = () => {
    if (!studyPlan) return null

    return (
      <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col px-4 pt-8">
        <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
          <Card className="mb-4 w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView('config')}
                  className="flex items-center gap-1 text-muted-foreground"
                >
                  <ArrowRight className="h-4 w-4 rotate-180" />
                  Back
                </Button>
                <CardTitle className="text-2xl">Your Personalized Study Plan</CardTitle>
                <Button
                  variant="outline"
                  onClick={handleDownloadPDF}
                  disabled={isPdfGenerating}
                  size="sm"
                >
                  {isPdfGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
              <CardDescription className="mt-4 text-center">
                {studyPlan?.executiveSummary}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                defaultValue="overview"
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="mb-4 grid grid-cols-5">
                  <TabsTrigger value="overview" className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    <span>Overview</span>
                  </TabsTrigger>
                  <TabsTrigger value="weekly" className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Weekly Schedule</span>
                  </TabsTrigger>
                  <TabsTrigger value="techniques" className="flex items-center gap-1">
                    <Brain className="h-4 w-4" />
                    <span>Study Techniques</span>
                  </TabsTrigger>
                  <TabsTrigger value="resources" className="flex items-center gap-1">
                    <BookMarked className="h-4 w-4" />
                    <span>Resources</span>
                  </TabsTrigger>
                  <TabsTrigger value="exam" className="flex items-center gap-1">
                    <PenTool className="h-4 w-4" />
                    <span>Exam Prep</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <BookOpen className="h-5 w-5 text-primary" />
                          Topic Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {studyPlan?.topicBreakdown?.map((topic, index) => (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">{topic.topic}</h4>
                                <Badge
                                  variant={
                                    topic.importance === 'High'
                                      ? 'destructive'
                                      : topic.importance === 'Medium'
                                        ? 'default'
                                        : 'secondary'
                                  }
                                >
                                  {topic.importance}
                                </Badge>
                              </div>
                              <Progress
                                value={(topic.estimatedStudyHours / studyHoursPerWeek) * 100}
                                className="h-2"
                              />
                              <div className="text-sm text-muted-foreground">
                                <span>{topic.estimatedStudyHours} hours</span>
                                <div className="mt-1">
                                  <span className="font-medium">Subtopics:</span>{' '}
                                  {topic.subtopics.join(', ')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BarChart4 className="h-5 w-5 text-primary" />
                        Practice Strategy
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-sm font-medium">Approach</h4>
                          <p className="text-sm">{studyPlan?.practiceStrategy?.approach}</p>
                        </div>
                        <div>
                          <h4 className="mb-2 text-sm font-medium">Frequency</h4>
                          <p className="text-sm">{studyPlan?.practiceStrategy?.frequency}</p>
                        </div>
                        <div>
                          <h4 className="mb-2 text-sm font-medium">Question Types</h4>
                          <ul className="space-y-1 text-sm">
                            {studyPlan?.practiceStrategy?.questionTypes?.map((type, index) => (
                              <li key={index} className="flex items-start">
                                <span className="mr-2">•</span>
                                <span>{type}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 text-sm font-medium">Self-Assessment</h4>
                          <p className="text-sm">{studyPlan?.practiceStrategy?.selfAssessment}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="weekly" className="space-y-4">
                  <Accordion type="single" collapsible className="w-full">
                    {studyPlan?.weeklySchedule?.map((week, index) => (
                      <AccordionItem key={index} value={`week-${week.week}`}>
                        <AccordionTrigger>
                          <div className="flex items-center">
                            <span className="font-medium">Week {week.week}:</span>
                            <span className="ml-2">{week.focus}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 p-2">
                            <div>
                              <h4 className="text-sm font-medium">Topics:</h4>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {week.topics?.map((topic, topicIndex) => (
                                  <Badge key={topicIndex} variant="outline">
                                    {topic}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h4 className="mb-2 text-sm font-medium">Activities:</h4>
                              <div className="space-y-3">
                                {week.activities?.map((activity, actIndex) => (
                                  <div key={actIndex} className="rounded-md border p-3">
                                    <div className="flex justify-between">
                                      <span className="text-sm font-medium">{activity.type}</span>
                                      <Badge variant="secondary">{activity.duration}</Badge>
                                    </div>
                                    <p className="mt-1 text-sm">{activity.description}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      Resources: {activity.resources}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h4 className="mb-2 text-sm font-medium">Milestones:</h4>
                              <ul className="space-y-1">
                                {week.milestones?.map((milestone, milestoneIndex: number) => (
                                  <li key={milestoneIndex} className="flex items-start text-sm">
                                    <CheckCircle2 className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                                    <span>{milestone}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </TabsContent>

                <TabsContent value="techniques" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {studyPlan?.studyTechniques?.map((technique, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <CardTitle className="text-lg">{technique.technique}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium">Description:</h4>
                            <p className="mt-1 text-sm">{technique.description}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">Best For:</h4>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {(Array.isArray(technique.bestFor) ? technique.bestFor : []).map(
                                (item, itemIndex) => (
                                  <Badge key={itemIndex} variant="outline">
                                    {item}
                                  </Badge>
                                ),
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">Example:</h4>
                            <p className="mt-1 text-sm italic">{technique.example}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="resources" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {studyPlan?.additionalResources?.map((resource, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">{resource.name}</CardTitle>
                            <Badge>{resource.type}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-sm">{resource.description}</p>
                          <div>
                            <h4 className="text-sm font-medium">Relevant Topics:</h4>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {resource.relevantTopics?.map((topic, topicIndex) => (
                                <Badge key={topicIndex} variant="outline" className="text-xs">
                                  {topic}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="exam" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Final Week Plan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{studyPlan?.examPreparation?.finalWeekPlan}</p>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Day Before Exam</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{studyPlan?.examPreparation?.dayBeforeExam}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Exam Day Tips</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{studyPlan?.examPreparation?.examDayTips}</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button onClick={resetStudyPlan} className="w-full">
            Create New Study Plan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Sources Selected</DialogTitle>
            <DialogDescription>
              No sources are selected. The study plan will be generated based on the model&apos;s
              knowledge of the course. This may result in a more generic study plan. Do you want to
              continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmNoSources}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentView === 'welcome' && renderWelcomeView()}
      {currentView === 'config' && renderConfigView()}
      {currentView === 'plan' && renderStudyPlanView()}
    </div>
  )
}
