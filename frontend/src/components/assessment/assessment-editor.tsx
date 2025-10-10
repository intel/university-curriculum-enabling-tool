// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Trash2, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { AssessmentQuestion, AssessmentIdea, ExplanationObject } from '@/lib/types/assessment-types'

// Add metadata props to the AssessmentEditorProps interface
interface AssessmentEditorProps {
  assessment: AssessmentIdea
  isEditing: boolean
  onUpdateQuestion: (index: number, question: AssessmentQuestion) => void
  onDeleteQuestion: (index: number) => void
  onUpdateDetails: (field: string, value: string) => void
  // Add metadata props
  metadata: {
    courseCode: string
    courseName: string
    examTitle: string
    semester?: string
    academicYear?: string
    deadline?: string
    groupSize?: number
    projectDuration?: string
  }
  onUpdateMetadata: (field: string, value: string | number) => void
}

// Update the AssessmentEditor component to include metadata editing
export default function AssessmentEditor({
  assessment,
  isEditing,
  onUpdateQuestion,
  onDeleteQuestion,
  onUpdateDetails,
  metadata,
  onUpdateMetadata,
}: AssessmentEditorProps) {
  // Treat both English and Indonesian labels as project type (e.g., "Project" or "Proyek")
  const isProjectType = /\b(project|proyek)\b/i.test(assessment.type)
  const [previewMode, setPreviewMode] = useState<boolean>(false)

  // Function to clean Markdown formatting from text
  const cleanMarkdownFormatting = (text: string): string => {
    if (!text) return ''

    // Remove Markdown formatting like **bold** or *italic* or __underline__
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/__(.*?)__/g, '$1') // Remove underline
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove any remaining asterisks
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{assessment.type} Assessment</h2>
        {!isEditing && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Preview Mode</span>
            <Switch checked={previewMode} onCheckedChange={setPreviewMode} />
          </div>
        )}
      </div>

      {/* Add metadata editing section */}
      {isEditing ? (
        <div className="bg-gray-80 space-y-4 rounded-md border p-4">
          <h3 className="font-medium">Assessment Information</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="courseCode">Course Code</Label>
              <Input
                id="courseCode"
                value={metadata.courseCode}
                onChange={(e) => onUpdateMetadata('courseCode', e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="courseName">Course Name</Label>
              <Input
                id="courseName"
                value={metadata.courseName}
                onChange={(e) => onUpdateMetadata('courseName', e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="examTitle">{assessment.type} Title</Label>
              <Input
                id="examTitle"
                value={metadata.examTitle}
                onChange={(e) => onUpdateMetadata('examTitle', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Project-specific fields */}
          {isProjectType && (
            <div className="mt-4 border-t pt-4">
              <h3 className="mb-3 font-medium">Project-Specific Information</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="projectDuration">Project Duration</Label>
                  <Input
                    id="projectDuration"
                    value={metadata.projectDuration || assessment.duration}
                    onChange={(e) => {
                      const value = e.target.value
                      onUpdateMetadata('projectDuration', value)

                      // Calculate new deadline based on duration
                      const durationMatch = value.match(/(\d+)\s*(day|week|month|semester|year)s?/i)
                      if (durationMatch) {
                        const amount = Number.parseInt(durationMatch[1])
                        const unit = durationMatch[2].toLowerCase()

                        // Calculate the deadline date
                        const now = new Date()
                        const deadline = new Date(now)

                        switch (unit) {
                          case 'day':
                            deadline.setDate(now.getDate() + amount)
                            break
                          case 'week':
                            deadline.setDate(now.getDate() + amount * 7)
                            break
                          case 'month':
                            deadline.setMonth(now.getMonth() + amount)
                            break
                          case 'semester':
                            deadline.setMonth(now.getMonth() + amount * 4) // Approximate a semester as 4 months
                            break
                          case 'year':
                            deadline.setFullYear(now.getFullYear() + amount)
                            break
                        }

                        // Format the deadline date
                        const day = deadline.getDate()
                        const month = deadline.toLocaleString('default', { month: 'long' })
                        const year = deadline.getFullYear()

                        // Add ordinal suffix to day
                        const ordinalSuffix = (day: number): string => {
                          if (day > 3 && day < 21) return `${day}th`
                          switch (day % 10) {
                            case 1:
                              return `${day}st`
                            case 2:
                              return `${day}nd`
                            case 3:
                              return `${day}rd`
                            default:
                              return `${day}th`
                          }
                        }

                        const formattedDeadline = `${ordinalSuffix(day)} ${month} ${year}, by 6:15 pm`
                        onUpdateMetadata('deadline', formattedDeadline)
                      }
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="semester">Semester</Label>
                  <Input
                    id="semester"
                    value={metadata.semester || ''}
                    onChange={(e) => {
                      let value = e.target.value
                      // If input is just a number, prepend "Semester "
                      if (/^\d+$/.test(value)) {
                        value = `Semester ${value}`
                      }
                      onUpdateMetadata('semester', value)
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="deadline">Submission Deadline</Label>
                  <Input
                    id="deadline"
                    value={metadata.deadline || ''}
                    onChange={(e) => onUpdateMetadata('deadline', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="academicYear">Academic Year</Label>
                  <Input
                    id="academicYear"
                    value={metadata.academicYear || ''}
                    onChange={(e) => onUpdateMetadata('academicYear', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="groupSize">Group Size</Label>
                  <Input
                    id="groupSize"
                    type="number"
                    min="1"
                    max="10"
                    value={metadata.groupSize || ''}
                    onChange={(e) =>
                      onUpdateMetadata('groupSize', Number.parseInt(e.target.value) || 0)
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={assessment.description}
              onChange={(e) => onUpdateDetails('description', e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="duration">Duration</Label>
            <Input
              id="duration"
              value={assessment.duration}
              onChange={(e) => onUpdateDetails('duration', e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      ) : (
        <div className="bg-gray-60 rounded-md border p-4">
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-gray-500">Course</p>
              <p className="font-medium">
                {metadata.courseCode} - {metadata.courseName}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500">{assessment.type} Title</p>
              <p className="font-medium">{metadata.examTitle}</p>
            </div>
          </div>

          {isProjectType && (
            <div className="mb-4 grid grid-cols-1 gap-4 border-t pt-3 md:grid-cols-3">
              {/* <div>
                <p className="text-sm font-medium text-gray-500">Semester</p>
                <p>{metadata.semester || "Not specified"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Academic Year</p>
                <p>{metadata.academicYear || "Not specified"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Deadline</p>
                <p>{metadata.deadline || assessment.deadline}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Group Size</p>
                <p>{metadata.groupSize || "Not specified"}</p>
              </div> */}
              <div>
                <p className="text-sm font-medium text-gray-500">Duration</p>
                <p>{metadata.projectDuration || assessment.duration}</p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-lg font-medium">Description</p>
            <p className="mt-1">{cleanMarkdownFormatting(assessment.description)}</p>
            <p className="mt-2 text-sm text-gray-500">Duration: {assessment.duration}</p>
          </div>
        </div>
      )}

      <div className="mt-6">
        {isProjectType ? (
          <Tabs defaultValue="project" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project">Project Description</TabsTrigger>
              <TabsTrigger value="rubrics">Grading Rubrics</TabsTrigger>
            </TabsList>
            <TabsContent value="project" className="mt-4">
              <ProjectEditor
                question={assessment.exampleQuestions[0]}
                isEditing={isEditing}
                previewMode={previewMode}
                onUpdate={(updatedQuestion) => onUpdateQuestion(0, updatedQuestion)}
              />
            </TabsContent>
            <TabsContent value="rubrics" className="mt-4">
              <RubricsEditor
                question={assessment.exampleQuestions[0]}
                isEditing={isEditing}
                previewMode={previewMode}
                onUpdate={(updatedQuestion) => onUpdateQuestion(0, updatedQuestion)}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <h3 className="mb-4 text-lg font-medium">Questions</h3>
            <div className="space-y-6">
              {assessment.exampleQuestions.map((question, index) => (
                <QuestionEditor
                  key={index}
                  question={question}
                  index={index}
                  isEditing={isEditing}
                  previewMode={previewMode}
                  onUpdate={(updatedQuestion) => onUpdateQuestion(index, updatedQuestion)}
                  onDelete={() => onDeleteQuestion(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface ProjectEditorProps {
  question: AssessmentQuestion
  isEditing: boolean
  previewMode: boolean
  onUpdate: (question: AssessmentQuestion) => void
}

function ProjectEditor({ question, isEditing, previewMode, onUpdate }: ProjectEditorProps) {
  // Helper function to clean the model answer
  const cleanModelAnswer = (answer: string | undefined): string => {
    if (!answer) return ''

    // Check if the answer looks like JSON
    if (
      (answer.trim().startsWith('{') && answer.trim().endsWith('}')) ||
      answer.includes('"modelAnswer"')
    ) {
      try {
        // Try to parse it as JSON
        const parsed = JSON.parse(answer)
        if (parsed.modelAnswer) {
          return parsed.modelAnswer
        }
      } catch {
        // If parsing fails, try to extract with regex
        const match = answer.match(/"modelAnswer"\s*:\s*"([\s\S]*?)"/)
        if (match && match[1]) {
          return match[1].replace(/\\"/g, '"')
        }
      }
    }

    return answer
  }

  // Function to format project description sections with proper styling
  const formatProjectDescription = (text: string) => {
    if (!text) return null

    const sections = text.split('\n')
    const formattedSections = []

    let currentTitle = ''
    let currentContent = []

    const getIndentLevel = (line: string) => {
      const tabMatch = line.match(/^\t+/)
      const spaceMatch = line.match(/^( {4})+/)
      const tabCount = tabMatch ? tabMatch[0].length : 0
      const spaceCount = spaceMatch ? spaceMatch[0].length / 4 : 0
      return tabCount + spaceCount
    }

    for (let i = 0; i < sections.length; i++) {
      const originalLine = sections[i]
      const section = originalLine.trim()
      if (!section) continue

      const standaloneHeader = section.match(/^\*\*(.+)\*\*$/)
      if (standaloneHeader) {
        if (currentContent.length > 0) {
          formattedSections.push(
            <div key={`section-${formattedSections.length}`} className="mb-4">
              {currentTitle && <h5 className="mb-1 font-bold">{currentTitle}</h5>}
              {currentContent}
            </div>,
          )
          currentContent = []
        }
        currentTitle = standaloneHeader[1].trim()
        continue
      }

      const inlineHeaderContent = section.match(/^\*\*(.+?):\*\*\s*(.+)$/)
      if (inlineHeaderContent) {
        const header = inlineHeaderContent[1].trim()
        const content = inlineHeaderContent[2].trim()
        currentContent.push(
          <div key={`header-${i}`} className="mb-1">
            <strong>{header}:</strong> {content}
          </div>,
        )
        continue
      }

      if (section.match(/^\*\*(.+?):\*\*$/)) {
        if (currentContent.length > 0) {
          formattedSections.push(
            <div key={`section-${formattedSections.length}`} className="mb-4">
              {currentTitle && <h5 className="mb-1 font-bold">{currentTitle}</h5>}
              {currentContent}
            </div>,
          )
          currentContent = []
        }
        currentTitle = section.replace(/^\*\*|\*\*$/g, '')
        continue
      }

      const isListItem = /^(\*|-|\+|\d+[.)]|[a-zA-Z][.)]|[IVXLCDM]+[.)])\s+/.test(section)
      if (isListItem) {
        const indentLevel = getIndentLevel(originalLine)
        const marginLeft = 5 + indentLevel * 16

        currentContent.push(
          <div key={`list-${i}`} style={{ marginLeft }} className="mb-1">
            {formatTextWithBold(section)}
          </div>,
        )
        continue
      }

      currentContent.push(
        <p key={`para-${i}`} className="mb-2">
          {formatTextWithBold(section)}
        </p>,
      )
    }

    if (currentContent.length > 0) {
      formattedSections.push(
        <div key={`section-${formattedSections.length}`} className="mb-2">
          {currentTitle && <h5 className="mb-2 font-bold">{currentTitle}</h5>}
          {currentContent}
        </div>,
      )
    }

    return formattedSections
  }

  const formatTextWithBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return (
      <>
        {parts.map((part, idx) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={idx}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={idx}>{part}</span>
          ),
        )}
      </>
    )
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="w-full space-y-4">
                <div>
                  <Label htmlFor="project-description">Project Description</Label>
                  <p className="mb-1 text-xs text-gray-500">
                    Use **Title:** to create section titles. Use **text** to make text bold. Use *
                    or - for bullet points.
                  </p>
                  <Textarea
                    id="project-description"
                    value={question.question}
                    onChange={(e) => onUpdate({ ...question, question: e.target.value })}
                    className="mt-1 font-mono text-sm"
                    rows={20}
                  />
                </div>

                <div>
                  <Label htmlFor="model-answer">Model Answer/Guidelines</Label>
                  <p className="mb-1 text-xs text-gray-500">
                    Use **Title:** to create section titles. Use **text** to make text bold. Use *
                    or - for bullet points.
                  </p>
                  <Textarea
                    id="model-answer"
                    value={cleanModelAnswer(question.correctAnswer)}
                    onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                    className="mt-1"
                    rows={10}
                  />
                </div>
              </div>
            ) : (
              <div>
                <h4 className="mb-4 font-medium">Project Description</h4>
                <div className="bg-gray-60 whitespace-pre-line rounded-md border p-4">
                  {formatProjectDescription(question.question)}
                </div>

                {!previewMode && question.correctAnswer && (
                  <div className="mt-6">
                    <h5 className="mb-2 font-medium">Model Answer/Guidelines</h5>
                    <div className="bg-gray-60 whitespace-pre-line rounded-md border p-4">
                      {formatProjectDescription(question.correctAnswer)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface RubricsEditorProps {
  question: AssessmentQuestion
  isEditing: boolean
  previewMode: boolean
  onUpdate: (question: AssessmentQuestion) => void
}

function RubricsEditor({ question, isEditing, previewMode, onUpdate }: RubricsEditorProps) {
  const [explanation, setExplanation] = useState<ExplanationObject>(
    (typeof question.explanation === 'object'
      ? question.explanation
      : {
          criteria: [],
          markAllocation: [],
          rubricLevels: [],
        }) as ExplanationObject,
  )

  // Helpers to support both English and Indonesian rubric category labels
  const rubricPrefixes = {
    report: ['Report - ', 'Laporan - '],
    demo: ['Demo - ', 'Presentasi Demo - '],
    individual: ['Individual Contribution - ', 'Kontribusi Individu - '],
  }

  const startsWithAny = (name: string, prefixes: string[]) =>
    prefixes.some((p) => name.startsWith(p))

  const removeAnyPrefix = (name: string, prefixes: string[]) => {
    for (const p of prefixes) if (name.startsWith(p)) return name.slice(p.length)
    return name
  }

  // Function to update the explanation object and propagate changes
  const updateExplanation = (newExplanation: ExplanationObject) => {
    setExplanation(newExplanation)
    onUpdate({ ...question, explanation: newExplanation })
  }

  // Function to add a new criterion
  const addCriterion = (category: string) => {
    const newCriteria = [...explanation.criteria]
    newCriteria.push({
      name: `${category} - New Criterion`,
      weight: 10,
      description: 'Description of the criterion',
    })
    updateExplanation({ ...explanation, criteria: newCriteria })
  }

  // Function to update a criterion
  const updateCriterion = (index: number, field: string, value: string | number) => {
    const newCriteria = [...explanation.criteria]
    newCriteria[index] = { ...newCriteria[index], [field]: value }
    updateExplanation({ ...explanation, criteria: newCriteria })
  }

  // Function to remove a criterion
  const removeCriterion = (index: number) => {
    const newCriteria = [...explanation.criteria]
    newCriteria.splice(index, 1)
    updateExplanation({ ...explanation, criteria: newCriteria })
  }

  // Function to add a new mark allocation
  const addMarkAllocation = () => {
    const newMarkAllocation = [...explanation.markAllocation]
    newMarkAllocation.push({
      component: 'New Component',
      marks: 10,
      description: 'Description of the component',
    })
    updateExplanation({ ...explanation, markAllocation: newMarkAllocation })
  }

  // Function to update a mark allocation
  const updateMarkAllocation = (index: number, field: string, value: string | number) => {
    const newMarkAllocation = [...explanation.markAllocation]
    newMarkAllocation[index] = { ...newMarkAllocation[index], [field]: value }
    updateExplanation({ ...explanation, markAllocation: newMarkAllocation })
  }

  // Function to remove a mark allocation
  const removeMarkAllocation = (index: number) => {
    const newMarkAllocation = [...explanation.markAllocation]
    newMarkAllocation.splice(index, 1)
    updateExplanation({ ...explanation, markAllocation: newMarkAllocation })
  }

  // Function to add a new rubric level
  const addRubricLevel = () => {
    const newRubricLevels = [...(explanation.rubricLevels || [])]
    newRubricLevels.push({
      level: 'New Level',
      criteria: { 'Criterion 1': 'Description for criterion 1' },
    })
    updateExplanation({ ...explanation, rubricLevels: newRubricLevels })
  }

  // Function to update a rubric level
  const updateRubricLevel = (index: number, field: string, value: string) => {
    const newRubricLevels = [...(explanation.rubricLevels || [])]
    if (field === 'level') {
      newRubricLevels[index] = { ...newRubricLevels[index], level: value }
    } else {
      // For criteria updates
      const [criterionName] = field.split('|')
      const newCriteria = { ...newRubricLevels[index].criteria }
      newCriteria[criterionName] = value
      newRubricLevels[index] = { ...newRubricLevels[index], criteria: newCriteria }
    }
    updateExplanation({ ...explanation, rubricLevels: newRubricLevels })
  }

  // Function to add a new criterion to a rubric level
  const addRubricLevelCriterion = (levelIndex: number) => {
    const newRubricLevels = [...(explanation.rubricLevels || [])]
    const newCriteria = { ...newRubricLevels[levelIndex].criteria }
    newCriteria[`New Criterion ${Object.keys(newCriteria).length + 1}`] =
      'Description for new criterion'
    newRubricLevels[levelIndex] = { ...newRubricLevels[levelIndex], criteria: newCriteria }
    updateExplanation({ ...explanation, rubricLevels: newRubricLevels })
  }

  // Function to remove a criterion from a rubric level
  const removeRubricLevelCriterion = (levelIndex: number, criterionName: string) => {
    const newRubricLevels = [...(explanation.rubricLevels || [])]
    const newCriteria = { ...newRubricLevels[levelIndex].criteria }
    delete newCriteria[criterionName]
    newRubricLevels[levelIndex] = { ...newRubricLevels[levelIndex], criteria: newCriteria }
    updateExplanation({ ...explanation, rubricLevels: newRubricLevels })
  }

  // Function to remove a rubric level
  const removeRubricLevel = (index: number) => {
    const newRubricLevels = [...(explanation.rubricLevels || [])]
    newRubricLevels.splice(index, 1)
    updateExplanation({ ...explanation, rubricLevels: newRubricLevels })
  }

  if (!explanation) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p>No rubrics available. Please generate the assessment again.</p>
        </CardContent>
      </Card>
    )
  }

  // Group criteria by category (supports EN + ID prefixes)
  const reportCriteria =
    explanation.criteria?.filter((c) => startsWithAny(c.name, rubricPrefixes.report)) || []
  const demoCriteria =
    explanation.criteria?.filter((c) => startsWithAny(c.name, rubricPrefixes.demo)) || []
  const individualCriteria =
    explanation.criteria?.filter((c) => startsWithAny(c.name, rubricPrefixes.individual)) || []
  const otherCriteria =
    explanation.criteria?.filter(
      (c) =>
        !startsWithAny(c.name, rubricPrefixes.report) &&
        !startsWithAny(c.name, rubricPrefixes.demo) &&
        !startsWithAny(c.name, rubricPrefixes.individual),
    ) || []

  // Prefer provided marking scale (could be Indonesian) with English fallback
  const explanationObj: ExplanationObject | null =
    typeof question.explanation === 'object' ? (question.explanation as ExplanationObject) : null
  let markingScaleText =
    'Marking Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5- Excellent.'
  if (explanationObj) {
    const maybeScale = (explanationObj as Record<string, unknown>)['markingScale']
    if (typeof maybeScale === 'string') {
      markingScaleText = maybeScale
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="w-full space-y-6">
                <Accordion type="single" collapsible defaultValue="criteria" className="w-full">
                  <AccordionItem value="criteria">
                    <AccordionTrigger>Criteria</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        {/* Report Criteria */}
                        <div className="bg-gray-60 rounded-md border p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <h5 className="font-medium">Report Criteria</h5>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addCriterion('Report')}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Add
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {reportCriteria.map((criterion, index) => {
                              const criteriaIndex = explanation.criteria.findIndex(
                                (c) => c === criterion,
                              )
                              return (
                                <div key={index} className="rounded-md border bg-white p-3">
                                  <div className="mb-2 flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <Label htmlFor={`report-name-${index}`}>Name</Label>
                                        <Input
                                          id={`report-name-${index}`}
                                          value={criterion.name}
                                          onChange={(e) =>
                                            updateCriterion(criteriaIndex, 'name', e.target.value)
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`report-weight-${index}`}>Weight (%)</Label>
                                        <Input
                                          id={`report-weight-${index}`}
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={criterion.weight}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'weight',
                                              Number(e.target.value),
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`report-desc-${index}`}>Description</Label>
                                        <Textarea
                                          id={`report-desc-${index}`}
                                          value={criterion.description || ''}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'description',
                                              e.target.value,
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeCriterion(criteriaIndex)}
                                      className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                            {reportCriteria.length === 0 && (
                              <p className="text-sm text-gray-500">No report criteria added yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Demo Criteria */}
                        <div className="bg-gray-60 rounded-md border p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <h5 className="font-medium">Demo Presentation Criteria</h5>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addCriterion('Demo')}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Add
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {demoCriteria.map((criterion, index) => {
                              const criteriaIndex = explanation.criteria.findIndex(
                                (c) => c === criterion,
                              )
                              return (
                                <div key={index} className="rounded-md border bg-white p-3">
                                  <div className="mb-2 flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <Label htmlFor={`demo-name-${index}`}>Name</Label>
                                        <Input
                                          id={`demo-name-${index}`}
                                          value={criterion.name}
                                          onChange={(e) =>
                                            updateCriterion(criteriaIndex, 'name', e.target.value)
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`demo-weight-${index}`}>Weight (%)</Label>
                                        <Input
                                          id={`demo-weight-${index}`}
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={criterion.weight}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'weight',
                                              Number(e.target.value),
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`demo-desc-${index}`}>Description</Label>
                                        <Textarea
                                          id={`demo-desc-${index}`}
                                          value={criterion.description || ''}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'description',
                                              e.target.value,
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeCriterion(criteriaIndex)}
                                      className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                            {demoCriteria.length === 0 && (
                              <p className="text-sm text-gray-500">No demo criteria added yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Individual Contribution Criteria */}
                        <div className="bg-gray-60 rounded-md border p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <h5 className="font-medium">Individual Contribution Criteria</h5>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addCriterion('Individual Contribution')}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Add
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {individualCriteria.map((criterion, index) => {
                              const criteriaIndex = explanation.criteria.findIndex(
                                (c) => c === criterion,
                              )
                              return (
                                <div key={index} className="rounded-md border bg-white p-3">
                                  <div className="mb-2 flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <div>
                                        <Label htmlFor={`individual-name-${index}`}>Name</Label>
                                        <Input
                                          id={`individual-name-${index}`}
                                          value={criterion.name}
                                          onChange={(e) =>
                                            updateCriterion(criteriaIndex, 'name', e.target.value)
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`individual-weight-${index}`}>
                                          Weight (%)
                                        </Label>
                                        <Input
                                          id={`individual-weight-${index}`}
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={criterion.weight}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'weight',
                                              Number(e.target.value),
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`individual-desc-${index}`}>
                                          Description
                                        </Label>
                                        <Textarea
                                          id={`individual-desc-${index}`}
                                          value={criterion.description || ''}
                                          onChange={(e) =>
                                            updateCriterion(
                                              criteriaIndex,
                                              'description',
                                              e.target.value,
                                            )
                                          }
                                          className="mt-1"
                                        />
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeCriterion(criteriaIndex)}
                                      className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )
                            })}
                            {individualCriteria.length === 0 && (
                              <p className="text-sm text-gray-500">
                                No individual contribution criteria added yet.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Other Criteria */}
                        {otherCriteria.length > 0 && (
                          <div className="bg-gray-60 rounded-md border p-4">
                            <div className="mb-2 flex items-center justify-between">
                              <h5 className="font-medium">Other Criteria</h5>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addCriterion('Other')}
                              >
                                <Plus className="mr-1 h-3 w-3" /> Add
                              </Button>
                            </div>
                            <div className="space-y-3">
                              {otherCriteria.map((criterion, index) => {
                                const criteriaIndex = explanation.criteria.findIndex(
                                  (c) => c === criterion,
                                )
                                return (
                                  <div key={index} className="rounded-md border bg-white p-3">
                                    <div className="mb-2 flex items-start justify-between">
                                      <div className="flex-1 space-y-2">
                                        <div>
                                          <Label htmlFor={`other-name-${index}`}>Name</Label>
                                          <Input
                                            id={`other-name-${index}`}
                                            value={criterion.name}
                                            onChange={(e) =>
                                              updateCriterion(criteriaIndex, 'name', e.target.value)
                                            }
                                            className="mt-1"
                                          />
                                        </div>
                                        <div>
                                          <Label htmlFor={`other-weight-${index}`}>
                                            Weight (%)
                                          </Label>
                                          <Input
                                            id={`other-weight-${index}`}
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={criterion.weight}
                                            onChange={(e) =>
                                              updateCriterion(
                                                criteriaIndex,
                                                'weight',
                                                Number(e.target.value),
                                              )
                                            }
                                            className="mt-1"
                                          />
                                        </div>
                                        <div>
                                          <Label htmlFor={`other-desc-${index}`}>Description</Label>
                                          <Textarea
                                            id={`other-desc-${index}`}
                                            value={criterion.description || ''}
                                            onChange={(e) =>
                                              updateCriterion(
                                                criteriaIndex,
                                                'description',
                                                e.target.value,
                                              )
                                            }
                                            className="mt-1"
                                          />
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeCriterion(criteriaIndex)}
                                        className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="markAllocation">
                    <AccordionTrigger>Mark Allocation</AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-gray-60 rounded-md border p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h5 className="font-medium">Mark Allocation</h5>
                          <Button variant="outline" size="sm" onClick={addMarkAllocation}>
                            <Plus className="mr-1 h-3 w-3" /> Add
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {explanation.markAllocation.map((item, index) => (
                            <div key={index} className="rounded-md border bg-white p-3">
                              <div className="mb-2 flex items-start justify-between">
                                <div className="flex-1 space-y-2">
                                  <div>
                                    <Label htmlFor={`mark-component-${index}`}>Component</Label>
                                    <Input
                                      id={`mark-component-${index}`}
                                      value={item.component}
                                      onChange={(e) =>
                                        updateMarkAllocation(index, 'component', e.target.value)
                                      }
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`mark-marks-${index}`}>Marks</Label>
                                    <Input
                                      id={`mark-marks-${index}`}
                                      type="number"
                                      min="0"
                                      value={item.marks}
                                      onChange={(e) =>
                                        updateMarkAllocation(index, 'marks', Number(e.target.value))
                                      }
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`mark-desc-${index}`}>Description</Label>
                                    <Textarea
                                      id={`mark-desc-${index}`}
                                      value={item.description || ''}
                                      onChange={(e) =>
                                        updateMarkAllocation(index, 'description', e.target.value)
                                      }
                                      className="mt-1"
                                    />
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeMarkAllocation(index)}
                                  className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          {explanation.markAllocation.length === 0 && (
                            <p className="text-sm text-gray-500">No mark allocations added yet.</p>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="rubricLevels">
                    <AccordionTrigger>Detailed Rubric Descriptions</AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-gray-60 rounded-md border p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h5 className="font-medium">Rubric Levels</h5>
                          <Button variant="outline" size="sm" onClick={addRubricLevel}>
                            <Plus className="mr-1 h-3 w-3" /> Add Level
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {explanation.rubricLevels?.map((level, levelIndex) => (
                            <div key={levelIndex} className="rounded-md border bg-white p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex-1">
                                  <Label htmlFor={`level-name-${levelIndex}`}>Level Name</Label>
                                  <Input
                                    id={`level-name-${levelIndex}`}
                                    value={level.level}
                                    onChange={(e) =>
                                      updateRubricLevel(levelIndex, 'level', e.target.value)
                                    }
                                    className="mt-1"
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeRubricLevel(levelIndex)}
                                  className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="mt-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <h6 className="text-sm font-medium">Criteria</h6>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addRubricLevelCriterion(levelIndex)}
                                  >
                                    <Plus className="mr-1 h-3 w-3" /> Add Criterion
                                  </Button>
                                </div>
                                <div className="space-y-3">
                                  {Object.entries(level.criteria).map(
                                    ([criterionName, description], criterionIndex) => (
                                      <div
                                        key={criterionIndex}
                                        className="bg-gray-60 rounded-md border p-3"
                                      >
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1 space-y-2">
                                            <div>
                                              <Label
                                                htmlFor={`criterion-name-${levelIndex}-${criterionIndex}`}
                                              >
                                                Criterion Name
                                              </Label>
                                              <Input
                                                id={`criterion-name-${levelIndex}-${criterionIndex}`}
                                                value={criterionName}
                                                onChange={(e) => {
                                                  const newCriteria = { ...level.criteria }
                                                  const oldValue = newCriteria[criterionName]
                                                  delete newCriteria[criterionName]
                                                  newCriteria[e.target.value] = oldValue
                                                  const newRubricLevels = [
                                                    ...(explanation.rubricLevels || []),
                                                  ]
                                                  newRubricLevels[levelIndex] = {
                                                    ...level,
                                                    criteria: newCriteria,
                                                  }
                                                  updateExplanation({
                                                    ...explanation,
                                                    rubricLevels: newRubricLevels,
                                                  })
                                                }}
                                                className="mt-1"
                                              />
                                            </div>
                                            <div>
                                              <Label
                                                htmlFor={`criterion-desc-${levelIndex}-${criterionIndex}`}
                                              >
                                                Description
                                              </Label>
                                              <Textarea
                                                id={`criterion-desc-${levelIndex}-${criterionIndex}`}
                                                value={description}
                                                onChange={(e) =>
                                                  updateRubricLevel(
                                                    levelIndex,
                                                    `${criterionName}|description`,
                                                    e.target.value,
                                                  )
                                                }
                                                className="mt-1"
                                              />
                                            </div>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              removeRubricLevelCriterion(levelIndex, criterionName)
                                            }
                                            className="ml-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    ),
                                  )}
                                  {Object.keys(level.criteria).length === 0 && (
                                    <p className="text-sm text-gray-500">
                                      No criteria added for this level yet.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {(!explanation.rubricLevels || explanation.rubricLevels.length === 0) && (
                            <p className="text-sm text-gray-500">No rubric levels added yet.</p>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            ) : (
              <div>
                <h4 className="mb-4 font-medium">Grading Rubrics</h4>
                <p className="mb-4">{markingScaleText}</p>

                {/* Report Criteria */}
                {reportCriteria.length > 0 && (
                  <div className="mb-6">
                    <h5 className="mb-2 font-medium">REPORT (55%)</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-80">
                            <th className="w-1/4 border border-gray-300 px-4 py-2 text-left">
                              Criteria
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Excellent (5)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Good (4)</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Average (3)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Acceptable (2)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Poor (1)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportCriteria.map((criterion, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? 'bg-gray-80' : 'bg-gray-60'}
                            >
                              <td className="border border-gray-300 px-4 py-2 font-medium">
                                {removeAnyPrefix(criterion.name, rubricPrefixes.report)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2">A, A-</td>
                              <td className="border border-gray-300 px-4 py-2">B+, B, B-</td>
                              <td className="border border-gray-300 px-4 py-2">C+, C</td>
                              <td className="border border-gray-300 px-4 py-2">C-, D+</td>
                              <td className="border border-gray-300 px-4 py-2">D, D-, F</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Demo Criteria */}
                {demoCriteria.length > 0 && (
                  <div className="mb-6">
                    <h5 className="mb-2 font-medium">DEMO PRESENTATION (30%)</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-80">
                            <th className="w-1/4 border border-gray-300 px-4 py-2 text-left">
                              Criteria
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Excellent (5)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Good (4)</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Average (3)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Acceptable (2)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Poor (1)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {demoCriteria.map((criterion, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? 'bg-gray-80' : 'bg-gray-60'}
                            >
                              <td className="border border-gray-300 px-4 py-2 font-medium">
                                {removeAnyPrefix(criterion.name, rubricPrefixes.demo)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2">A, A-</td>
                              <td className="border border-gray-300 px-4 py-2">B+, B, B-</td>
                              <td className="border border-gray-300 px-4 py-2">C+, C</td>
                              <td className="border border-gray-300 px-4 py-2">C-, D+</td>
                              <td className="border border-gray-300 px-4 py-2">D, D-, F</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Individual Contribution Criteria */}
                {individualCriteria.length > 0 && (
                  <div className="mb-6">
                    <h5 className="mb-2 font-medium">INDIVIDUAL CONTRIBUTION (15%)</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-80">
                            <th className="w-1/4 border border-gray-300 px-4 py-2 text-left">
                              Criteria
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Excellent (5)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Good (4)</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Average (3)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Acceptable (2)
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Poor (1)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {individualCriteria.map((criterion, index) => (
                            <tr
                              key={index}
                              className={index % 2 === 0 ? 'bg-gray-80' : 'bg-gray-60'}
                            >
                              <td className="border border-gray-300 px-4 py-2 font-medium">
                                {removeAnyPrefix(criterion.name, rubricPrefixes.individual)}
                              </td>
                              <td className="border border-gray-300 px-4 py-2">A, A-</td>
                              <td className="border border-gray-300 px-4 py-2">B+, B, B-</td>
                              <td className="border border-gray-300 px-4 py-2">C+, C</td>
                              <td className="border border-gray-300 px-4 py-2">C-, D+</td>
                              <td className="border border-gray-300 px-4 py-2">D, D-, F</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detailed Rubric Descriptions */}
                {!previewMode &&
                  explanation.rubricLevels &&
                  explanation.rubricLevels.length > 0 && (
                    <div className="mt-8">
                      <h5 className="mb-4 font-medium">DETAILED RUBRIC DESCRIPTIONS</h5>
                      <div className="space-y-6">
                        {explanation.rubricLevels.map((level, levelIndex) => (
                          <div key={levelIndex} className="bg-gray-60 rounded-md border p-4">
                            <h6 className="mb-2 font-medium">{level.level}</h6>
                            <div className="space-y-2">
                              {Object.entries(level.criteria).map(
                                ([criterion, description], criterionIndex) => (
                                  <div key={criterionIndex} className="ml-4">
                                    <p>
                                      <span className="font-medium">{criterion}:</span>{' '}
                                      {description}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Mark Allocation */}
                {!previewMode &&
                  explanation.markAllocation &&
                  explanation.markAllocation.length > 0 && (
                    <div className="mt-8">
                      <h5 className="mb-2 font-medium">MARK ALLOCATION</h5>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-80">
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Component
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-left">Marks</th>
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Description
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {explanation.markAllocation.map((item, index) => (
                              <tr
                                key={index}
                                className={index % 2 === 0 ? 'bg-gray-80' : 'bg-gray-60'}
                              >
                                <td className="border border-gray-300 px-4 py-2 font-medium">
                                  {item.component}
                                </td>
                                <td className="border border-gray-300 px-4 py-2">{item.marks}</td>
                                <td className="border border-gray-300 px-4 py-2">
                                  {item.description}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface QuestionEditorProps {
  question: AssessmentQuestion
  index: number
  isEditing: boolean
  previewMode: boolean
  onUpdate: (question: AssessmentQuestion) => void
  onDelete: () => void
}

function QuestionEditor({
  question,
  index,
  isEditing,
  previewMode,
  onUpdate,
  onDelete,
}: QuestionEditorProps) {
  const [questionType, setQuestionType] = useState<string>(
    question.options && question.options.length > 0 ? 'multiple-choice' : 'essay',
  )

  // Function to format text with bold (convert **text** to <strong>text</strong>)
  const formatTextWithBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g) // Split text by bold markers (**)
    return (
      <>
        {parts.map((part, index) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={index}>{part.slice(2, -2)}</strong> // Remove ** and wrap in <strong>
          ) : (
            <span key={index}>{part}</span> // Render normal text
          ),
        )}
      </>
    )
  }

  // Helper function to clean the model answer
  const cleanModelAnswer = (answer: string | undefined): string => {
    if (!answer) return ''

    // Check if the answer looks like JSON
    if (
      (answer.trim().startsWith('{') && answer.trim().endsWith('}')) ||
      answer.includes('"modelAnswer"')
    ) {
      try {
        // Try to parse it as JSON
        const parsed = JSON.parse(answer)
        if (parsed.modelAnswer) {
          return parsed.modelAnswer
        }
      } catch {
        // If parsing fails, try to extract with regex
        const match = answer.match(/"modelAnswer"\s*:\s*"([\s\S]*?)"/)
        if (match && match[1]) {
          return match[1].replace(/\\"/g, '"')
        }
      }
    }

    return answer
  }

  // Function to handle adding a new option for multiple choice questions
  const handleAddOption = () => {
    const updatedOptions = [...(question.options || []), 'New option']
    onUpdate({ ...question, options: updatedOptions })
  }

  // Function to handle updating an option
  const handleUpdateOption = (index: number, value: string) => {
    const updatedOptions = [...(question.options || [])]
    updatedOptions[index] = value
    onUpdate({ ...question, options: updatedOptions })
  }

  // Function to handle removing an option
  const handleRemoveOption = (index: number) => {
    const updatedOptions = [...(question.options || [])]
    updatedOptions.splice(index, 1)
    onUpdate({ ...question, options: updatedOptions })
  }

  // Function to handle changing the question type
  const handleQuestionTypeChange = (type: string) => {
    setQuestionType(type)

    if (type === 'multiple-choice' && (!question.options || question.options.length === 0)) {
      // Initialize with some default options if switching to multiple choice
      onUpdate({ ...question, options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'] })
    } else if (type === 'essay' && question.options) {
      // Remove options if switching to essay
      const rest = { ...question }
      delete rest.options
      onUpdate(rest)
    }
  }

  // Function to update marking criteria as text
  const handleUpdateCriteria = (value: string) => {
    // Try to parse as JSON first
    try {
      const parsedCriteria = JSON.parse(value)
      onUpdate({ ...question, explanation: parsedCriteria })
    } catch {
      // If not valid JSON, treat as string
      onUpdate({ ...question, explanation: value })
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="w-full space-y-4">
                <div>
                  <Label htmlFor={`question-type-${index}`}>Question Type</Label>
                  <Select value={questionType} onValueChange={handleQuestionTypeChange}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select question type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="essay">Essay/Short Answer</SelectItem>
                      <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor={`question-${index}`}>Question {index + 1}</Label>
                  <p className="mb-1 text-xs text-gray-500">
                    Use **text** to make text bold. Use line breaks to separate sections.
                  </p>
                  <Textarea
                    id={`question-${index}`}
                    value={question.question}
                    onChange={(e) => onUpdate({ ...question, question: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {questionType === 'multiple-choice' && (
                  <div className="space-y-2">
                    <Label>Options</Label>
                    {question.options?.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center space-x-2">
                        <Input
                          value={option}
                          onChange={(e) => handleUpdateOption(optionIndex, e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveOption(optionIndex)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleAddOption} className="mt-2">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Option
                    </Button>
                  </div>
                )}

                <div>
                  <Label htmlFor={`answer-${index}`}>Model Answer</Label>
                  <p className="mb-1 text-xs text-gray-500">
                    Use **text** to make text bold. Use line breaks to separate sections.
                  </p>
                  <Textarea
                    id={`answer-${index}`}
                    value={cleanModelAnswer(question.correctAnswer)}
                    onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor={`explanation-${index}`}>Marking Criteria</Label>
                  <p className="mb-1 text-xs text-gray-500">
                    Describe how this question should be marked. Include point allocation and
                    criteria.
                  </p>
                  <Textarea
                    id={`explanation-${index}`}
                    value={
                      typeof question.explanation === 'string'
                        ? question.explanation
                        : JSON.stringify(question.explanation, null, 2)
                    }
                    onChange={(e) => handleUpdateCriteria(e.target.value)}
                    className="mt-1"
                    rows={6}
                  />
                </div>
              </div>
            ) : (
              <div>
                <h4 className="font-medium">Question {index + 1}</h4>
                <p className="mt-1">{formatTextWithBold(question.question)}</p>

                {question.options && question.options.length > 0 && (
                  <div className="mt-3">
                    <h5 className="font-medium">Options</h5>
                    <ul className="mt-1 list-disc pl-5">
                      {question.options.map((option, i) => (
                        <li key={i} className="mt-1">
                          {formatTextWithBold(option)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!previewMode && question.correctAnswer && (
                  <div className="mt-3">
                    <h5 className="font-medium">Model Answer</h5>
                    <p className="mt-1 whitespace-pre-line">
                      {formatTextWithBold(cleanModelAnswer(question.correctAnswer))}
                    </p>
                  </div>
                )}

                {!previewMode && question.explanation && (
                  <div className="mt-3">
                    <h5 className="font-medium">Marking Criteria</h5>
                    {typeof question.explanation === 'string' ? (
                      <p className="mt-1 whitespace-pre-line">
                        {formatTextWithBold(question.explanation)}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {question.explanation.criteria &&
                          question.explanation.criteria.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium">Criteria</h6>
                              <ul className="mt-1 list-disc pl-5">
                                {question.explanation.criteria.map(
                                  (
                                    criterion: {
                                      name: string
                                      weight: number
                                      description?: string
                                    },
                                    i: number,
                                  ) => (
                                    <li key={i} className="mt-1">
                                      <span className="font-medium">{criterion.name}</span> (
                                      {criterion.weight}%): {criterion.description}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          )}

                        {question.explanation.markAllocation &&
                          question.explanation.markAllocation.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium">Mark Allocation</h6>
                              <ul className="mt-1 list-disc pl-5">
                                {question.explanation.markAllocation.map(
                                  (
                                    item: {
                                      component: string
                                      marks: number
                                      description?: string
                                    },
                                    i: number,
                                  ) => (
                                    <li key={i} className="mt-1">
                                      <span className="font-medium">{item.component}</span> (
                                      {item.marks} marks): {item.description}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
