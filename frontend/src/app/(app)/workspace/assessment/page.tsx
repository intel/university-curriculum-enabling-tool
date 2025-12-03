// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import {
  Edit,
  Save,
  Plus,
  FileText,
  ArrowRight,
  Download,
  Clock,
  InfoIcon,
  X,
  CheckCircle,
  ClipboardCheck,
  Briefcase,
  GraduationCap,
  PenTool,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSourcesStore } from '@/lib/store/sources-store' // Import the sources store
import { useContextAvailability } from '@/lib/hooks/use-context-availability' // Import the hook for model detection
import AssessmentEditor from '@/components/assessment/assessment-editor'
import type { AssessmentQuestion, AssessmentIdea } from '@/lib/types/assessment-types'
import { getSelectContextDescription } from '@/lib/utils/context-messages'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useCourses } from '@/lib/hooks/use-courses'
import { usePersonaStore } from '@/lib/store/persona-store'
import type { Course } from '@/payload-types'

// Add these helper functions at the top of the file, after the imports
const calculateDeadline = (duration: string): string => {
  // Parse the duration string to extract the number and unit
  const durationMatch = duration.match(/(\d+)\s*(day|week|month|semester|year)s?/i)

  if (!durationMatch) return ''

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

  return `${ordinalSuffix(day)} ${month} ${year}, by 6:15 pm`
}

const getDefaultDuration = (assessmentType: string): string => {
  switch (assessmentType.toLowerCase()) {
    case 'quiz':
      return '30 minutes'
    case 'test':
      return '1 hour'
    case 'exam':
      return '2 hours' // Ensure exam is always 2 hours
    case 'assignment':
      return '1 week'
    case 'project':
      return '2 weeks'
    case 'discussion':
      return '45 minutes'
    default:
      return '1 hour'
  }
}

const getCurrentAcademicYear = (): string => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const month = now.getMonth() // 0-based (0 = January, 11 = December)

  // If we're in the second half of the year (July-December), academic year is currentYear/currentYear+1
  // Otherwise, it's currentYear-1/currentYear
  if (month >= 6) {
    // July or later
    return `${currentYear}/${currentYear + 1}`
  } else {
    return `${currentYear - 1}/${currentYear}`
  }
}

const formatSemester = (input: string): string => {
  // If input already contains "Semester", return as is
  if (input.toLowerCase().includes('semester')) {
    return input
  }

  // If input is just a number, prepend "Semester "
  if (/^\d+$/.test(input)) {
    return `Semester ${input}`
  }

  // Otherwise, return as is
  return input
}

