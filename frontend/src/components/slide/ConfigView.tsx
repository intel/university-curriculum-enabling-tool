// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Info,
  Loader2,
  Rows3,
  ScrollText,
} from 'lucide-react'
import { useSourcesStore } from '@/lib/store/sources-store'
import {
  type View,
  contentTypeDescriptions,
  contentStyleDescriptions,
  difficultyDescriptions,
} from '@/lib/types/slide'

interface ConfigViewProps {
  setCurrentView: (view: View) => void
  topicName: string
  setTopicName: (name: string) => void
  contentType: string
  setContentType: (type: string) => void
  contentStyle: string
  setContentStyle: (style: string) => void
  sessionLength: number
  setSessionLength: (length: number) => void
  difficultyLevel: string
  setDifficultyLevel: (level: string) => void
  isLoading: boolean
  progress: number
  generateCourseContent: () => Promise<void>
  selectedModel: string | null
}

export function ConfigView({
  setCurrentView,
  topicName,
  setTopicName,
  contentType,
  setContentType,
  contentStyle,
  setContentStyle,
  sessionLength,
  setSessionLength,
  difficultyLevel,
  setDifficultyLevel,
  isLoading,
  progress,
  generateCourseContent,
}: ConfigViewProps) {
  const selectedSources = useSourcesStore((state) => state.selectedSources)

  return (
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
              <CardTitle className="text-2xl">Create Your Teaching Materials</CardTitle>
              <CardDescription>
                Configure the options below to generate customized course content
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      <div className="text-sm text-muted-foreground">
                        <p>
                          No sources selected. Please select at least one source document from the
                          sidebar.
                        </p>
                        <p className="mt-1 font-medium text-amber-500">
                          The generated content will be based ONLY on your selected sources.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <BookOpen className="h-5 w-5 text-primary" />
                Topic Details
              </h3>
              <div className="space-y-2">
                <Label htmlFor="topic-name">Topic Name</Label>
                <Input
                  id="topic-name"
                  placeholder="e.g., Introduction to Machine Learning"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <Rows3 className="h-5 w-5 text-primary" />
                Content Type
              </h3>
              <p className="text-sm text-muted-foreground">
                What type of teaching material do you want to create?
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentType === 'lecture' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentType('lecture')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentType('lecture')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Lecture</h4>
                        <p className="text-sm text-muted-foreground">Slides with notes</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentTypeDescriptions.lecture}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentType === 'tutorial' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentType('tutorial')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentType('tutorial')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Tutorial</h4>
                        <p className="text-sm text-muted-foreground">Step-by-step guide</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentTypeDescriptions.tutorial}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentType === 'workshop' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentType('workshop')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentType('workshop')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Workshop</h4>
                        <p className="text-sm text-muted-foreground">Interactive activities</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentTypeDescriptions.workshop}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {contentType !== 'lecture' && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <h3 className="text-md mb-2 flex items-center gap-2 font-semibold">
                  <Info className="h-5 w-5 text-primary" />
                  {contentType === 'tutorial' ? 'Tutorial Format' : 'Workshop Format'} Information
                </h3>
                <p className="mb-2 text-sm text-muted-foreground">
                  {contentType === 'tutorial'
                    ? 'Tutorials are structured learning experiences focused on developing specific skills through guided practice. They typically include step-by-step instructions, examples, and opportunities for application.'
                    : 'Workshops are interactive sessions designed for collaborative learning and hands-on practice. They typically include group activities, discussion, and opportunities for participants to create or solve problems together.'}
                </p>
                <div className="text-sm">
                  <span className="font-medium">Best used for:</span>{' '}
                  {contentType === 'tutorial'
                    ? 'Skill development, software training, procedural learning, and guided practice with feedback.'
                    : 'Collaborative problem-solving, creative activities, team-based learning, and interactive exploration of concepts.'}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <ScrollText className="h-5 w-5 text-primary" />
                Teaching Style
              </h3>
              <p className="text-sm text-muted-foreground">What teaching approach do you prefer?</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentStyle === 'interactive' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentStyle('interactive')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentStyle('interactive')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Interactive</h4>
                        <p className="text-sm text-muted-foreground">Student engagement focused</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentStyleDescriptions.interactive}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentStyle === 'caseStudy' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentStyle('caseStudy')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentStyle('caseStudy')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Case Study</h4>
                        <p className="text-sm text-muted-foreground">Example-based learning</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentStyleDescriptions.caseStudy}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentStyle === 'problemBased' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentStyle('problemBased')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentStyle('problemBased')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Problem-Based</h4>
                        <p className="text-sm text-muted-foreground">Learning through problems</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentStyleDescriptions.problemBased}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          contentStyle === 'traditional' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setContentStyle('traditional')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setContentStyle('traditional')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Traditional</h4>
                        <p className="text-sm text-muted-foreground">Standard lecture format</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contentStyleDescriptions.traditional}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <Clock className="h-5 w-5 text-primary" />
                Session Length
              </h3>
              <p className="text-sm text-muted-foreground">How long is your teaching session?</p>
              <div className="relative space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    Duration: <span className="font-medium">{sessionLength} minutes</span>
                  </span>
                </div>
                <div className="group relative">
                  <Slider
                    id="session-length"
                    min={30}
                    max={90}
                    step={15}
                    value={[sessionLength]}
                    onValueChange={(value) => setSessionLength(value[0])}
                    className="w-full cursor-pointer"
                  />
                  <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div
                      className="absolute -translate-x-1/2 transform rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                      style={{ left: `${((sessionLength - 30) / 150) * 100}%` }}
                    >
                      {sessionLength}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md flex items-center gap-2 font-semibold">
                <GraduationCap className="h-5 w-5 text-primary" />
                Difficulty Level
              </h3>
              <p className="text-sm text-muted-foreground">What level of students is this for?</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                          difficultyLevel === 'introductory' ? 'border-primary bg-primary/5' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDifficultyLevel('introductory')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setDifficultyLevel('introductory')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Introductory</h4>
                        <p className="text-sm text-muted-foreground">First-year level</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{difficultyDescriptions.introductory}</p>
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
                        role="button"
                        tabIndex={0}
                        onClick={() => setDifficultyLevel('intermediate')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setDifficultyLevel('intermediate')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Intermediate</h4>
                        <p className="text-sm text-muted-foreground">Mid-program level</p>
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
                        role="button"
                        tabIndex={0}
                        onClick={() => setDifficultyLevel('advanced')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setDifficultyLevel('advanced')
                        }}
                      >
                        <h4 className="text-sm font-semibold">Advanced</h4>
                        <p className="text-sm text-muted-foreground">Upper-level/graduate</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{difficultyDescriptions.advanced}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          onClick={generateCourseContent}
          disabled={isLoading || !topicName.trim()}
          className="w-full py-6 text-lg font-medium"
          size="lg"
        >
          {isLoading ? (
            <div className="w-full">
              <div className="mb-2 flex items-center justify-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <span>Generating Content...</span>
              </div>
              <Progress value={progress} className="h-2 w-full" />
            </div>
          ) : (
            <span>Generate Teaching Materials</span>
          )}
        </Button>
      </div>
    </div>
  )
}
