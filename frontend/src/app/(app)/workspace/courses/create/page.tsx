// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronUp,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
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
import useEmblaCarousel from 'embla-carousel-react'
import { cn, incrementVersion } from '@/lib/utils'
import { OllamaModel } from '@/lib/types/ollama-model'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ComboboxOption } from '@/components/ui/combobox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useCourses, useCreateCourse } from '@/lib/hooks/use-courses'
import { Course } from '@/payload-types'
import { isCourseDuplicate, isCourseExactDuplicate } from '@/lib/course-duplicate-utils'

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
  version: z
    .string()
    .min(1, { message: 'Version is required.' })
    .refine((val) => /^\d{4}\.\d{1,2}\.\d{1,3}$/.test(val), {
      message: 'Version must be in YYYY.MM.MICRO format (e.g., 2025.01.0)',
    }),
  description: z.string().min(10, {
    message: 'Course description must be at least 10 characters.',
  }),
  model: z.object({
    name: z.string(),
    modified_at: z.string(),
    size: z.number(),
    digest: z.string(),
    details: z.object({
      format: z.string(),
      family: z.string(),
      parameter_size: z.string(),
      quantization_level: z.string(),
    }),
  }),
  tag: z.string().optional(), // single tag for version customization
})

type CourseFormValues = z.infer<typeof courseFormSchema>

// Extended ComboboxOption interface with additional display property
interface CourseCodeOption extends ComboboxOption {
  displayValue?: string // Optional shorter display value for selected state
}