export default function AssessmentPage() {
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const getPersonaLanguage = usePersonaStore((s) => s.getPersonaLanguage)
  const activePersona = usePersonaStore((s) => s.activePersona)

  const [assessmentType, setAssessmentType] = useState<string>('')
  const [difficultyLevel, setDifficultyLevel] = useState<string>('')
  const [generatedAssessment, setGeneratedAssessment] = useState<AssessmentIdea | null>(null)
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [numQuestions, setNumQuestions] = useState<number>(3)
  const [currentView, setCurrentView] = useState<'welcome' | 'config' | 'assessment'>('welcome')
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const selectedSources = useSourcesStore((state) => state.selectedSources)
  const { getActiveContextModelName, getContextTypeLabel, selectedCourseId } =
    useContextAvailability()
  const modelName = getActiveContextModelName()

  // Add a new state variable for form validation after the other state variables
  const [isFormValid, setIsFormValid] = useState<boolean>(false)

  // Add metadata state
  const [metadata, setMetadata] = useState<{
    courseCode: string
    courseName: string
    courseDescription: string
    examTitle: string
    semester?: string
    academicYear?: string
    deadline?: string
    groupSize?: number
    projectDuration?: string
    difficultyLevel: string
  }>({
    courseCode: '',
    courseName: '',
    courseDescription: '',
    examTitle: '',
    semester: '',
    academicYear: '',
    deadline: '',
    groupSize: undefined,
    projectDuration: '',
    difficultyLevel: '',
  })

  const [isDialogOpen, setIsDialogOpen] = useState(false) // State for the confirmation dialog
  const [previousCourseId, setPreviousCourseId] = useState<number | null>(null) // Track previous course ID

  // Function to reset all form fields to default values
  const resetFormFields = useCallback(() => {
    setAssessmentType('')
    setDifficultyLevel('')
    setNumQuestions(3)

    // Reset the current academic year
    const currentAcademicYear = getCurrentAcademicYear()

    // Reset form validation
    setIsFormValid(false)

    // Get current course info
    const selectedCourse = coursesData?.docs.find(
      (course: Course) => course.id === selectedCourseId,
    )
    if (selectedCourse) {
      const code = selectedCourse.code || ''
      const name = selectedCourse.name || ''
      const description = selectedCourse.description || ''
      const title = `${code} ${name} Assessment`

      // Completely replace metadata with fresh values
      setMetadata({
        courseCode: code,
        courseName: name,
        courseDescription: description,
        examTitle: title,
        semester: '',
        academicYear: currentAcademicYear,
        deadline: '',
        groupSize: undefined,
        projectDuration: '',
        difficultyLevel: '',
      })
    } else {
      // If no course is selected, use empty values
      setMetadata({
        courseCode: '',
        courseName: '',
        courseDescription: '',
        examTitle: '',
        difficultyLevel: '',
        academicYear: currentAcademicYear,
        semester: '',
        deadline: '',
        groupSize: undefined,
        projectDuration: '',
      })
    }

    console.log('Form fields have been reset')
  }, [coursesData?.docs, selectedCourseId])

  const handleCancelEdit = () => {
    setIsDialogOpen(true) // Open the confirmation dialog
  }

  const confirmExitEditMode = () => {
    setIsDialogOpen(false) // Close the dialog
    setIsEditing(false) // Exit edit mode
  }

  // Monitor course changes and reset to welcome view when course changes
  useEffect(() => {
    if (previousCourseId !== null && previousCourseId !== selectedCourseId) {
      console.log('Course changed from', previousCourseId, 'to', selectedCourseId)
      // Reset to welcome view
      setCurrentView('welcome')
      // Reset all form fields
      resetFormFields()
      // Clear any generated assessment
      setGeneratedAssessment(null)
      // Disable edit mode
      setIsEditing(false)

      // Find the selected course and update metadata with fresh values
      const selectedCourse = coursesData?.docs.find(
        (course: Course) => course.id === selectedCourseId,
      )
      if (selectedCourse) {
        const code = selectedCourse.code || ''
        const name = selectedCourse.name || ''
        const description = selectedCourse.description || ''
        const title = `${code} ${name} Assessment`

        // Completely replace metadata instead of updating it, but preserve difficulty level
        setMetadata((prev) => ({
          courseCode: code,
          courseName: name,
          courseDescription: description,
          examTitle: title,
          difficultyLevel: prev.difficultyLevel,
          semester: '',
          deadline: '',
          groupSize: undefined,
          projectDuration: '',
          academicYear: getCurrentAcademicYear(),
        }))
      }

      toast.info('Course changed. Assessment configuration has been reset.')
    }

    // Update previous course ID
    setPreviousCourseId(selectedCourseId)
  }, [selectedCourseId, coursesData?.docs, previousCourseId, resetFormFields])

  // Extract course information from context
  useEffect(() => {
    if (selectedCourseId) {
      const selectedCourse = coursesData?.docs.find(
        (course: Course) => course.id === selectedCourseId,
      )
      if (selectedCourse) {
        const code = selectedCourse.code || ''
        const name = selectedCourse.name || ''
        const description = selectedCourse.description || ''
        const title = `${code} ${name} Assessment`

        // Update metadata state - MERGE with existing values instead of replacing
        setMetadata((prev) => ({
          ...prev, // Keep all existing fields (semester, deadline, groupSize, etc.)
          courseCode: code,
          courseName: name,
          courseDescription: description,
          examTitle: title,
          academicYear: prev.academicYear || getCurrentAcademicYear(),
        }))
      }
    }
    // NOTE: difficultyLevel intentionally excluded from dependencies to prevent metadata wipe
  }, [selectedCourseId, coursesData?.docs])

  // Add a validation function after the handleSemesterChange function
  const validateForm = useCallback(() => {
    // Basic validation for all assessment types
    let valid = assessmentType !== '' && difficultyLevel !== ''

    // Additional validation for project type
    if (assessmentType === 'project') {
      valid =
        valid &&
        !!metadata.projectDuration &&
        !!metadata.semester &&
        !!metadata.deadline &&
        !!metadata.academicYear &&
        !!metadata.groupSize
    }

    console.log('Validation check:', {
      assessmentType,
      difficultyLevel,
      valid,
      isProject: assessmentType === 'project',
      projectFields: {
        projectDuration: metadata.projectDuration,
        semester: metadata.semester,
        deadline: metadata.deadline,
        academicYear: metadata.academicYear,
        groupSize: metadata.groupSize,
      },
    })

    setIsFormValid(valid)
    return valid
  }, [
    assessmentType,
    difficultyLevel,
    metadata.projectDuration,
    metadata.semester,
    metadata.deadline,
    metadata.academicYear,
    metadata.groupSize,
  ])

  // Automatically validate form when relevant fields change
  useEffect(() => {
    validateForm()
  }, [validateForm])

  // Update the handleAssessmentTypeChange function to ensure state is updated before view change
  const handleAssessmentTypeChange = (type: string) => {
    // Reset project-specific fields when changing from project
    if (assessmentType === 'project' && type !== 'project') {
      // Update metadata to remove project-specific fields
      setMetadata((prev) => {
        const { ...rest } = prev
        return rest
      })
    }

    // Set the assessment type first
    setAssessmentType(type)

    // Wait for state update before changing view
    setTimeout(() => {
      setCurrentView('config')
      validateForm()
    }, 50)
  }

  // Add a function to update metadata
  const handleUpdateMetadata = (field: string, value: string | number) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // Update the handleProjectDurationChange function to trigger validation
  const handleProjectDurationChange = (value: string) => {
    setMetadata((prev) => ({
      ...prev,
      projectDuration: value,
    }))

    // Auto-calculate deadline based on duration
    if (value) {
      const calculatedDeadline = calculateDeadline(value)
      if (calculatedDeadline) {
        setMetadata((prev) => ({
          ...prev,
          deadline: calculatedDeadline,
        }))
      }
    }

    // Validate after changing project duration
    setTimeout(() => validateForm(), 0)
  }

  // Update the handleSemesterChange function to trigger validation
  const handleSemesterChange = (value: string) => {
    const formattedSemester = formatSemester(value)
    setMetadata((prev) => ({
      ...prev,
      semester: formattedSemester,
    }))

    // Validate after changing semester
    setTimeout(() => validateForm(), 0)
  }

  // Add validation to the other input handlers
  // For academicYear
  const handleAcademicYearChange = (value: string) => {
    setMetadata((prev) => ({ ...prev, academicYear: value }))
    setTimeout(() => validateForm(), 0)
  }

  // For deadline
  const handleDeadlineChange = (value: string) => {
    setMetadata((prev) => ({ ...prev, deadline: value }))
    setTimeout(() => validateForm(), 0)
  }

  // For groupSize
  const handleGroupSizeChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    setMetadata((prev) => ({
      ...prev,
      groupSize: Number.isNaN(parsed) ? undefined : parsed,
    }))
    setTimeout(() => validateForm(), 0)
  }

  // For difficultyLevel
  const handleDifficultyLevelChange = (level: string) => {
    const newLevel = difficultyLevel === level ? '' : level
    setDifficultyLevel(newLevel)
    setMetadata((prev) => ({
      ...prev,
      difficultyLevel: newLevel,
    }))
    // Validate using the new value
    setTimeout(() => {
      validateFormWithLevel(newLevel)
    }, 0)
  }

  // Add this helper function
  const validateFormWithLevel = (level: string) => {
    let valid = assessmentType !== '' && level !== ''
    if (assessmentType === 'project') {
      valid =
        valid &&
        !!metadata.projectDuration &&
        !!metadata.semester &&
        !!metadata.deadline &&
        !!metadata.academicYear &&
        !!metadata.groupSize
    }
    setIsFormValid(valid)
  }

  // Update the generateAssessment function to ensure metadata is correctly passed
  const generateAssessment = async () => {
    if (!getActiveContextModelName()) {
      toast.error(
        `${getSelectContextDescription(getContextTypeLabel(), 'before start generate assessments.')}`,
      )
      return
    }

    setIsLoading(true)
    try {
      // Prepare course info for project assessments
      const courseInfo =
        assessmentType === 'project'
          ? {
              courseCode: metadata.courseCode,
              courseName: metadata.courseName,
              courseDescription: metadata.courseDescription,
              semester: metadata.semester,
              academicYear: metadata.academicYear,
              deadline: metadata.deadline,
              groupSize: metadata.groupSize,
              projectDuration: metadata.projectDuration,
              difficultyLevel,
              // Use a clean title without duplication
              examTitle: `${metadata.courseCode} ${metadata.courseName} Project Assessment`,
              duration: getDefaultDuration(assessmentType),
            }
          : {
              courseCode: metadata.courseCode,
              courseName: metadata.courseName,
              courseDescription: metadata.courseDescription,
              // Use a clean title without duplication
              examTitle: `${metadata.courseCode} ${metadata.courseName} ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`,
              duration: getDefaultDuration(assessmentType),
            }

      // Update metadata with project-specific info
      if (assessmentType === 'project') {
        setMetadata((prev) => ({
          ...prev,
          semester: metadata.semester,
          academicYear: metadata.academicYear,
          deadline: metadata.deadline,
          groupSize: metadata.groupSize,
          projectDuration: metadata.projectDuration,
          difficultyLevel,
        }))
      }

      console.log('Sending request with metadata:', courseInfo)

      const endpoint =
        assessmentType === 'project'
          ? '/api/assessment/project'
          : assessmentType === 'exam'
            ? '/api/assessment/exam'
            : '/api/assessment'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedModel: modelName,
          selectedSources, // Keep sending sources, but backend will handle if empty
          assessmentType,
          difficultyLevel,
          numQuestions,
          courseInfo,
          language: getPersonaLanguage(),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response from backend:', errorText)
        throw new Error(`Failed to generate assessment: ${errorText}`)
      }

      const data = await response.json()
      console.log('Received assessment data:', data)

      // Extract the assessment idea from the response
      let assessmentData: AssessmentIdea | null = null

      if (data.assessmentIdeas && data.assessmentIdeas.length > 0) {
        // Find the assessment that matches our type
        assessmentData =
          data.assessmentIdeas.find((idea: AssessmentIdea) =>
            idea.type.toLowerCase().includes(assessmentType.toLowerCase()),
          ) || data.assessmentIdeas[0]
      }

      if (!assessmentData) {
        throw new Error('No assessment data found in the response')
      }

      // Ensure exam duration is 2 hours
      if (assessmentType.toLowerCase() === 'exam' && assessmentData.duration !== '2 hours') {
        assessmentData.duration = '2 hours'
      }

      // Ensure duration matches default for the type
      const expectedDuration = getDefaultDuration(assessmentType)
      if (expectedDuration && assessmentData.duration !== expectedDuration) {
        assessmentData.duration = expectedDuration
      }

      setGeneratedAssessment(assessmentData)
      setCurrentView('assessment')
      toast.success(`Successfully generated the ${assessmentType} assessment.`)

      // Reset form fields after successful generation
      // resetFormFields()
    } catch (error) {
      console.error('Error generating assessment:', error)
      toast.error(
        `Failed to generate assessment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddQuestion = () => {
    if (!generatedAssessment) return

    const newQuestion: AssessmentQuestion = {
      question: 'New question',
      correctAnswer: 'Model answer for the new question',
      explanation: 'Explanation or grading criteria for this question',
    }

    setGeneratedAssessment({
      ...generatedAssessment,
      exampleQuestions: [...generatedAssessment.exampleQuestions, newQuestion],
    })
    setIsEditing(true)
  }

  const handleUpdateQuestion = (index: number, updatedQuestion: AssessmentQuestion) => {
    if (!generatedAssessment) return

    const updatedQuestions = [...generatedAssessment.exampleQuestions]
    updatedQuestions[index] = updatedQuestion

    setGeneratedAssessment({
      ...generatedAssessment,
      exampleQuestions: updatedQuestions,
    })
  }

  const handleDeleteQuestion = (index: number) => {
    if (!generatedAssessment) return

    const updatedQuestions = [...generatedAssessment.exampleQuestions]
    updatedQuestions.splice(index, 1)

    setGeneratedAssessment({
      ...generatedAssessment,
      exampleQuestions: updatedQuestions,
    })
  }

  const handleUpdateAssessmentDetails = (field: string, value: string) => {
    if (!generatedAssessment) return

    setGeneratedAssessment({
      ...generatedAssessment,
      [field]: value,
    })
  }

  // Update the downloadAsPDF function to use metadata
  const downloadAsPDF = async (format: 'student' | 'lecturer') => {
    if (!generatedAssessment) return

    try {
      // Use the metadata state instead of individual variables
      const response = await fetch('/api/assessment/download-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assessmentType,
          difficultyLevel,
          courseInfo: {
            assessment: generatedAssessment,
            format,
            metadata,
          },
          language: getPersonaLanguage(activePersona),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response from backend:', errorText)
        throw new Error('Failed to generate PDF')
      }

      // Extract the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch
        ? filenameMatch[1]
        : `${assessmentType.toLowerCase()}_assessment_${format}.pdf`

      // Create a blob from the PDF data
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      // Create a link and trigger download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()

      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Assessment PDF (${format} format) has been downloaded.`)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      toast.error('Failed to download PDF. Please try again.')
    }
  }

  // Update the downloadAsWord function to use metadata
  const downloadAsWord = async (format: 'student' | 'lecturer') => {
    if (!generatedAssessment) return

    try {
      // Use the metadata state instead of individual variables
      const response = await fetch('/api/assessment/download-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assessmentType,
          difficultyLevel,
          courseInfo: {
            assessment: generatedAssessment,
            format,
            metadata,
          },
          language: getPersonaLanguage(activePersona),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response from backend:', errorText)
        throw new Error('Failed to generate Word document')
      }

      // Extract the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch
        ? filenameMatch[1]
        : `${assessmentType.toLowerCase()}_assessment_${format}.docx`

      // Create a blob from the Word data
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      // Create a link and trigger download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()

      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Assessment Word document (${format} format) has been downloaded.`)
    } catch (error) {
      console.error('Error downloading Word document:', error)
      toast.error('Failed to download Word document. Please try again.')
    }
  }

  const saveAssessment = () => {
    if (!generatedAssessment) return

    // Toggle editing mode
    setIsEditing(!isEditing)

    if (isEditing) {
      // If we were in editing mode and now saving
      toast.success('Assessment saved successfully')

      // Here you could implement saving to a database or local storage
      // For now, we just keep it in state
      try {
        localStorage.setItem('savedAssessment', JSON.stringify(generatedAssessment))
        toast.success('Assessment saved successfully')
      } catch (error) {
        console.error('Failed to save assessment to localStorage:', error)
        toast.error(
          'Failed to save assessment. Please try again or check your browser storage settings.',
        )
        // Revert the editing state since save failed
        setIsEditing(true)
        return
      }
    }
  }

  // Standardized render functions to match FAQ page layout
  const renderWelcomeContent = () => (
    <Card className="w-full">
      <CardHeader className="flex flex-col items-center text-center">
        <CardTitle className="flex items-center gap-2">
          <FileText strokeWidth={1.6} className="h-5 w-5" />
          Welcome to Assessment Generator
        </CardTitle>
        <CardDescription>Create comprehensive assessments in minutes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Show help guide FIRST */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-medium">
            <InfoIcon className="h-4 w-4 text-primary" />
            How the Assessment Generator works:
          </h3>
          <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Select your assessment type</span> —
              Choose from project, exam, quiz or other options
            </li>
            <li>
              <span className="font-medium text-foreground">Configure settings</span> — Adjust
              difficulty, duration, and other parameters
            </li>
            <li>
              <span className="font-medium text-foreground">Generate and review</span> — Our AI
              creates a personalized assessment based on your course materials
            </li>
            <li>
              <span className="font-medium text-foreground">Download and use</span> — Export in your
              preferred format, ready for your students
            </li>
          </ol>
        </div>

        {/* THEN show assessment type selection with smaller cards */}
        <div>
          <h3 className="text-md mb-3 font-semibold">Select Assessment Type</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <div
              className="flex aspect-square cursor-pointer flex-col justify-between rounded-lg border-2 bg-gradient-to-br from-white to-slate-50 p-3 transition-all hover:border-primary hover:shadow-md"
              onClick={() => router.push('/workspace/quiz/generate')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  router.push('/workspace/quiz/generate')
                }
              }}
            >
              <h4 className="text-center font-semibold">Quiz</h4>
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center justify-center rounded-full bg-green-100 p-3">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Quick knowledge checks</p>
            </div>

            <div
              className="flex aspect-square cursor-pointer flex-col justify-between rounded-lg border-2 bg-gradient-to-br from-white to-slate-50 p-3 transition-all hover:border-primary hover:shadow-md"
              onClick={() => handleAssessmentTypeChange('exam')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleAssessmentTypeChange('exam')
                }
              }}
            >
              <h4 className="text-center font-semibold">Exam</h4>
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center justify-center rounded-full bg-green-100 p-3">
                  <ClipboardCheck className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Comprehensive evaluations</p>
            </div>

            <div
              className="flex aspect-square cursor-pointer flex-col justify-between rounded-lg border-2 bg-gradient-to-br from-white to-slate-50 p-3 transition-all hover:border-primary hover:shadow-md"
              onClick={() => handleAssessmentTypeChange('project')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleAssessmentTypeChange('project')
                }
              }}
            >
              <h4 className="text-center font-semibold">Project</h4>
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center justify-center rounded-full bg-green-100 p-3">
                  <Briefcase className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Collaborative tasks</p>
            </div>

            {/* For the disabled/coming soon cards, add role and tabIndex for consistency, but no click handler */}
            <div
              className="flex aspect-square flex-col justify-between rounded-lg border-2 bg-gradient-to-br from-white to-slate-50 p-3 opacity-60 transition-all"
              role="button"
              tabIndex={-1}
              aria-disabled="true"
            >
              <div className="text-center">
                <h4 className="font-semibold">Test</h4>
                <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                  Coming soon
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center justify-center rounded-full bg-slate-100 p-3">
                  <GraduationCap className="h-8 w-8 text-slate-400" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Comprehensive tests</p>
            </div>

            <div
              className="flex aspect-square flex-col justify-between rounded-lg border-2 bg-gradient-to-br from-white to-slate-50 p-3 opacity-60 transition-all"
              role="button"
              tabIndex={-1}
              aria-disabled="true"
            >
              <div className="text-center">
                <h4 className="font-semibold">Assignment</h4>
                <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                  Coming soon
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center justify-center rounded-full bg-slate-100 p-3">
                  <PenTool className="h-8 w-8 text-slate-400" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">Application tasks</p>
            </div>
          </div>
        </div>
      </CardContent>

      {!getActiveContextModelName() && (
        <div className="px-6 pb-6">
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-center gap-3 text-muted-foreground">
              <InfoIcon className="h-5 w-5" />
              <p className="text-sm">
                <span className="font-medium">Select a course</span> from the sidebar to enable
                assessment generation
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  )

  const renderConfigContent = () => (
    <Card className="w-full">
      <CardHeader className="flex flex-col">
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetFormFields()
              setCurrentView('welcome')
            }}
            className="flex items-center gap-1 text-muted-foreground"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back
          </Button>
        </div>
        <div className="text-center">
          <CardTitle>
            {assessmentType
              ? `Configure Your ${assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1)} Assessment`
              : 'Configure Your Assessment'}
          </CardTitle>
          <CardDescription>
            Adjust the parameters below to create the perfect assessment for your students.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Config content */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-md font-semibold">1. Selected Sources</h3>
            <div>
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
                      No sources selected. The model will generate content based on its knowledge.
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Adding sources is optional. If no sources are selected, the assessment will be
                generated based on the model&apos;s knowledge.
              </p>
            </div>
          </div>
        </div>

        {assessmentType === 'project' && (
          <>
            <h3 className="text-md font-semibold">2. Project-Specific Information</h3>
            <div className="space-y-4 rounded-md border bg-muted/50 p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Fields marked with * are required
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="projectDuration">Project Duration *</Label>
                  <Input
                    id="projectDuration"
                    value={metadata.projectDuration ?? ''}
                    onChange={(e) => handleProjectDurationChange(e.target.value)}
                    placeholder="e.g., 2 weeks"
                    className="mt-1"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enter duration like &quot;2 weeks&quot; or &quot;1 month&quot;
                  </p>
                </div>
                <div>
                  <Label htmlFor="semester">Semester *</Label>
                  <Input
                    id="semester"
                    value={metadata.semester ?? ''}
                    onChange={(e) => handleSemesterChange(e.target.value)}
                    placeholder="e.g., 1 (for Semester 1)"
                    className="mt-1"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Just enter the number, &quot;Semester&quot; will be added automatically
                  </p>
                </div>
                <div>
                  <Label htmlFor="deadline">Submission Deadline *</Label>
                  <Input
                    id="deadline"
                    value={metadata.deadline ?? ''}
                    onChange={(e) => handleDeadlineChange(e.target.value)}
                    placeholder="Auto-calculated from duration"
                    className="mt-1"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Auto-calculated but can be edited
                  </p>
                </div>
                <div>
                  <Label htmlFor="academicYear">Academic Year *</Label>
                  <Input
                    id="academicYear"
                    value={metadata.academicYear || ''}
                    onChange={(e) => handleAcademicYearChange(e.target.value)}
                    placeholder="Auto-set to current academic year"
                    className="mt-1"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Auto-set but can be edited</p>
                </div>
                <div>
                  <Label htmlFor="groupSize">Group Size *</Label>
                  <Input
                    id="groupSize"
                    type="number"
                    min="1"
                    max="10"
                    value={metadata.groupSize ?? ''}
                    onChange={(e) => handleGroupSizeChange(e.target.value)}
                    placeholder="e.g., 4"
                    className="mt-1"
                    required
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {assessmentType !== 'project' && (
          <div className="space-y-2">
            <h3 className="text-md font-semibold">2. Set Number of Questions</h3>
            <p className="text-sm text-muted-foreground">
              Choose how many questions you want to include:
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
                  max={6}
                  step={1}
                  value={[numQuestions]}
                  onValueChange={(value) => setNumQuestions(value[0])}
                  className="w-full cursor-pointer"
                  disabled={assessmentType === 'project'}
                />
                <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div
                    className="absolute -translate-x-1/2 transform rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                    style={{ left: `${((numQuestions - 1) / 9) * 100}%` }}
                  >
                    {numQuestions}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-md font-semibold">3. Select Difficulty</h3>
          <p className="text-sm text-muted-foreground">
            Choose the difficulty level that matches your needs:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                difficultyLevel === 'introductory' ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => handleDifficultyLevelChange('introductory')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleDifficultyLevelChange('introductory')
                }
              }}
            >
              <h4 className="text-sm font-semibold">Introductory</h4>
              <p className="text-sm text-muted-foreground">
                Basic concepts and straightforward questions
              </p>
            </div>
            <div
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                difficultyLevel === 'intermediate' ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => handleDifficultyLevelChange('intermediate')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleDifficultyLevelChange('intermediate')
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
                difficultyLevel === 'advanced' ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() => handleDifficultyLevelChange('advanced')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleDifficultyLevelChange('advanced')
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
  )

  const renderAssessmentContent = () => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{generatedAssessment?.type} Assessment</CardTitle>
          <CardDescription>
            {difficultyLevel.charAt(0).toUpperCase() + difficultyLevel.slice(1)} level •{' '}
            {generatedAssessment?.duration}
          </CardDescription>
        </div>
        <div className="flex space-x-2">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto">
        <AssessmentEditor
          assessment={generatedAssessment!}
          isEditing={isEditing}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onUpdateDetails={handleUpdateAssessmentDetails}
          metadata={metadata}
          onUpdateMetadata={handleUpdateMetadata}
        />

        {isEditing && assessmentType !== 'project' && (
          <Button variant="outline" className="mt-4" onClick={handleAddQuestion}>
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        )}
      </CardContent>
    </Card>
  )

  const renderBottomControls = () => {
    if (currentView === 'config') {
      return (
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto flex w-full flex-col items-center">
            {/* Tooltip above the button when valid */}
            {isFormValid && !isLoading && getActiveContextModelName() && (
              <div className="-mt-1 mb-2 flex items-center justify-center rounded-full bg-muted/50 px-3 py-0.5 text-xs text-muted-foreground">
                <InfoIcon className="mr-1 h-3 w-3" />
                <span>Est. time: 8-10 minutes</span>
              </div>
            )}

            {/* Error message now placed before the button */}
            {!isFormValid && !isLoading && (
              <p className="mb-1.5 text-xs text-red-500">
                {assessmentType === 'project'
                  ? 'Please fill in all required project fields marked with *'
                  : 'Please select difficulty level'}
              </p>
            )}

            <Button
              onClick={generateAssessment}
              disabled={isLoading || !isFormValid || !getActiveContextModelName()}
              className="group relative w-full overflow-hidden transition-all duration-300"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <span className="animate-pulse">Generating Assessment...</span>
                    <span className="mt-1 flex items-center text-xs opacity-90">
                      <Clock className="mr-1 inline h-3 w-3" />
                      Estimated time: 8-10 minutes
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex max-w-full flex-col items-center justify-center py-0.5">
                  <span className="truncate font-medium">Generate Assessment</span>
                </div>
              )}
              {isLoading && (
                <div className="absolute bottom-0 left-0 h-1 w-full bg-primary-foreground/30">
                  <div className="animate-progress-indeterminate h-full bg-primary-foreground"></div>
                </div>
              )}
            </Button>
          </div>
        </div>
      )
    } else if (currentView === 'assessment') {
      return (
        <div className="w-full">
          <div className="flex w-full justify-between">
            {!isEditing ? (
              <>
                {/* Back to Configuration Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const currentType = assessmentType
                    setCurrentView('config')
                    setTimeout(() => {
                      setAssessmentType(currentType)
                      validateForm()
                    }, 50)
                  }}
                >
                  <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                  Back to Configuration
                </Button>

                {/* Download Buttons */}
                <div className="flex space-x-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Download Word
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Select Format</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => downloadAsWord('student')}>
                        Student Format (Questions Only)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadAsWord('lecturer')}>
                        Lecturer Format (Complete)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Select Format</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => downloadAsPDF('student')}>
                        Student Format (Questions Only)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadAsPDF('lecturer')}>
                        Lecturer Format (Complete)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : (
              <div className="flex w-full justify-end space-x-2">
                {/* Save Button */}
                <Button variant="default" onClick={saveAssessment}>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>

                {/* Cancel Button */}
                <Button variant="destructive" onClick={handleCancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  // New unified return statement with consistent layout
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 lg:min-w-[750px] xl:min-w-[1000px]">
      {/* Scrollable Content Area */}
      <div className="hide-scrollbar flex-1 overflow-auto">
        <div className="w-full py-6">
          {currentView === 'welcome' && renderWelcomeContent()}
          {currentView === 'config' && renderConfigContent()}
          {currentView === 'assessment' && generatedAssessment && renderAssessmentContent()}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="sticky bottom-0 w-full border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {renderBottomControls()}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exit Edit Mode</DialogTitle>
            <DialogDescription>
              Are you sure you want to exit edit mode? Any unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmExitEditMode}>
              Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
