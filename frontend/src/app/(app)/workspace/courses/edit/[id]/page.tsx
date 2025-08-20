// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useModelStore } from '@/lib/store/model-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import { OllamaModel } from '@/lib/types/ollama-model'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useCourses, useUpdateCourse } from '@/lib/hooks/use-courses'
import { Course } from '@/payload-types'
import { isCourseDuplicate, isCourseExactDuplicate } from '@/lib/course-duplicate-utils'

// Update the course creation form for faculty persona
const courseFormSchema = z.object({
  name: z.string().min(3, {
    message: 'Course name must be at least 3 characters.',
  }),
  code: z.string().min(2, {
    message: 'Course code must be at least 2 characters.',
  }),
  facultyName: z.string().min(3, {
    message: 'Faculty name must be at least 3 characters.',
  }),
  version: z.string().min(1, {
    message: 'Version is required.',
  }),
  description: z.string().optional(),
  model: z.object({
    name: z.string(),
    modified_at: z.string(),
    size: z.number(),
    digest: z.string(),
    details: z.object({
      format: z.string().min(1, { message: 'Format is required.' }),
      family: z.string().min(1, { message: 'Family is required.' }),
      parameter_size: z.string().min(1, { message: 'Parameter size is required.' }),
      quantization_level: z.string().min(1, { message: 'Quantization level is required.' }),
    }),
  }),
  tag: z.string().optional(), // single tag for version customization
})