export default function CreateCoursePage() {
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const { mutateAsync: createCourse, isPending: isCreateCoursePending } = useCreateCourse()
  // const createCourseMutation = useCreateCourse()
  const [courses, setCourses] = useState<Course[]>([])
  const { models } = useModelStore()

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center' })
  const [currentSlide, setCurrentSlide] = useState(0)

  // Add state for model search term
  // Add this near the top with other state declarations
  const [modelSearchTerm, setModelSearchTerm] = useState('')

  // Add state for course code validation
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [codeExists, setCodeExists] = useState(false)
  const [existingCourse, setExistingCourse] = useState<Course | null>(null)
  const [versionExists, setVersionExists] = useState(false)

  // State for course code suggestions
  const [courseCodeOptions, setCourseCodeOptions] = useState<CourseCodeOption[]>([])
  const [selectedCodeOption, setSelectedCodeOption] = useState<string>('')

  // New state for tag warning message
  const [tagWarning, setTagWarning] = useState('')

  // Convert existing models to OllamaModel format
  const ollamaModels: OllamaModel[] = models.map((model) => ({
    name: model.name,
    modified_at: new Date().toISOString(), // Default value
    size: model.size,
    digest: model.digest, // Using id as digest
    details: {
      format: model.details.format,
      family: model.details.family,
      parameter_size: model.details.parameter_size,
      quantization_level: model.details.quantization_level,
    },
  }))

  // Update the defaultValues
  const defaultValues: Partial<CourseFormValues> = {
    name: '',
    code: '',
    facultyName: '',
    version: '2025.01.0',
    description: '',
    model: ollamaModels.length > 0 ? ollamaModels[0] : undefined,
    tag: 'default',
  }

  const form = useForm<CourseFormValues>({
    resolver: standardSchemaResolver(courseFormSchema),
    defaultValues,
    mode: 'onBlur', // Validate on blur (not on every change)
    reValidateMode: 'onSubmit', // Only re-validate on submit, not on every change
  })

  // Update course state when courses data changes
  useEffect(() => {
    if (coursesData) {
      setCourses(coursesData.docs || [])
    }
  }, [coursesData])

  // Generate course code options on component mount
  useEffect(() => {
    const uniqueCodes = new Set<string>()
    const options: CourseCodeOption[] = []

    courses.forEach((course: Course) => {
      if (!uniqueCodes.has(course.code)) {
        uniqueCodes.add(course.code)
        options.push({
          value: course.code,
          label: `${course.code} - ${course.name}`,
          displayValue: course.code, // Just use the code for display in the button
        })
      }
    })

    setCourseCodeOptions(options)
  }, [courses])

  // Handle course code selection from combobox
  const handleCodeSelection = (code: string) => {
    setSelectedCodeOption(code)

    // Set the code value in the form with validation
    form.setValue('code', code, {
      shouldValidate: true, // This will trigger validation
      shouldDirty: true, // Mark the field as dirty
    })

    // Find the latest version of the course with this code from the courses state
    const latestCourse = courses
      .filter((course) => course.code === code)
      .sort((a, b) => b.version.localeCompare(a.version))[0]

    if (latestCourse) {
      setExistingCourse(latestCourse)
      setCodeExists(true)

      // Auto-fill form fields with data from the latest course
      form.setValue('name', latestCourse.name, { shouldValidate: true })
      form.setValue('facultyName', latestCourse.facultyName, { shouldValidate: true })
      form.setValue('description', latestCourse.description || '', { shouldValidate: true })

      // Find the corresponding model
      if (
        latestCourse.model &&
        typeof latestCourse.model === 'object' &&
        latestCourse.model !== null &&
        'digest' in latestCourse.model
      ) {
        const courseModel = ollamaModels.find(
          (m) => m.digest === (latestCourse.model as { digest: string }).digest,
        )
        if (courseModel) {
          form.setValue('model', courseModel, { shouldValidate: true })
        }
      }

      // Increment the version
      const newVersion = incrementVersion(latestCourse.version)
      form.setValue('version', newVersion, { shouldValidate: true })
    }
  }

  // Check if course code exists when it changes
  const courseCode = form.watch('code')
  const courseVersion = form.watch('version')

  useEffect(() => {
    if (courseCode && courseCode.length >= 2) {
      setIsCheckingCode(true)

      // Add a small delay to avoid checking on every keystroke
      const timer = setTimeout(() => {
        const lowerCaseCode = courseCode.toLowerCase()
        const matchingCourses = courses.filter(
          (course) => course.code.toLowerCase() === lowerCaseCode,
        )

        if (matchingCourses.length > 0) {
          setCodeExists(true)
          const latestCourse = matchingCourses.sort((a, b) => b.version.localeCompare(a.version))[0]
          setExistingCourse(latestCourse)
        } else {
          setCodeExists(false)
          setExistingCourse(null)
        }

        setIsCheckingCode(false)
      }, 500)

      return () => clearTimeout(timer)
    } else {
      setCodeExists(false)
      setExistingCourse(null)
    }
  }, [courseCode, courses])

  const tag = form.watch('tag')
  const name = form.watch('name')
  const facultyName = form.watch('facultyName')

  // REPLACE the old versionExists useEffect with this refined logic:
  useEffect(() => {
    if (courseCode && courseVersion) {
      setVersionExists(
        isCourseDuplicate(courses, {
          code: courseCode,
          version: courseVersion,
          tag: tag,
        }),
      )
    } else {
      setVersionExists(false)
    }
  }, [courseCode, courseVersion, tag, courses])

  useEffect(() => {
    if (!courseCode || !courseVersion) {
      setTagWarning('')
      return
    }
    setTagWarning(
      isCourseExactDuplicate(courses, {
        code: courseCode,
        version: courseVersion,
        tag: tag,
        name: name,
        facultyName: facultyName,
      })
        ? 'A course with the same name, code, faculty, version, and tag already exists. Consider changing the tag to personalize your course.'
        : '',
    )
  }, [courseCode, courseVersion, name, facultyName, tag, courses])

  const isValid = form.formState.isValid || !versionExists || !tagWarning

  // Add filtered models logic
  const filteredModels = ollamaModels.filter(
    (model) =>
      modelSearchTerm === '' ||
      model.name.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
      model.digest.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
      model.details.parameter_size.toLowerCase().includes(modelSearchTerm.toLowerCase()),
  )

  // Update the onSubmit function to include the new fields
  const onSubmit = async (data: CourseFormValues) => {
    if (isCourseDuplicate(courses, { code: data.code, version: data.version, tag: data.tag })) {
      toast.error(
        'A course with this code, version, and tag already exists. Please use a different tag or version.',
      )
      return
    }
    if (
      isCourseExactDuplicate(courses, {
        code: data.code,
        version: data.version,
        tag: data.tag,
        name: data.name,
        facultyName: data.facultyName,
      })
    ) {
      toast.warning(
        'A course with the same name, code, faculty, version, and tag already exists. Consider changing the tag to personalize your course.',
      )
    }

    // Trim whitespace from code, version, and tag
    const code = (data.code || '').trim()
    const version = (data.version || '').trim()
    const lowerCaseTag = (data.tag || 'default').trim().toLowerCase()
    const versionAndTagExists = courses.some(
      (course: Course) =>
        (course.code || '').trim().toLowerCase() === code.toLowerCase() &&
        (course.version || '').trim().toLowerCase() === version.toLowerCase() &&
        (course.tag?.trim().toLowerCase() || 'default') === lowerCaseTag,
    )

    if (versionAndTagExists) {
      toast.error(
        `A course with code ${code}, version ${version}, and tag '${data.tag || 'default'}' already exists.`,
      )
      return
    }

    try {
      // Ensure tag is a string, default to 'default' if not set
      const tag = data.tag || 'default'
      // Create the new course
      const newCourse = {
        name: data.name,
        code: data.code,
        description: data.description || '',
        facultyName: data.facultyName,
        model: data.model,
        version: data.version,
        tag,
      }

      await createCourse(newCourse)

      toast.success('Course created', {
        description: `${data.name} has been created successfully`,
      })

      // Navigate back to courses page
      router.push('/workspace/courses')
    } catch (error) {
      toast.error('Failed to create course. Please try again.')
      console.error('Error creating course:', error)
    }
  }

  const handleNext = () => {
    if (emblaApi) {
      emblaApi.scrollNext()
    }
  }

  const handlePrev = () => {
    if (emblaApi) {
      emblaApi.scrollPrev()
    }
  }

  // Set up Embla Carousel
  useEffect(() => {
    if (emblaApi) {
      emblaApi.on('select', () => {
        setCurrentSlide(emblaApi.selectedScrollSnap())
      })
    }
  }, [emblaApi])

  // Get the display value for the selected course code
  const getSelectedCodeDisplay = () => {
    if (!selectedCodeOption) return ''

    const option = courseCodeOptions.find((opt) => opt.value === selectedCodeOption)
    // Use the displayValue (just the code) if available, otherwise fall back to the full label
    return option ? option.displayValue || option.value : selectedCodeOption
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
                    <CardTitle>Create Course</CardTitle>
                    <CardDescription>
                      Fill in the details below to create a new course. Students will be able to
                      access this course once it is created.
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
                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex">
                    {/* Step 1: Basic Information */}
                    <div className="min-w-0 flex-[0_0_100%]">
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            1
                          </div>
                          <h3 className="font-medium">Basic Information</h3>
                        </div>

                        <Form {...form}>
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name="code"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Course Code</FormLabel>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      {/* Custom Combobox implementation */}
                                      <div className="relative w-full">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              role="combobox"
                                              className="w-full justify-between overflow-hidden"
                                            >
                                              <div className="mr-2 flex-1 overflow-hidden text-left">
                                                <span className="block truncate">
                                                  {getSelectedCodeDisplay() || 'Select code'}
                                                </span>
                                              </div>
                                              <ChevronUp className="h-4 w-4 flex-shrink-0 shrink-0 opacity-50" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
                                            <Command>
                                              <CommandInput placeholder="Search course codes..." />
                                              <CommandList>
                                                <CommandEmpty>
                                                  No matching codes found.
                                                </CommandEmpty>
                                                <CommandGroup className="max-h-60 overflow-y-auto">
                                                  {courseCodeOptions.map((option) => (
                                                    <CommandItem
                                                      key={option.value}
                                                      value={option.value}
                                                      onSelect={() =>
                                                        handleCodeSelection(option.value)
                                                      }
                                                      className="flex items-center"
                                                    >
                                                      <Check
                                                        className={cn(
                                                          'mr-2 h-4 w-4 flex-shrink-0',
                                                          selectedCodeOption === option.value
                                                            ? 'opacity-100'
                                                            : 'opacity-0',
                                                        )}
                                                      />
                                                      <span className="truncate">
                                                        {option.label}
                                                      </span>
                                                    </CommandItem>
                                                  ))}
                                                </CommandGroup>
                                              </CommandList>
                                            </Command>
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                      {isCheckingCode && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      )}
                                      {codeExists && !isCheckingCode && (
                                        <AlertCircle className="h-4 w-4 text-amber-500" />
                                      )}
                                      {!codeExists && courseCode.length >= 2 && !isCheckingCode && (
                                        <Check className="h-4 w-4 text-green-500" />
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <FormControl>
                                        <Input
                                          placeholder="CSC001"
                                          {...field}
                                          onChange={(e) => {
                                            field.onChange(e)
                                            // Clear selected option if user types manually
                                            if (
                                              selectedCodeOption &&
                                              e.target.value !== selectedCodeOption
                                            ) {
                                              setSelectedCodeOption('')
                                            }
                                          }}
                                        />
                                      </FormControl>
                                    </div>
                                  </div>
                                  <FormDescription>
                                    The course code used for identification (e.g., CSC001). You can
                                    select an existing code or create a new one.
                                  </FormDescription>
                                  <FormMessage />
                                  {codeExists && existingCourse && (
                                    <Alert
                                      variant="default"
                                      className="mt-2 border-amber-200 bg-amber-50 text-amber-800"
                                    >
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-xs">
                                        A course with code {existingCourse.code} already exists:
                                        &quot;
                                        {existingCourse.name}&quot; ({existingCourse.version}) from{' '}
                                        {existingCourse.facultyName}. Creating a new version.
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                </FormItem>
                              )}
                            />

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
                              name="facultyName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Faculty Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Faculty of Computing" {...field} />
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
                                  {/* <FormLabel>Version</FormLabel>
                                  <FormControl>
                                    <Input placeholder="2025.01" {...field} />
                                  </FormControl>
                                  <FormDescription>
                                    Course version in calendar format (YYYY.MM).
                                  </FormDescription>
                                  <FormMessage /> */}

                                  <FormLabel>Version</FormLabel>
                                  <div className="flex items-center gap-2">
                                    <FormControl>
                                      <Input placeholder="2025.01.0" {...field} />
                                    </FormControl>
                                    {versionExists && (
                                      <AlertCircle className="h-4 w-4 text-destructive" />
                                    )}
                                  </div>
                                  <FormDescription>
                                    Course version in YYYY.MM.MICRO format (e.g., 2025.01.0).
                                  </FormDescription>
                                  <FormMessage />
                                  {versionExists && (
                                    <Alert variant="destructive" className="mt-2">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Version and tag already exist</AlertTitle>
                                      <AlertDescription className="text-xs">
                                        A course with code {courseCode}, version {courseVersion},
                                        and tag {form.watch('tag') || 'default'} already exists.
                                        Please use a different version or tag.
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
                                  <FormLabel>Course Description</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="A comprehensive introduction to the fundamental concepts of computer science..."
                                      className="resize-none"
                                      {...field}
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
                                    {tagWarning && (
                                      <AlertCircle className="h-4 w-4 text-destructive" />
                                    )}
                                  </div>
                                  <FormDescription>
                                    Add a tag to differentiate this course version (e.g. lecturer
                                    name, semester, etc).
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
                        </Form>
                      </div>
                    </div>

                    {/* Step 2: AI Model Selection */}
                    <div className="flex min-w-0 flex-[0_0_100%] flex-col">
                      <div className="flex min-h-0 flex-1 flex-col space-y-6">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            2
                          </div>
                          <h3 className="font-medium">Model Selection</h3>
                        </div>

                        <div className="mb-4 rounded-lg bg-muted/50 p-4">
                          <div className="flex items-start space-x-3">
                            <Box className="mt-0.5 h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">AI-Powered Learning</h4>
                              <p className="text-sm text-muted-foreground">
                                Select an AI model to power this course. The model will be used to
                                generate responses to student and lecturer queries and provide
                                personalized learning experiences.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Add search bar for filtering models */}
                        <div className="relative mb-4">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search models..."
                            value={modelSearchTerm}
                            onChange={(e) => setModelSearchTerm(e.target.value)}
                            className="pl-8"
                          />
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col">
                          <Form {...form}>
                            <FormField
                              control={form.control}
                              name="model"
                              render={({ field }) => (
                                <FormItem className="flex min-h-0 flex-1 flex-col space-y-4">
                                  <div className="max-h-full min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                                    {filteredModels.length > 0 ? (
                                      filteredModels.map((model) => (
                                        <button
                                          key={model.digest}
                                          type="button"
                                          className={cn(
                                            'w-full cursor-pointer rounded-md border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                                            field.value?.digest === model.digest
                                              ? 'border-primary bg-primary/5'
                                              : 'hover:bg-accent',
                                          )}
                                          onClick={() => field.onChange(model)}
                                          aria-pressed={field.value?.digest === model.digest}
                                          aria-label={`Select ${model.name} model`}
                                        >
                                          <div className="flex justify-between">
                                            <div className="text-sm font-medium">{model.name}</div>
                                            {field.value?.digest === model.digest && (
                                              <Check className="h-5 w-5 text-primary" />
                                            )}
                                          </div>
                                          <div className="mt-1 text-xs text-muted-foreground">
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
                                        </button>
                                      ))
                                    ) : (
                                      <div className="flex flex-1 items-center justify-center py-8 text-center text-muted-foreground">
                                        No models found. Please add models first or try a different
                                        search term.
                                      </div>
                                    )}
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </Form>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation dots */}
                <div className="mt-8 flex justify-center space-x-2">
                  {[0, 1].map((index) => (
                    <button
                      key={index}
                      className={cn(
                        'h-2.5 w-2.5 rounded-full transition-colors',
                        currentSlide === index ? 'bg-primary' : 'bg-muted-foreground/30',
                      )}
                      onClick={() => emblaApi?.scrollTo(index)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Sticky navigation buttons */}
      <div className="sticky bottom-0 flex w-full justify-between border-t bg-background/95 p-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div>
          {currentSlide > 0 ? (
            <Button variant="outline" onClick={handlePrev} disabled={isCreateCoursePending}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => router.push('/workspace/courses')}>
              Cancel
            </Button>
          )}
        </div>
        <div>
          {currentSlide < 1 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={!isValid || isCreateCoursePending}
            >
              {isCreateCoursePending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Create Course
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
