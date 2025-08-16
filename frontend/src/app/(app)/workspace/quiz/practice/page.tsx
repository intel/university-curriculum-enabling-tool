'use client'

import { useState, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, ArrowRight, XCircle, CheckCircle2, AlertCircle, FileCheck } from 'lucide-react'
import { useSourcesStore } from '@/lib/store/sources-store'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import { ContextRequirementMessage } from '@/components/context-requirement-message'

interface Question {
  question: string
  options?: string[]
  correctAnswer: string
  explanation: string
  type: 'mcq' | 'fillInTheBlank' | 'shortAnswer' | 'trueFalse'
  statement?: string
}

type View = 'welcome' | 'config' | 'quiz' | 'results'

export default function QuizGenerator() {
  const [quiz, setQuiz] = useState<Question[]>([])
  const [userAnswers, setUserAnswers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [numQuestions, setNumQuestions] = useState(3)
  const [difficulty, setDifficulty] = useState('medium')
  const [questionType, setQuestionType] = useState('mcq')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [, setShowResults] = useState(false)
  const [currentView, setCurrentView] = useState<View>('welcome')

  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { getActiveContextModelName, getContextTypeLabel } = useContextAvailability()
  const modelName = getActiveContextModelName()

  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false)

  // Add state for tracking quiz time
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null)
  const [quizEndTime, setQuizEndTime] = useState<number | null>(null)

  const handleQuit = () => {
    setIsQuitDialogOpen(false)
    resetQuiz()
  }

  // Modify the generateQuiz function to set the start time
  const generateQuiz = async () => {
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before start generate quizzes.')}`,
      )
      return
    }
    const selectedSourcesCount = selectedSources.filter((source) => source.selected).length

    if (selectedSourcesCount === 0 || selectedSourcesCount >= 2) {
      toast.error('Please select at least one source.')
      return
    }
    setIsLoading(true)
    setShowResults(false)
    setUserAnswers([])
    setCurrentQuestionIndex(0)
    setQuizStartTime(Date.now()) // Set the start time when quiz begins
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
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz')
      }

      if (data.questions && Array.isArray(data.questions)) {
        // Validate that all questions are of the selected type
        const invalidQuestions = data.questions.filter(
          (q: { type: string }) => q.type !== questionType,
        )
        if (invalidQuestions.length > 0) {
          throw new Error(
            `Received questions of incorrect type. Expected all questions to be "${questionType}"`,
          )
        }

        setQuiz(data.questions)
        setCurrentView('quiz')
        toast.success('Quiz generated successfully!')
      } else {
        console.error('Unexpected response format:', data)
        toast.error('Unexpected response format. Please try again.')
      }
    } catch (err) {
      console.error('Error generating quiz:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to generate quiz. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAnswerChange = (answer: string) => {
    const newAnswers = [...userAnswers]
    newAnswers[currentQuestionIndex] = answer
    setUserAnswers(newAnswers)
  }

  // Add a function to go to the previous question
  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    }
  }

  // Modify the nextQuestion function to set the end time when finishing the quiz
  const nextQuestion = () => {
    if (currentQuestionIndex < quiz.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      setQuizEndTime(Date.now()) // Set the end time when quiz is completed
      setShowResults(true)
      setCurrentView('results')
    }
  }

  // Add a function to format time duration
  const formatTimeTaken = (startTime: number, endTime: number) => {
    const durationMs = endTime - startTime
    const seconds = Math.floor(durationMs / 1000) % 60
    const minutes = Math.floor(durationMs / (1000 * 60))

    return `${minutes}m ${seconds}s`
  }

  const calculateScore = () => {
    return quiz.reduce((score, question, index) => {
      return (
        score + (question.correctAnswer.toLowerCase() === userAnswers[index]?.toLowerCase() ? 1 : 0)
      )
    }, 0)
  }

  const resetQuiz = () => {
    setQuiz([])
    setUserAnswers([])
    setCurrentQuestionIndex(0)
    setShowResults(false)
    setCurrentView('welcome')
  }

  // Modify the renderWelcomeView function to add top spacing
  const renderWelcomeView = () => (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-6 lg:min-w-[750px] xl:min-w-[1000px]">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <FileCheck strokeWidth={1.6} className="h-5 w-5" />
              Welcome to Quiz Generator
            </CardTitle>
            <CardDescription className="mt-2 text-lg">
              Generate interactive quizzes from your documents in seconds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 font-medium">How it works:</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                <li>
                  Upload or select your document using the add/select source selector on the sidebar
                </li>
                <li>
                  Configure your quiz settings including quiz type, difficulty, and number of
                  questions
                </li>
                <li>Generate your personalized quiz by clicking the start button</li>
                <li>Answer the questions and track your progress</li>
                <li>Review your score with detailed explanations</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button onClick={() => setCurrentView('config')} className="w-full md:max-w-[700px]">
          <span>Create Quiz</span>
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // Modify the renderConfigView function to add top spacing
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
              <CardTitle className="text-2xl">Create Your Ultimate Quiz Experience!</CardTitle>
              <CardDescription>
                Get ready to challenge yourself and expand your knowledge. Follow these simple steps
                to craft your perfect quiz:
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
                        <span className="text-sm text-muted-foreground">No sources selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-md font-semibold">1. Choose Your Quiz Type</h3>
              <p className="text-sm text-muted-foreground">
                Select the format that suits your learning style best:
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
                  <p className="text-sm text-muted-foreground">Test your knowledge with options</p>
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
                  <p className="text-sm text-muted-foreground">Express your understanding freely</p>
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
                    Evaluate statements based on your understanding
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
              <h3 className="text-md font-semibold">2. Set Your Challenge Level</h3>
              <p className="text-sm text-muted-foreground">
                Choose how many questions you want to tackle:
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
                      style={{ left: `${((numQuestions - 1) / 4) * 100}%` }}
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
                Choose the difficulty level that matches your expertise:
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
            <span>Start Now!</span>
          )}
        </Button>
      </div>
    </div>
  )

  const renderQuestionContent = (question: Question, index: number) => {
    switch (question.type) {
      case 'mcq':
        return (
          <RadioGroup
            onValueChange={handleAnswerChange}
            value={userAnswers[index]}
            className="grid gap-2"
          >
            {question.options?.map((option, optionIndex) => (
              <div
                key={optionIndex}
                className="flex items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <RadioGroupItem value={option} id={`q${index}-option${optionIndex}`} />
                <Label htmlFor={`q${index}-option${optionIndex}`} className="flex-1 cursor-pointer">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case 'fillInTheBlank':
        // const parts = question.question.split("[BLANK]")
        return (
          <div className="space-y-4">
            {/* <div className="flex flex-wrap items-center gap-2"> */}
            {/* {parts.map((part, partIndex) => (
                <Fragment key={`part-${partIndex}`}>
                  <span>{part}</span>
                  {partIndex < parts.length - 1 && ( */}
            <Input
              type="text"
              className="inline-block w-40"
              placeholder="Type answer"
              value={userAnswers[index] || ''}
              onChange={(e) => handleAnswerChange(e.target.value)}
            />
            {/* )}
                </Fragment>
              ))} */}
            {/* </div> */}
          </div>
        )

      case 'shortAnswer':
        return (
          <div className="space-y-2">
            <Textarea
              placeholder="Type your answer here..."
              className="min-h-[120px]"
              value={userAnswers[index] || ''}
              onChange={(e) => handleAnswerChange(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Provide a clear and concise answer. Include key concepts and explanations.
            </p>
          </div>
        )

      case 'trueFalse':
        return (
          <RadioGroup
            onValueChange={handleAnswerChange}
            value={userAnswers[index] ?? null}
            className="grid gap-2"
          >
            <div className="flex items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50">
              <RadioGroupItem value="true" id={`q${index}-option-true`} />
              <Label htmlFor={`q${index}-option-true`} className="flex-1 cursor-pointer">
                True
              </Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50">
              <RadioGroupItem value="false" id={`q${index}-option-false`} />
              <Label htmlFor={`q${index}-option-false`} className="flex-1 cursor-pointer">
                False
              </Label>
            </div>
          </RadioGroup>
        )

      default:
        return null
    }
  }

  // Modify the renderQuizView function to add top spacing and previous button
  const renderQuizView = () => (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-8">
      <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
        <Card className="mb-4 w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Question {currentQuestionIndex + 1} of {quiz.length}
              </CardTitle>
              <Dialog open={isQuitDialogOpen} onOpenChange={setIsQuitDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Quit Quiz?</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to quit? Your progress will be lost.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsQuitDialogOpen(false)}>
                      Continue Quiz
                    </Button>
                    <Button variant="destructive" onClick={handleQuit}>
                      Quit Quiz
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
                    {quiz[currentQuestionIndex].type === 'mcq'
                      ? 'Multiple Choice'
                      : quiz[currentQuestionIndex].type === 'fillInTheBlank'
                        ? 'Fill in the Blank'
                        : quiz[currentQuestionIndex].type === 'shortAnswer'
                          ? 'Short Answer'
                          : 'True/False'}
                  </span>
                </div>
                <p className="text-lg font-medium">
                  {quiz[currentQuestionIndex].type === 'fillInTheBlank'
                    ? quiz[currentQuestionIndex].question.split('[BLANK]')[0] +
                      '___________' +
                      quiz[currentQuestionIndex].question.split('[BLANK]')[1]
                    : quiz[currentQuestionIndex].type === 'trueFalse'
                      ? quiz[currentQuestionIndex].statement // Use the statement field for true/false questions
                      : quiz[currentQuestionIndex].question}
                </p>
              </div>
              {renderQuestionContent(quiz[currentQuestionIndex], currentQuestionIndex)}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex w-full justify-between">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={previousQuestion}
              disabled={currentQuestionIndex === 0}
            >
              <ArrowRight className="h-5 w-5 rotate-180" />
              Previous
            </Button>
          </div>
          <Button onClick={nextQuestion} disabled={!userAnswers[currentQuestionIndex]}>
            {currentQuestionIndex < quiz.length - 1 ? (
              <>
                <span>Next </span>
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <span>Finish Quiz</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )

  // Modify the renderResultsView function to add top spacing and enhanced score display
  const renderResultsView = () => {
    const score = calculateScore()
    const percentage = Math.round((score / quiz.length) * 100)
    const timeTaken =
      quizStartTime && quizEndTime ? formatTimeTaken(quizStartTime, quizEndTime) : 'N/A'

    return (
      <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 pt-8">
        <div className="hide-scrollbar flex-1 overflow-y-auto pb-16">
          <Card className="mb-4 w-full">
            <CardHeader>
              <CardTitle>Quiz Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="rounded-lg border bg-muted/30 p-6">
                  <div className="grid grid-cols-1 gap-4 text-center md:grid-cols-3">
                    <div className="rounded-lg bg-primary/10 p-4">
                      <h3 className="mb-1 text-sm font-medium text-muted-foreground">Score</h3>
                      <p className="text-2xl font-bold">
                        {score} / {quiz.length}
                      </p>
                    </div>

                    <div className="rounded-lg bg-primary/10 p-4">
                      <h3 className="mb-1 text-sm font-medium text-muted-foreground">Percentage</h3>
                      <p className="text-2xl font-bold">{percentage}%</p>
                    </div>

                    <div className="rounded-lg bg-primary/10 p-4">
                      <h3 className="mb-1 text-sm font-medium text-muted-foreground">Time Taken</h3>
                      <p className="text-2xl font-bold">{timeTaken}</p>
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-4 text-center">
                    <p className="text-lg font-medium">
                      {percentage >= 80
                        ? "Excellent! You've mastered this material."
                        : percentage >= 60
                          ? 'Good job! You have a solid understanding.'
                          : 'Keep practicing to improve your knowledge.'}
                    </p>
                  </div>
                </div>

                {quiz.map((q, index) => (
                  <div key={index} className="overflow-hidden rounded-lg border">
                    <div className="border-b bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
                              {q.type === 'mcq'
                                ? 'Multiple Choice'
                                : q.type === 'fillInTheBlank'
                                  ? 'Fill in the Blank'
                                  : q.type === 'shortAnswer'
                                    ? 'Short Answer'
                                    : 'True/False'}
                            </span>
                          </div>
                          <p className="text-lg">
                            {quiz[currentQuestionIndex].type === 'fillInTheBlank'
                              ? q.question.split('[BLANK]')[0] +
                                '___________' +
                                q.question.split('[BLANK]')[1]
                              : quiz[currentQuestionIndex].type === 'trueFalse'
                                ? q.statement || 'No statement provided' // Use the statement field for true/false questions
                                : q.question}
                          </p>
                        </div>
                        <span
                          className={
                            userAnswers[index]?.toLowerCase() === q.correctAnswer.toLowerCase()
                              ? 'whitespace-nowrap rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-600'
                              : 'whitespace-nowrap rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-600'
                          }
                        >
                          {userAnswers[index]?.toLowerCase() === q.correctAnswer.toLowerCase()
                            ? 'Correct'
                            : 'Incorrect'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      {q.type === 'mcq' && (
                        <div className="grid gap-2">
                          {q.options?.map((option, optionIndex) => (
                            <div
                              key={optionIndex}
                              className={`flex items-center gap-2 rounded-md p-3 ${
                                option === q.correctAnswer
                                  ? 'bg-green-500/10 text-green-600'
                                  : option === userAnswers[index]
                                    ? 'bg-red-500/10 text-red-600'
                                    : 'bg-muted'
                              }`}
                            >
                              {option === q.correctAnswer && (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                              {option === userAnswers[index] && option !== q.correctAnswer && (
                                <AlertCircle className="h-4 w-4 text-red-600" />
                              )}
                              {option}
                            </div>
                          ))}
                        </div>
                      )}

                      {(q.type === 'fillInTheBlank' ||
                        q.type === 'shortAnswer' ||
                        q.type === 'trueFalse') && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Your Answer:</p>
                            <div
                              className={`rounded-md p-3 ${
                                userAnswers[index]?.toLowerCase() === q.correctAnswer.toLowerCase()
                                  ? 'bg-green-500/10 text-green-600'
                                  : 'bg-red-500/10 text-red-600'
                              }`}
                            >
                              {userAnswers[index] || 'Not answered'}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Correct Answer:</p>
                            <div className="rounded-md bg-green-500/10 p-3 text-green-600">
                              {q.correctAnswer}
                            </div>
                          </div>

                          {q.type === 'shortAnswer' && (
                            <div className="space-y-1">
                              <p className="font-medium text-muted-foreground">Key Points:</p>
                              <ul className="list-inside list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                                {q.correctAnswer.split(';').map((point, i) => (
                                  <li key={i}>{point.trim()}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 border-t pt-4">
                        <p className="mb-2 font-medium text-muted-foreground">Explanation:</p>
                        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                          {q.explanation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 text-center backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button onClick={resetQuiz} className="w-full md:max-w-[700px]">
            Create New Quiz
          </Button>
        </div>
      </div>
    )
  }

  // Update the main return statement to ensure consistent layout across all views
  return (
    <ContextRequirementMessage
      height="h-[calc(100vh-200px)]"
      extendedMessage="before start generate Quizzes."
    >
      <div className="min-h-screen bg-background">
        {currentView === 'welcome' && renderWelcomeView()}
        {currentView === 'config' && renderConfigView()}
        {currentView === 'quiz' && renderQuizView()}
        {currentView === 'results' && renderResultsView()}
      </div>
    </ContextRequirementMessage>
  )
}