type CourseFormValues = z.infer<typeof courseFormSchema>

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { data: coursesData, isLoading: isCourseLoading } = useCourses()
  const { mutateAsync: updateCourse, isPending } = useUpdateCourse()
  const [courses, setCourses] = useState<Course[]>([])
  const unwrappedParams = React.use(params)
  const id = unwrappedParams.id
  const { models } = useModelStore()
  const [modelSearchTerm, setModelSearchTerm] = useState('')

  // Convert existing models to OllamaModel format - memoized to prevent re-computation
  const ollamaModels: OllamaModel[] = useMemo(
    () =>
      models.map((model) => ({
        name: model.name,
        modified_at: new Date().toISOString(), // Default value
        size: model.size,
        digest: model.digest, // Using id as digest
        details: {
          format: model.details.format,
          family: model.details.family,
          parameter_size: model.details.parameter_size,
          quantization_level: model.details.quantization_level, // Default value
        },
      })),
    [models],
  )

  // Find the course to edit
  const course = courses.find((c: Course) => c.id === Number(id))

  // Find the current model - safe version that handles undefined course
  const currentModel = useMemo(() => {
    const defaultModel = {
      name: 'default',
      modified_at: new Date().toISOString(),
      size: 0,
      digest: 'default',
      details: {
        format: 'unknown',
        family: 'unknown',
        parameter_size: '0B',
        quantization_level: 'unknown',
      },
    }

    if (!course) {
      return ollamaModels.length > 0 ? ollamaModels[0] : defaultModel
    }

    const foundModel = ollamaModels.find((m) => {
      const model = course.model
      return model && typeof model === 'object' && 'digest' in model && m.digest === model.digest
    })

    return foundModel || (ollamaModels.length > 0 ? ollamaModels[0] : defaultModel)
  }, [course, ollamaModels])

  // Initialize static default values - completely independent of any dynamic data
  const staticDefaultValues: Partial<CourseFormValues> = {
    name: '',
    code: '',
    facultyName: '',
    version: '2025.01.0',
    description: '',
    model: {
      name: 'default',
      modified_at: new Date().toISOString(),
      size: 0,
      digest: 'default',
      details: {
        format: 'unknown',
        family: 'unknown',
        parameter_size: '0B',
        quantization_level: 'unknown',
      },
    },
    tag: 'default',
  }

  // Add state for course code validation
  const [, setCodeExists] = useState(false)
  const [versionExists, setVersionExists] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [initialValues, setInitialValues] = useState(staticDefaultValues)

  // Add state for tag warning message
  const [tagWarning, setTagWarning] = useState('')

  // Update course state when courses data changes
  useEffect(() => {
    if (coursesData) {
      setCourses(coursesData.docs || [])
    }
  }, [coursesData])

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    mode: 'onBlur', // Validate on blur (not on every change)
    reValidateMode: 'onSubmit', // Only re-validate on submit, not on every change
    defaultValues: staticDefaultValues,
  })

  // Reset form values when course is loaded
  useEffect(() => {
    if (course) {
      const newValues = {
        name: course.name || '',
        code: course.code || '',
        facultyName: course.facultyName || '',
        version: course.version || '2025.01.0',
        description: course.description || '',
        model: currentModel,
        tag: course?.tag || 'default',
      }
      form.reset(newValues)
      setInitialValues(newValues)
      setBackendError(null)
    }
  }, [course, form, currentModel])

  // Check if course code exists when it changes
  const courseCode = form.watch('code')
  const courseVersion = form.watch('version')
  const tag = form.watch('tag')
  const name = form.watch('name')
  const facultyName = form.watch('facultyName')

  useEffect(() => {
    const normalizedCourseCode = courseCode || '' // Ensure courseCode is always a string
    if (normalizedCourseCode.length >= 2 && normalizedCourseCode !== (course?.code || '')) {
      // Add a small delay to avoid checking on every keystroke
      const timer = setTimeout(() => {
        const existingCourseData = courses.find(
          (c) => c.code.toLowerCase() === normalizedCourseCode.toLowerCase(),
        )
        const exists = !!existingCourseData
        setCodeExists(exists)
      }, 500)

      return () => clearTimeout(timer)
    } else {
      setCodeExists(false)
    }
  }, [courseCode, courses, course?.code])

  // Replace versionExists and tagWarning logic
  useEffect(() => {
    if (courseCode && courseVersion) {
      setVersionExists(
        isCourseDuplicate(
          courses,
          { code: courseCode, version: courseVersion, tag: tag },
          Number(id),
        ),
      )
    } else {
      setVersionExists(false)
    }
  }, [courseCode, courseVersion, tag, courses, id])

  useEffect(() => {
    if (!courseCode || !courseVersion) {
      setTagWarning('')
      return
    }
    setTagWarning(
      isCourseExactDuplicate(
        courses,
        {
          code: courseCode,
          version: courseVersion,
          tag: tag,
          name: name,
          facultyName: facultyName,
        },
        Number(id),
      )
        ? 'A course with the same name, code, faculty, version, and tag already exists. Consider changing the tag to personalize your course.'
        : '',
    )
  }, [courseCode, courseVersion, name, facultyName, tag, courses, id])

  // Filter models based on search term
  const filteredModels = ollamaModels.filter(
    (model) =>
      modelSearchTerm === '' ||
      model.name.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
      model.digest.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
      model.details.parameter_size.toLowerCase().includes(modelSearchTerm.toLowerCase()),
  )

  // Add validation to prevent duplicate course details (all fields match another course except id)
  const isDuplicateCourseDetails = (data: CourseFormValues) => {
    return courses.some(
      (c: Course) =>
        c.id !== Number(id) &&
        c.name === data.name &&
        c.code === data.code &&
        c.facultyName === data.facultyName &&
        c.version === data.version &&
        c.description === (data.description || '') &&
        JSON.stringify(c.model) === JSON.stringify(data.model),
    )
  }

  // --- Refined duplicate check and warning logic ---
  useEffect(() => {
    if (!courseCode || !courseVersion) {
      setTagWarning('')
      return
    }
    const lowerCaseCode = courseCode.trim().toLowerCase()
    const lowerCaseTag = (tag || 'default').trim().toLowerCase()
    const lowerCaseName = (name || '').trim().toLowerCase()
    const lowerCaseFaculty = (facultyName || '').trim().toLowerCase()
    const isExactDuplicate = courses.some(function (course: Course) {
      return (
        course.id !== Number(id) &&
        (course.code || '').trim().toLowerCase() === lowerCaseCode &&
        (course.version || '').trim() === courseVersion.trim() &&
        (course.name || '').trim().toLowerCase() === lowerCaseName &&
        (course.facultyName || '').trim().toLowerCase() === lowerCaseFaculty &&
        (course.tag?.trim().toLowerCase() || 'default') === lowerCaseTag
      )
    })
    if (isExactDuplicate) {
      setTagWarning('A course with this name, code, faculty, version, and tag already exists.')
    } else {
      setTagWarning('')
    }
  }, [courseCode, courseVersion, name, facultyName, tag, courses, id])

  // --- Force full form re-validation when tag changes ---
  useEffect(() => {
    form.trigger()
  }, [tag, form])

  const onSubmit = async (data: CourseFormValues) => {
    setBackendError(null)
    if (!course) return
    // Sanitize tag: remove all non-alphanumeric characters and make lowercase
    const tag = (data.tag || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (isCourseDuplicate(courses, { code: data.code, version: data.version, tag }, Number(id))) {
      toast.error(
        'A course with this code, version, and tag already exists. Please use a different tag or version.',
      )
      return
    }
    if (
      isCourseExactDuplicate(
        courses,
        {
          code: data.code,
          version: data.version,
          tag,
          name: data.name,
          facultyName: data.facultyName,
        },
        Number(id),
      )
    ) {
      toast.warning(
        'A course with the same name, code, faculty, version, and tag already exists. Consider changing the tag to personalize your course.',
      )
    }

    // Trim whitespace from code and version, and use sanitized tag
    const code = (data.code || '').trim()
    const version = (data.version || '').trim()
    const lowerCaseTag = tag
    const versionAndTagExists = courses.some(function (c: Course) {
      return (
        c.id !== Number(id) &&
        (c.code || '').trim().toLowerCase() === code.toLowerCase() &&
        (c.version || '').trim() === version &&
        (c.tag?.trim().toLowerCase() || 'default') === lowerCaseTag
      )
    })
    if (versionAndTagExists) {
      toast.error(
        `A course with code ${code}, version ${version}, and tag '${tag}' already exists.`,
      )
      return
    }

    // Check for duplicate details (all fields match another course)
    if (isDuplicateCourseDetails({ ...data, tag })) {
      const errMsg =
        'A course with exactly the same details already exists. Please modify at least one field.'
      setBackendError(errMsg)
      toast.error(errMsg)
      return
    }

    try {
      // Update course in store
      const updatedCourse = {
        ...course,
        name: data.name,
        code: data.code,
        description: data.description || '',
        facultyName: data.facultyName,
        model: data.model,
        version: data.version,
        tag,
      }
      await updateCourse(updatedCourse)
      toast.success('Course updated', {
        description: `${data.name} has been updated successfully.`,
      })
      router.push('/workspace/courses')
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : 'Failed to update course. Please try again.'
      setBackendError(errMsg)
      toast.error(errMsg)
      console.log(`Failed to update course: ${error}`)
    }
  }

  // Helper function to deeply compare form values and initial values
  function isFormUnchanged(current: CourseFormValues, initial: Partial<CourseFormValues>) {
    const fieldsToCompare: (keyof CourseFormValues)[] = [
      'name',
      'code',
      'facultyName',
      'version',
      'description',
      'model',
      'tag',
    ]
    for (const key of fieldsToCompare) {
      const currentVal = current[key]
      const initialVal = initial[key]
      if (key === 'model') {
        if (JSON.stringify(currentVal) !== JSON.stringify(initialVal)) return false
      } else if (key === 'tag') {
        if (JSON.stringify(currentVal || []) !== JSON.stringify(initialVal || [])) return false
      } else {
        if ((currentVal || '') !== (initialVal || '')) return false
      }
    }
    return true
  }

  const [, setIsTrulyUnchanged] = useState(true)
  const initialValuesRef = useRef(initialValues)

  // Keep initialValuesRef in sync with initialValues after reset
  useEffect(() => {
    initialValuesRef.current = initialValues
  }, [initialValues])

  // Watch for form value changes and update isTrulyUnchanged
  useEffect(() => {
    const subscription = form.watch((values) => {
      setIsTrulyUnchanged(isFormUnchanged(values as CourseFormValues, initialValuesRef.current))
    })
    return () => subscription.unsubscribe()
  }, [form])

  // Only render the form when course data is fully ready and course is found
  if (isCourseLoading || !coursesData) {
    return (
      <div className="h-full w-full">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 lg:min-w-[750px] xl:min-w-[1000px]">
          <div className="hide-scrollbar flex-1 overflow-auto pb-16">
            <div className="w-full py-6">
              <Card className="mx-auto max-w-3xl">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Loading...</CardTitle>
                      <CardDescription>Loading course data...</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push('/workspace/courses')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="h-full w-full">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 lg:min-w-[750px] xl:min-w-[1000px]">
          <div className="hide-scrollbar flex-1 overflow-auto pb-16">
            <div className="w-full py-6">
              <Card className="mx-auto max-w-3xl">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Course Not Found</CardTitle>
                      <CardDescription>
                        The course with ID {id} was not found or may have been deleted.
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push('/workspace/courses')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-center text-muted-foreground">
                      This course may have been deleted or you may not have permission to access it.
                    </p>
                    <Button onClick={() => router.push('/workspace/courses')}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Courses
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 lg:min-w-[750px] xl:min-w-[1000px]">
        {/* Scrollable Content Area */}
        <div className="hide-scrollbar flex-1 overflow-auto pb-16">
          <div className="w-full py-6">
            <Card className="mx-auto max-w-3xl">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Edit Course</CardTitle>
                    <CardDescription>Update the course details below.</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/workspace/courses')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Toast z-index style */}
                <style>{`.sonner-toast { z-index: 99999 !important; }`}</style>
                {backendError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{backendError}</AlertDescription>
                  </Alert>
                )}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Course Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Introduction to Computer Science"
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormDescription>
                              This is the name that will be displayed to students.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Course Code</FormLabel>
                            <FormControl>
                              <Input placeholder="CSC001" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormDescription>
                              The course code used for identification (e.g., ABCD1234).
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="facultyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Faculty Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Faculty of Computing"
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormDescription>
                              Name of the faculty responsible for this course.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="version"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Version</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input
                                  placeholder="YYYY.MM.PATCH"
                                  {...field}
                                  value={field.value ?? ''}
                                />
                              </FormControl>
                              {/* Only show icon if version AND tag are duplicate */}
                              {versionExists && (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <FormDescription>
                              Course version in YYYY.MM.MICRO format (e.g., 2025.01.0).
                            </FormDescription>
                            <FormMessage />
                            {/* Only show alert if version AND tag are duplicate */}
                            {versionExists && (
                              <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Version and tag already exist</AlertTitle>
                                <AlertDescription className="text-xs">
                                  A course with code {courseCode}, version {courseVersion}, and tag{' '}
                                  {form.watch('tag') || 'default'} already exists. Please use a
                                  different version or tag.
                                </AlertDescription>
                              </Alert>
                            )}
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Course Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="A comprehensive introduction to the fundamental concepts of computer science..."
                                className="resize-none"
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormDescription>
                              Provide a brief description of what students will learn in this
                              course.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Replace multi-tag UI with single text input for tag */}
                      <FormField
                        control={form.control}
                        name="tag"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tag (Optional)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input placeholder="e.g. course2025" {...field} />
                              </FormControl>
                              {tagWarning && <AlertCircle className="h-4 w-4 text-destructive" />}
                            </div>
                            <FormDescription>
                              Add a tag to differentiate this course version (e.g. lecturer name,
                              semester, etc).
                            </FormDescription>
                            {tagWarning && (
                              <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Duplicate course</AlertTitle>
                                <AlertDescription className="text-xs">
                                  {tagWarning}
                                </AlertDescription>
                              </Alert>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                          <FormItem className="space-y-4">
                            <FormLabel>AI Model</FormLabel>
                            <div className="space-y-4">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search models..."
                                  value={modelSearchTerm}
                                  onChange={(e) => setModelSearchTerm(e.target.value)}
                                  className="pl-8"
                                />
                              </div>

                              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2">
                                {filteredModels.length > 0 ? (
                                  filteredModels.map((model) => (
                                    <div
                                      key={model.digest}
                                      className={cn(
                                        'cursor-pointer rounded-md border p-3 transition-colors',
                                        field.value?.digest === model.digest
                                          ? 'border-primary bg-primary/5'
                                          : 'hover:bg-accent',
                                      )}
                                      onClick={() => field.onChange(model)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          field.onChange(model)
                                        }
                                      }}
                                    >
                                      <div className="flex justify-between">
                                        <div className="font-medium">{model.name}</div>
                                        {field.value?.digest === model.digest && (
                                          <Check className="h-5 w-5 text-primary" />
                                        )}
                                      </div>
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        {model.details.family}
                                      </div>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        <span className="font-medium">Parameters:</span>{' '}
                                        {model.details.parameter_size}
                                        {model.details.quantization_level && (
                                          <span className="ml-2">
                                            <span className="font-medium">Quantization:</span>{' '}
                                            {model.details.quantization_level}
                                          </span>
                                        )}
                                      </div>
                                      {model.size > 0 && (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          <span className="font-medium">Size:</span>{' '}
                                          {(model.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <div className="py-8 text-center text-muted-foreground">
                                    No models found. Please add models first or try a different
                                    search term.
                                  </div>
                                )}
                              </div>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => router.push('/workspace/courses')}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            form.reset(initialValues)
                            setBackendError(null)
                          }}
                        >
                          Reset
                        </Button>
                        <Button type="submit" disabled={isPending}>
                          {isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Update Course
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
