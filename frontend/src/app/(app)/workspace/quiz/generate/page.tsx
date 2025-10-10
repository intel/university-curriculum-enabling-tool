// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Loader2,
  ArrowRight,
  XCircle,
  CheckCircle2,
  FileCheck,
  Edit,
  Trash2,
  Save,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import { ContextRequirementMessage } from '@/components/context-requirement-message'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Document, Paragraph, TextRun, Packer, AlignmentType } from 'docx'
import { useRouter } from 'next/navigation'
import { usePersonaStore } from '@/lib/store/persona-store'

interface Question {
  id: string
  question: string
  options?: string[]
  correctAnswer: string
  explanation: string
  type: 'mcq' | 'fillInTheBlank' | 'shortAnswer' | 'trueFalse'
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
}

interface Quiz {
  id: string
  title: string
  description: string
  questions: Question[]
  createdAt: string
  lastModified: string
  status: string
}

type View = 'welcome' | 'config' | 'edit' | 'saved'

export default function QuizGeneratorLecturer() {
  const router = useRouter()
  const [, setQuiz] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [numQuestions, setNumQuestions] = useState(5)
  const [difficulty, setDifficulty] = useState('medium')
  const [questionType, setQuestionType] = useState('mcq')
  const [currentView, setCurrentView] = useState<View>('welcome')
  const [quizTitle, setQuizTitle] = useState('')
  const [quizDescription, setQuizDescription] = useState('')
  const [, setSelectedTopics] = useState<string[]>([])
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null)
  const [savedQuizzes, setSavedQuizzes] = useState<Quiz[]>([])
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false)
  const [isDeleteQuizDialogOpen, setIsDeleteQuizDialogOpen] = useState(false)
  const [quizToDelete, setQuizToDelete] = useState<string | null>(null)
  const [searchKeywords, setSearchKeywords] = useState('')

  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { getActiveContextModelName, getContextTypeLabel } = useContextAvailability()
  const modelName = getActiveContextModelName()
  const { activePersona, getPersonaLanguage } = usePersonaStore()

  const generateQuiz = async () => {
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before generating quiz questions.')}`,
      )
      return
    }
    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length
    if (selectedSourcesCount === 0) {
      toast.error('Please select at least one source.')
      return
    }
    if (quizTitle.trim() === '') {
      toast.error('Please enter a quiz title.')
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch('/api/quiz/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources,
          numQuestions,
          difficulty,
          questionType,
          searchKeywords, // Add searchKeywords to the request body
          language: getPersonaLanguage(activePersona),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz')
      }

      if (data.questions && Array.isArray(data.questions)) {
        const invalidQuestions = data.questions.filter(
          (q: { type: string }) => q.type !== questionType,
        )
        if (invalidQuestions.length > 0) {
          throw new Error(
            `Received questions of incorrect type. Expected all questions to be "${questionType}"`,
          )
        }

        setQuiz(data.questions)
        setCurrentQuiz({
          id: `quiz-${Date.now()}`,
          title: quizTitle,
          description: quizDescription,
          questions: data.questions,
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          status: 'draft',
        })

        setCurrentView('edit')
        toast.success('Quiz generated successfully!')
      }
    } catch (err) {
      console.error('Error generating quiz:', err)
      toast.error('Failed to generate quiz. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const saveQuiz = () => {
    if (!currentQuiz) return

    const updatedQuiz = {
      ...currentQuiz,
      lastModified: new Date().toISOString(),
      status: 'published',
    }

    const existingIndex = savedQuizzes.findIndex((q) => q.id === updatedQuiz.id)

    if (existingIndex >= 0) {
      const updatedQuizzes = [...savedQuizzes]
      updatedQuizzes[existingIndex] = updatedQuiz
      setSavedQuizzes(updatedQuizzes)
    } else {
      setSavedQuizzes([...savedQuizzes, updatedQuiz])
    }

    toast.success('Quiz saved successfully!')

    setCurrentView('welcome')
  }

  // Delete a question
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [questionToDelete, setQuestionToDelete] = useState<number | null>(null)
  const [isLastQuestionDialogOpen, setIsLastQuestionDialogOpen] = useState(false)

  const confirmRemoveQuestion = (index: number) => {
    setQuestionToDelete(index)

    if (currentQuiz && currentQuiz.questions.length === 1) {
      setIsLastQuestionDialogOpen(true)
    } else {
      setIsRemoveDialogOpen(true)
    }
  }

  const removeQuestion = () => {
    if (!currentQuiz || questionToDelete === null) return

    const updatedQuestions = [...currentQuiz.questions]
    updatedQuestions.splice(questionToDelete, 1)

    setCurrentQuiz({
      ...currentQuiz,
      questions: updatedQuestions,
      lastModified: new Date().toISOString(),
    })

    setQuiz(updatedQuestions)
    setQuestionToDelete(null)
    setIsRemoveDialogOpen(false)
    setIsLastQuestionDialogOpen(false)

    toast.success('Question deleted successfully!')

    if (updatedQuestions.length === 0) {
      resetQuiz()
      setCurrentView('welcome')
      toast.info('Quiz discarded as no questions remained')
    }
  }

  // Reset form for creating a new quiz
  const resetQuiz = () => {
    setQuiz([])
    setQuizTitle('')
    setQuizDescription('')
    setSelectedTopics([])
    setNumQuestions(5)
    setQuestionType('mcq')
    setDifficulty('medium')
    setCurrentQuiz(null)
    setCurrentView('welcome')
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Handle quit dialog
  const handleQuit = () => {
    setIsQuitDialogOpen(false)
    resetQuiz()
  }

  // Save draft
  const saveDraft = () => {
    if (!currentQuiz) return

    const updatedQuiz = {
      ...currentQuiz,
      lastModified: new Date().toISOString(),
      status: 'draft',
    }

    // Check if updating existing quiz or creating a new one
    const existingIndex = savedQuizzes.findIndex((q) => q.id === updatedQuiz.id)

    if (existingIndex >= 0) {
      // Update existing quiz
      const updatedQuizzes = [...savedQuizzes]
      updatedQuizzes[existingIndex] = updatedQuiz
      setSavedQuizzes(updatedQuizzes)
    } else {
      // Add new quiz
      setSavedQuizzes([...savedQuizzes, updatedQuiz])
    }

    toast.success('Quiz draft saved successfully!')
    setCurrentView('welcome')
  }

  const confirmDeleteQuiz = (quizId: string) => {
    setQuizToDelete(quizId)
    setIsDeleteQuizDialogOpen(true)
  }

  // Delete quiz
  const deleteQuiz = (quizId: string) => {
    setSavedQuizzes(savedQuizzes.filter((quiz) => quiz.id !== quizId))
    toast.success('Quiz deleted successfully!')
    setIsDeleteQuizDialogOpen(false)
  }

  // Export Quiz to Word file
  const exportQuizAsWordDoc = () => {
    if (!currentQuiz) return

    // Determine language from persona
    const lang = getPersonaLanguage(activePersona)
    const labels =
      lang === 'id'
        ? {
            studentName: 'Nama Mahasiswa:',
            date: 'Tanggal:',
            quizPrefix: 'Kuis: ',
            description: 'Deskripsi: ',
            instructionLabel: 'Instruksi: ',
            instructionText:
              'Kuis ini terdiri dari beberapa pertanyaan. Bacalah setiap pertanyaan dengan cermat dan berikan jawaban yang benar.',
            trueLabel: 'Benar',
            falseLabel: 'Salah',
          }
        : {
            studentName: 'Student Name:',
            date: 'Date:',
            quizPrefix: 'Quiz: ',
            description: 'Description: ',
            instructionLabel: 'Instruction: ',
            instructionText:
              'This quiz contains multiple questions. Read each question carefully and provide the correct answers.',
            trueLabel: 'True',
            falseLabel: 'False',
          }

    // Create document content
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Student info
            new Paragraph({
              children: [
                new TextRun(labels.studentName),
                new TextRun('\t'.repeat(10)),
                new TextRun(labels.date),
              ],
              spacing: { after: 100 },
            }),
            // Quiz title
            new Paragraph({
              children: [
                new TextRun({
                  text: `${labels.quizPrefix}${currentQuiz.title}`,
                  size: 24,
                  bold: true,
                }),
              ],
              spacing: { after: 300 },
              alignment: AlignmentType.CENTER,
            }),

            // Quiz description (if exists)
            ...(currentQuiz.description
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({ text: labels.description }),
                      new TextRun({ text: currentQuiz.description }),
                    ],
                    spacing: { after: 100 },
                  }),
                ]
              : []),

            // Quiz instructions
            new Paragraph({
              children: [
                new TextRun({ text: labels.instructionLabel, bold: true }),
                new TextRun({ text: ` ${labels.instructionText} ` }),
              ],
              spacing: { after: 300 },
            }),

            // Questions
            ...currentQuiz.questions.flatMap((question, index) => [
              new Paragraph({
                text: `${index + 1}. ${question.question}`,
                spacing: { after: 100 },
              }),
              // For multiple choice questions
              ...(question.type === 'mcq' && question.options
                ? question.options.map(
                    (option, idx) =>
                      new Paragraph({
                        text: `${String.fromCharCode(65 + idx)}.  ${option}`, // A, B, C, D.
                        indent: { left: 200 },
                        spacing: { after: 50 },
                      }),
                  )
                : []),

              // For True/False questions
              ...(question.type === 'trueFalse'
                ? [labels.trueLabel, labels.falseLabel].map(
                    (option, idx) =>
                      new Paragraph({
                        text: `${String.fromCharCode(65 + idx)}.  ${option}`, // A. True, B. False
                        indent: { left: 200 },
                        spacing: { after: 50 },
                      }),
                  )
                : []),

              // For short answer questions
              ...(question.type === 'shortAnswer'
                ? [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: 'Answer: ',
                        }),
                      ],
                      spacing: { before: 100, after: 300 },
                    }),
                    new Paragraph({
                      border: {
                        bottom: { size: 10, color: 'CCCCCC', space: 1, style: 'single' }, // First line
                      },
                      spacing: { after: 500 },
                    }),
                    new Paragraph({
                      border: {
                        top: { size: 10, color: 'CCCCCC', space: 1, style: 'single' }, // Second line (use top border)
                      },
                    }),
                    new Paragraph({
                      border: {
                        bottom: { size: 10, color: 'CCCCCC', space: 1, style: 'single' }, // Third line
                      },
                      spacing: { after: 100 },
                    }),
                  ]
                : []),

              // Space between questions
              new Paragraph({
                text: '',
                spacing: { after: 100 },
              }),
            ]),
          ],
        },
      ],
    })

    // Generate the word file
    Packer.toBlob(doc).then((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentQuiz.title.replace(/\s+/g, '-').toLowerCase()}.docx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Quiz successfully exported as Word document.')
    })
  }

  // Render welcome view
  const renderWelcomeView = () => (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-6 w-full">
          <CardHeader>
            <div className="mb-2 flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/workspace/assessment')}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back
              </Button>
            </div>
            <div className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <FileCheck strokeWidth={1.6} className="h-5 w-5" />
                Welcome to Quiz Generator for Lecturers
              </CardTitle>
              <CardDescription>
                Generate quizzes and exams with answers from your lecture materials
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 font-medium">How it works:</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                <li>
                  Upload or select your lecture materials using the add/select source selector on
                  the sidebar
                </li>
                <li>
                  Configure your quiz settings including quiz type, difficulty, and number of
                  questions
                </li>
                <li>Generate your quiz by clicking the start button</li>
                <li>Review and edit the generated questions and answers</li>
                <li>Save or export your quiz for distribution to students</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {savedQuizzes.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your Quiz History</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {savedQuizzes
                .sort(
                  (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
                )
                .slice(0, 4)
                .map((quiz) => (
                  <Card key={quiz.id} className="w-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <CardTitle className="text-lg">{quiz.title}</CardTitle>
                          {quiz.status === 'draft' && (
                            <Badge
                              variant="outline"
                              className="mt-1 w-fit border-amber-500 text-amber-500"
                            >
                              Draft
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {quiz.questions.length}{' '}
                          {quiz.questions.length === 1 ? 'question' : 'questions'}
                        </Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {quiz.description || 'No description provided.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {Array.from(new Set(quiz.questions.map((q) => q.type))).map((type) => (
                          <Badge key={type} variant="secondary">
                            {type === 'mcq'
                              ? 'Multiple Choice'
                              : type === 'trueFalse'
                                ? 'True/False'
                                : type === 'shortAnswer'
                                  ? 'Short Answer'
                                  : 'Fill in Blank'}
                          </Badge>
                        ))}
                      </div>
                      <div className="mb-4 text-xs text-muted-foreground">
                        <p>Created: {formatDate(quiz.createdAt)}</p>
                        <p>Last modified: {formatDate(quiz.lastModified)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => confirmDeleteQuiz(quiz.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentQuiz(quiz)
                            setQuiz(quiz.questions)
                            setQuizTitle(quiz.title)
                            setQuizDescription(quiz.description)
                            setCurrentView('edit')
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentQuiz(quiz)
                            exportQuizAsWordDoc()
                          }}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Export Word
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>

            {savedQuizzes.length > 4 && (
              <div className="text-center">
                <Button variant="link" onClick={() => setCurrentView('saved')}>
                  View all {savedQuizzes.length} quizzes
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Card className="w-full p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-medium">No quizzes created yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Get started by creating your first quiz from your lecture materials.
            </p>
          </Card>
        )}
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button onClick={() => setCurrentView('config')} className="w-full md:max-w-[700px]">
          <span>Create Quiz</span>
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <Dialog open={isDeleteQuizDialogOpen} onOpenChange={setIsDeleteQuizDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quiz</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this quiz? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="destructive" onClick={() => quizToDelete && deleteQuiz(quizToDelete)}>
              Delete Quiz
            </Button>
            <Button variant="outline" onClick={() => setIsDeleteQuizDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  // Render config view
  const renderConfigView = () => (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar h-[calc(100vh-8rem)] overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              {/* <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView("welcome")}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back
              </Button> */}
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl">Create Your Quiz</CardTitle>
              <CardDescription>
                Configure your quiz settings to generate questions from your lecture materials
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-md font-medium">Quiz Title</Label>
                <Input
                  placeholder="Enter quiz title"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-md font-medium">Description (Optional)</Label>
                <Textarea
                  placeholder="Enter a description for your quiz"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-md font-medium">Selected Sources</Label>
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
                        <span className="text-sm text-muted-foreground">No sources selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-md font-medium">
                  Extract Specific Topics & Keywords (Optional)
                </Label>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    placeholder="Enter topics or keywords (e.g. 'neural networks, backpropagation, deep learning')"
                    value={searchKeywords}
                    onChange={(e) => setSearchKeywords(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add important terms to focus your quiz on specific topics.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md font-semibold">1. Choose Your Quiz Type</h3>
              <p className="text-sm text-muted-foreground">
                Select the format for your quiz questions:
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${questionType === 'mcq' ? 'border-primary bg-primary/5' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setQuestionType('mcq')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setQuestionType('mcq')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">Multiple Choice</h4>
                  <p className="text-sm text-muted-foreground">Questions with multiple options</p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${questionType === 'shortAnswer' ? 'border-primary bg-primary/5' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setQuestionType('shortAnswer')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setQuestionType('shortAnswer')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">Short Answer</h4>
                  <p className="text-sm text-muted-foreground">Free-form text responses</p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    questionType === 'trueFalse' ? 'border-primary bg-primary/5' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setQuestionType('trueFalse')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setQuestionType('trueFalse')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">True/False</h4>
                  <p className="text-sm text-muted-foreground">
                    Evaluate statements as true or false
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-4 opacity-50 transition-colors ${questionType === 'fillInTheBlank' ? 'border-primary bg-primary/5' : ''}`}
                  // onClick={() => setQuestionType("fillInTheBlank")}
                >
                  <h4 className="text-sm font-semibold">Fill in the Blank (Coming Soon)</h4>
                  <p className="text-sm text-muted-foreground">
                    Complete sentences with your knowledge
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-4 opacity-50 transition-colors ${questionType === 'matching' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <h4 className="text-sm font-semibold">Matching (Coming Soon)</h4>
                  <p className="text-sm text-muted-foreground">
                    Connect related concepts and terms
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-4 opacity-50 transition-colors ${questionType === 'mixed' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <h4 className="text-sm font-semibold">Mixed Quiz (Coming Soon)</h4>
                  <p className="text-sm text-muted-foreground">
                    Challenge yourself with a variety of question types
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md font-semibold">2. Set Number of Questions</h3>
              <p className="text-sm text-muted-foreground">
                Choose how many questions to generate:
              </p>
              <div className="relative space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    Number of Questions: <span className="font-medium">{numQuestions}</span>
                  </span>
                </div>
                <div className="group relative">
                  <Slider
                    id="num-questions"
                    min={1}
                    max={5}
                    step={1}
                    value={[numQuestions]}
                    onValueChange={(value) => setNumQuestions(value[0])}
                    className="w-full cursor-pointer"
                  />
                  <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div
                      className="absolute -translate-x-1/2 transform rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                      style={{ left: `${((numQuestions - 1) / 19) * 100}%` }}
                    >
                      {numQuestions}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md font-semibold">3. Select Difficulty</h3>
              <p className="text-sm text-muted-foreground">
                Choose the difficulty level for your quiz:
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    difficulty === 'easy' ? 'border-primary bg-primary/5' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDifficulty('easy')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDifficulty('easy')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">Easy</h4>
                  <p className="text-sm text-muted-foreground">
                    Basic concepts and straightforward questions
                  </p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    difficulty === 'medium' ? 'border-primary bg-primary/5' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDifficulty('medium')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDifficulty('medium')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">Intermediate</h4>
                  <p className="text-sm text-muted-foreground">
                    More complex topics and challenging questions
                  </p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    difficulty === 'hard' ? 'border-primary bg-primary/5' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDifficulty('hard')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setDifficulty('hard')
                    }
                  }}
                >
                  <h4 className="text-sm font-semibold">Advanced</h4>
                  <p className="text-sm text-muted-foreground">
                    In-depth knowledge and expert-level questions
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button onClick={generateQuiz} disabled={isLoading} className="w-full md:max-w-[700px]">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Quiz...
            </>
          ) : (
            <span>Generate Quiz</span>
          )}
        </Button>
      </div>
    </div>
  )

  const renderQuestionContent = (question: Question) => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="font-medium">{question.question}</p>

          {question.type === 'mcq' && (
            <div className="mt-4 space-y-2">
              {question.options?.map((option, optIndex) => (
                <div key={optIndex} className="flex items-center space-x-2 rounded-md border p-3">
                  <div className="h-4 w-4 rounded-full border" />
                  <span>{option}</span>
                </div>
              ))}
            </div>
          )}

          {question.type === 'trueFalse' && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center space-x-2 rounded-md border p-3">
                <div className="h-4 w-4 rounded-full border" />
                <span>True</span>
              </div>
              <div className="flex items-center space-x-2 rounded-md border p-3">
                <div className="h-4 w-4 rounded-full border" />
                <span>False</span>
              </div>
            </div>
          )}

          {question.type === 'shortAnswer' && (
            <div className="mt-4">
              <Textarea
                placeholder="Student answer will go here..."
                disabled
                className="bg-muted/50"
              />
            </div>
          )}

          {question.type === 'fillInTheBlank' && (
            <div className="mt-4">
              <Input
                placeholder="Student answer will go here..."
                disabled
                className="w-40 bg-muted/50"
              />
            </div>
          )}
        </div>

        <div className="mt-4 border-t pt-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="answer" className="border-b-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>View Answer & Explanation</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="overflow-hidden pt-2">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium">Correct Answer:</h4>
                    <p
                      className="mt-1 whitespace-pre-wrap break-words rounded-md bg-green-500/10 p-2 text-green-600"
                      style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    >
                      {question.correctAnswer}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Explanation:</h4>
                    <p
                      className="mt-1 whitespace-pre-wrap break-words text-muted-foreground"
                      style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    >
                      {question.explanation}
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    )
  }

  // Render edit view
  const renderEditView = () => {
    if (!currentQuiz) return null

    return (
      <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Quiz Builder</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsQuitDialogOpen(true)}
            className="flex items-center gap-1 text-muted-foreground"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
          <Card className="mb-4 w-full">
            <CardHeader className="relative pb-2">
              <Button
                variant="outline"
                onClick={exportQuizAsWordDoc}
                className="absolute right-2 top-2 mr-2 mt-2"
              >
                <FileText className="mr-2 h-4 w-4" />
                Export Word
              </Button>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Input
                    value={currentQuiz.title}
                    onChange={(e) => setCurrentQuiz({ ...currentQuiz, title: e.target.value })}
                    className="h-auto border-0 bg-transparent px-0 !text-lg font-bold focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="Quiz Title"
                  />
                </div>
              </div>
              <div className="mt-1">
                <Textarea
                  value={currentQuiz.description}
                  onChange={(e) => setCurrentQuiz({ ...currentQuiz, description: e.target.value })}
                  className="resize-none border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Add a description..."
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="outline">
                  {currentQuiz.questions.length}{' '}
                  {currentQuiz.questions.length === 1 ? 'question' : 'questions'}
                </Badge>
                {Array.from(new Set(currentQuiz.questions.map((q) => q.difficulty))).map(
                  (difficulty) => (
                    <Badge key={difficulty} variant="secondary">
                      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                    </Badge>
                  ),
                )}
                {Array.from(new Set(currentQuiz.questions.map((q) => q.type))).map((type) => (
                  <Badge key={type} variant="secondary">
                    {type === 'mcq'
                      ? 'Multiple Choice'
                      : type === 'trueFalse'
                        ? 'True/False'
                        : type === 'shortAnswer'
                          ? 'Short Answer'
                          : 'Fill in Blank'}
                  </Badge>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-sm font-medium">Instructions</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  This quiz contains {currentQuiz.questions.length} questions. Read each question
                  carefully and provide your answer.
                </p>
              </div>
            </CardContent>
          </Card>

          {currentQuiz.questions.length === 0 ? (
            <Alert className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No questions in this quiz yet. Click &quot;Add Question&quot; to create your first
                question.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {currentQuiz.questions.map((question, index) => (
                <Card
                  key={question.id ?? index}
                  className="w-full min-w-[320px] max-w-full transition-all duration-300"
                  style={{ boxSizing: 'border-box' }}
                >
                  <CardHeader className="relative pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                      <div className="flex items-center gap-2">
                        {/* <Badge variant="secondary">{question.topic}</Badge> */}
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    setEditingQuestionIndex(
                                      editingQuestionIndex === index ? null : index,
                                    )
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit question</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => confirmRemoveQuestion(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove Question</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {editingQuestionIndex === index ? (
                      <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                        <div className="space-y-2">
                          <Label htmlFor={`question-${index}`}>Question</Label>
                          <Textarea
                            id={`question-${index}`}
                            value={question.question}
                            onChange={(e) => {
                              const updatedQuestions = [...currentQuiz.questions]
                              updatedQuestions[index] = { ...question, question: e.target.value }
                              setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions })
                            }}
                          />
                        </div>

                        {(question.type === 'mcq' || question.type === 'trueFalse') && (
                          <div className="space-y-2">
                            <Label>Options</Label>
                            {question.options?.map((option, optIndex) => (
                              <div key={optIndex} className="flex items-center gap-2">
                                <Input
                                  value={option}
                                  onChange={(e) => {
                                    const updatedQuestions = [...currentQuiz.questions]
                                    const updatedOptions = [...(question.options || [])]
                                    updatedOptions[optIndex] = e.target.value
                                    updatedQuestions[index] = {
                                      ...question,
                                      options: updatedOptions,
                                    }
                                    setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions })
                                  }}
                                />
                                <div className="flex h-10 items-center">
                                  <Checkbox
                                    checked={question.correctAnswer === option}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        const updatedQuestions = [...currentQuiz.questions]
                                        updatedQuestions[index] = {
                                          ...question,
                                          correctAnswer: option,
                                        }
                                        setCurrentQuiz({
                                          ...currentQuiz,
                                          questions: updatedQuestions,
                                        })
                                      }
                                    }}
                                  />
                                  <Label className="ml-2">Correct</Label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {(question.type === 'shortAnswer' ||
                          question.type === 'fillInTheBlank') && (
                          <div className="space-y-2">
                            <Label htmlFor={`answer-${index}`}>Correct Answer</Label>
                            <Input
                              id={`answer-${index}`}
                              value={question.correctAnswer}
                              onChange={(e) => {
                                const updatedQuestions = [...currentQuiz.questions]
                                updatedQuestions[index] = {
                                  ...question,
                                  correctAnswer: e.target.value,
                                }
                                setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions })
                              }}
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor={`explanation-${index}`}>Explanation</Label>
                          <Textarea
                            id={`explanation-${index}`}
                            value={question.explanation}
                            onChange={(e) => {
                              const updatedQuestions = [...currentQuiz.questions]
                              updatedQuestions[index] = { ...question, explanation: e.target.value }
                              setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions })
                            }}
                          />
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setEditingQuestionIndex(null)}>
                            Done
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0">{renderQuestionContent(question)}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex w-full gap-3 md:max-w-[700px]">
            <Button variant="outline" onClick={() => saveDraft()} className="flex-1">
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button onClick={saveQuiz} className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Publish Quiz
            </Button>
          </div>
        </div>

        <Dialog open={isQuitDialogOpen} onOpenChange={setIsQuitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Exit Quiz Builder</DialogTitle>
              <DialogDescription>
                Would you like to save your progress before leaving?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setIsQuitDialogOpen(false)}
                className="sm:order-1"
              >
                Continue Editing
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  saveDraft()
                  setIsQuitDialogOpen(false)
                }}
                className="sm:order-2"
              >
                Save Draft & Exit
              </Button>
              <Button variant="destructive" onClick={handleQuit} className="sm:order-3">
                Discard Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Question</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this question? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button variant="destructive" onClick={removeQuestion}>
                Remove Question
              </Button>
              <Button variant="outline" onClick={() => setIsRemoveDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isLastQuestionDialogOpen} onOpenChange={setIsLastQuestionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Last Question</DialogTitle>
              <DialogDescription>
                This is the last question in your quiz. Removing it will discard the entire quiz.
                Are you sure you want to proceed?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button variant="destructive" onClick={removeQuestion}>
                Delete and Discard Quiz
              </Button>
              <Button variant="outline" onClick={() => setIsLastQuestionDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before generating quizzes."
    >
      <div className="min-h-screen bg-background">
        {currentView === 'welcome' && renderWelcomeView()}
        {currentView === 'config' && renderConfigView()}
        {currentView === 'edit' && renderEditView()}
      </div>
    </ContextRequirementMessage>
  )
}
