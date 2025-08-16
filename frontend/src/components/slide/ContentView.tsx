'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  ArrowRight,
  AlertTriangle,
  Book,
  Download,
  FileDigit,
  Info,
  ListChecks,
  Presentation,
  Users,
} from 'lucide-react'
import type { LectureContent, View } from '@/lib/types/slide'
import { ActivityDisplay } from './ActivityDisplay'
import { SlideDisplay } from './SlideDisplay'
import { AssessmentDisplay } from './AssessmentDisplay'

interface ContentViewProps {
  courseContent: LectureContent
  contentType: string
  setCurrentView: (view: View) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  generationError: string | null
  sourceMetadata: {
    sourceCount: number
    chunkCount: number
    tokenEstimate: number
    sourceNames: string[]
  } | null
  expandedQuestions: Record<string, boolean>
  toggleQuestionExpansion: (questionId: string) => void
  resetContent: () => void
  handleDownloadPDF: () => Promise<void>
  handleDownloadPPTX: () => Promise<void>
  isPdfGenerating: boolean
  isPptxGenerating: boolean
}

export function ContentView({
  courseContent,
  contentType,
  setCurrentView,
  activeTab,
  setActiveTab,
  generationError,
  sourceMetadata,
  expandedQuestions,
  toggleQuestionExpansion,
  resetContent,
  handleDownloadPDF,
  handleDownloadPPTX,
  isPdfGenerating,
  isPptxGenerating,
}: ContentViewProps) {
  if (!courseContent) return null

  // Determine if we're displaying a workshop or tutorial
  const isWorkshop = contentType === 'workshop'
  const isTutorial = contentType === 'tutorial'
  const isActivityFocused = isWorkshop || isTutorial

  return (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col px-4 pt-8">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader>
            <div className="flex flex-col gap-2">
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
                <CardTitle className="text-center text-2xl">{courseContent.title}</CardTitle>
                <div className="w-[70px]"></div> {/* Spacer for balance */}
              </div>

              {(isWorkshop || isTutorial) && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <Badge variant="secondary" className="text-sm">
                    {isWorkshop ? 'Interactive Workshop' : 'Guided Tutorial'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {isWorkshop
                      ? 'Designed for collaborative, hands-on learning'
                      : 'Structured for progressive skill development'}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {generationError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Generation Warning</AlertTitle>
                <AlertDescription>{generationError}</AlertDescription>
              </Alert>
            )}

            {sourceMetadata && (
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertTitle>Source Information</AlertTitle>
                <AlertDescription>
                  This content was generated from {sourceMetadata.sourceCount} source document(s)
                  containing approximately {sourceMetadata.chunkCount} content chunks.
                  {sourceMetadata.sourceNames.length > 0 && (
                    <div className="mt-1">
                      <span className="font-medium">Sources:</span>{' '}
                      {sourceMetadata.sourceNames.map((name, i) => (
                        <Badge key={i} variant="outline" className="mr-1 mt-1">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Tabs
              defaultValue={isActivityFocused ? 'activities' : 'overview'}
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="mb-4 grid grid-cols-5">
                <TabsTrigger value="overview" className="flex items-center gap-1">
                  <FileDigit className="h-4 w-4" />
                  <span>Overview</span>
                </TabsTrigger>
                <TabsTrigger value="slides" className="flex items-center gap-1">
                  <Presentation className="h-4 w-4" />
                  <span>Slides</span>
                </TabsTrigger>
                <TabsTrigger value="activities" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>
                    {isWorkshop
                      ? 'Workshop Activities'
                      : isTutorial
                        ? 'Tutorial Exercises'
                        : 'Activities'}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="terms" className="flex items-center gap-1">
                  <Book className="h-4 w-4" />
                  <span>Key Terms</span>
                </TabsTrigger>
                <TabsTrigger value="assessment" className="flex items-center gap-1">
                  <ListChecks className="h-4 w-4" />
                  <span>Assessment</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {courseContent.introduction && courseContent.introduction.trim() !== '' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Introduction</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>
                        {typeof courseContent.introduction === 'object'
                          ? JSON.stringify(courseContent.introduction)
                          : courseContent.introduction}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Learning Outcomes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {courseContent.learningOutcomes.map((outcome, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2 font-bold text-primary">{index + 1}.</span>
                          <span>
                            {typeof outcome === 'object' ? JSON.stringify(outcome) : outcome}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Further Readings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {courseContent.furtherReadings.map((reading, index) => (
                        <div key={index} className="rounded-lg border bg-muted/50 p-4">
                          <h4 className="mb-1 text-base font-medium">{reading.title}</h4>
                          {reading.author && (
                            <p className="mb-2 text-sm text-muted-foreground">
                              By {reading.author}
                            </p>
                          )}
                          {reading.readingDescription && (
                            <p className="text-sm">{reading.readingDescription}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slides" className="space-y-4">
                <div className="space-y-6">
                  {courseContent.slides.map((slide, index) => (
                    <SlideDisplay key={index} slide={slide} index={index} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="activities" className="space-y-4">
                <div className="space-y-6">
                  {courseContent.activities.map((activity, index) => (
                    <ActivityDisplay
                      key={index}
                      activity={activity}
                      index={index}
                      isWorkshop={isWorkshop}
                      isTutorial={isTutorial}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="terms" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {courseContent.keyTerms.map((term, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{term.term}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p>{term.definition}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="assessment" className="space-y-4">
                <AssessmentDisplay
                  assessmentIdeas={courseContent.assessmentIdeas}
                  expandedQuestions={expandedQuestions}
                  toggleQuestionExpansion={toggleQuestionExpansion}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between">
          <Button
            onClick={resetContent}
            variant="default"
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            <span>Create New Content</span>
          </Button>
          <ButtonGroup>
            <Button
              onClick={handleDownloadPDF}
              disabled={isPdfGenerating || isPptxGenerating}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              <span>PDF</span>
            </Button>
            <Button
              onClick={handleDownloadPPTX}
              disabled={isPptxGenerating || isPdfGenerating}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              <span>PowerPoint</span>
            </Button>
          </ButtonGroup>
        </div>
      </div>
    </div>
  )
}
