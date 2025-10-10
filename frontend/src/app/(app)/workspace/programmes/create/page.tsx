// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Check,
  Loader2,
  Search,
  X,
  AlertCircle,
  ChevronUp,
} from 'lucide-react'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { Badge } from '@/components/ui/badge'
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

// Add these imports at the top of the file
import { useCreateProgramme, useProgrammes } from '@/lib/hooks/use-programmes'
import { useCourses } from '@/lib/hooks/use-courses'
import { Programme } from '@/payload-types'

// Define the programme creation form schema
const programmeFormSchema = z.object({
  name: z.string().min(3, {
    message: 'Programme name must be at least 3 characters.',
  }),
  code: z.string().min(4, {
    message: 'Programme code must be at least 4 characters.',
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
  description: z.string().optional(),
})

type ProgrammeFormValues = z.infer<typeof programmeFormSchema>

// Extended ComboboxOption interface with additional display property
interface ProgrammeCodeOption extends ComboboxOption {
  displayValue?: string // Optional shorter display value for selected state
}

export default function CreateProgrammePage() {
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const { data: programmesData } = useProgrammes()
  const { mutateAsync: createProgramme, isPending } = useCreateProgramme()
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center' })
  const [currentSlide, setCurrentSlide] = useState(0)
  const [selectedCourses, setSelectedCourses] = useState<number[]>([])
  const [courseSearchTerm, setCourseSearchTerm] = useState('')

  // State for programme code validation and suggestions
  const [isCheckingCode, setIsCheckingCode] = useState(false)
  const [codeExists, setCodeExists] = useState(false)
  const [existingProgramme, setExistingProgramme] = useState<Programme | null>(null)
  const [versionExists, setVersionExists] = useState(false)
  const [programmeCodeOptions, setProgrammeCodeOptions] = useState<ProgrammeCodeOption[]>([])
  const [selectedCodeOption, setSelectedCodeOption] = useState<string>('')

  // Default values for the form
  const defaultValues: Partial<ProgrammeFormValues> = {
    name: '',
    code: '',
    facultyName: '',
    version: '2025.01.0',
    description: '',
  }

  const form = useForm<ProgrammeFormValues>({
    resolver: standardSchemaResolver(programmeFormSchema),
    defaultValues,
    mode: 'onBlur', // Validate on blur (not on every change)
    reValidateMode: 'onSubmit', // Only re-validate on submit, not on every change
  })

  // Update programmes state when programmes data changes
  useEffect(() => {
    if (programmesData) {
      setProgrammes(programmesData.docs || [])
    }
  }, [programmesData])

  // Generate programme code options on component mount
  useEffect(() => {
    const uniqueCodes = new Set<string>()
    const options: ProgrammeCodeOption[] = []

    programmes.forEach((programme: Programme) => {
      if (!uniqueCodes.has(programme.code)) {
        uniqueCodes.add(programme.code)
        options.push({
          value: programme.code,
          label: `${programme.code} - ${programme.name}`,
          displayValue: programme.code,
        })
      }
    })

    setProgrammeCodeOptions(options)
  }, [programmes])

  // Handle programme code selection from combobox
  const handleCodeSelection = (code: string) => {
    setSelectedCodeOption(code)

    // Set the code value in the form
    form.setValue('code', code, {
      shouldValidate: true, // This will trigger validation
      shouldDirty: true, // Mark the field as dirty
    })

    // Find the latest version of the programme with this code from the programmes state
    const latestProgramme = programmes
      .filter((programme) => programme.code === code)
      .sort((a, b) => b.version.localeCompare(a.version))[0]

    if (latestProgramme) {
      setExistingProgramme(latestProgramme)
      setCodeExists(true)

      // Auto-fill form fields with data from the latest programme
      form.setValue('name', latestProgramme.name, { shouldValidate: true })
      form.setValue('facultyName', latestProgramme.facultyName, { shouldValidate: true })
      form.setValue('description', latestProgramme.description || '', { shouldValidate: true })

      // Increment the version
      const newVersion = incrementVersion(latestProgramme.version)
      form.setValue('version', newVersion, { shouldValidate: true })
    }
  }

  // Filter courses based on search term
  const filteredCourses = (coursesData?.docs || []).filter(
    (course) =>
      courseSearchTerm === '' ||
      course.name.toLowerCase().includes(courseSearchTerm.toLowerCase()) ||
      course.code.toLowerCase().includes(courseSearchTerm.toLowerCase()) ||
      (course.description ?? '').toLowerCase().includes(courseSearchTerm.toLowerCase()),
  )

  // Handle course selection toggle
  const handleCourseToggle = (courseId: number) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
    )
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

  // Get the display value for the selected programme code
  const getSelectedCodeDisplay = () => {
    if (!selectedCodeOption) return ''

    const option = programmeCodeOptions.find((opt) => opt.value === selectedCodeOption)
    // Use the displayValue (just the code) if available, otherwise fall back to the full label
    return option ? option.displayValue || option.value : selectedCodeOption
  }

  // Check if programme code exists when it changes
  const programmeCode = form.watch('code')
  const programmeVersion = form.watch('version')

  useEffect(() => {
    if (programmeCode && programmeCode.length >= 2) {
      setIsCheckingCode(true)

      // Add a small delay to avoid checking on every keystroke
      const timer = setTimeout(() => {
        const lowerCaseCode = programmeCode.toLowerCase()
        const matchingProgrammes = programmes.filter(
          (programme) => programme.code.toLowerCase() === lowerCaseCode,
        )

        if (matchingProgrammes.length > 0) {
          setCodeExists(true)
          const latestProgramme = matchingProgrammes.sort((a, b) =>
            b.version.localeCompare(a.version),
          )[0]
          setExistingProgramme(latestProgramme)
        } else {
          setCodeExists(false)
          setExistingProgramme(null)
        }

        setIsCheckingCode(false)
      }, 500)

      return () => clearTimeout(timer)
    } else {
      setCodeExists(false)
      setExistingProgramme(null)
    }
  }, [programmeCode, programmes])

  // Check if version already exists for this programme code
  useEffect(() => {
    if (programmeCode && programmeVersion) {
      // Check if this exact version already exists for this programme code
      const versionAlreadyExists = programmes.some(
        (programme) =>
          programme.code.toLowerCase() === programmeCode.toLowerCase() &&
          programme.version === programmeVersion,
      )

      setVersionExists(versionAlreadyExists)
    } else {
      setVersionExists(false)
    }
  }, [programmeCode, programmeVersion, programmes])

  // Check if form is valid for current slide
  const isCurrentSlideValid = () => {
    if (currentSlide === 0) {
      // Basic information slide
      const { name, code, facultyName, version } = form.getValues()
      return !!name && !!code && !!facultyName && !!version && !versionExists
    }
    // Course selection slide
    return selectedCourses.length > 0
  }

  const onSubmit = async (data: ProgrammeFormValues) => {
    if (currentSlide < 1) {
      handleNext()
    } else {
      // Check if this exact version already exists for this programme code
      const versionAlreadyExists = programmes.some(
        (programme) =>
          programme.code.toLowerCase() === data.code.toLowerCase() &&
          programme.version === data.version,
      )

      if (versionAlreadyExists) {
        toast.error('Error', {
          description: `A programme with code ${data.code} and version ${data.version} already exists.`,
        })
        return
      }

      try {
        // Get the full Course objects for selected course IDs
        const selectedCourseObjects = (coursesData?.docs || []).filter((course) =>
          selectedCourses.includes(course.id),
        )

        // Create programme object
        const newProgramme = {
          name: data.name,
          code: data.code,
          description: data.description || '',
          facultyName: data.facultyName,
          version: data.version,
          courses: selectedCourseObjects,
        }

        // // In a real app, you would save this to your backend
        // console.log("Created programme:", newProgramme);

        // Call the API to create the programme
        await createProgramme(newProgramme)

        toast.success('Programme created', {
          description: `${data.name} has been created successfully.`,
        })

        // Navigate back to programmes page
        router.push('/workspace/programmes')
      } catch (error) {
        toast.error('Error', {
          description: `Failed to create programme. Please try again.`,
        })
        console.log(`Failed to create programme: ${error}`)
      }
    }
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
                    <CardTitle>Create Programme</CardTitle>
                    <CardDescription>
                      Create a new programme with courses for lecturers and students.
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/workspace/programmes')}
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
                                  <FormLabel>Programme Code</FormLabel>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <FormControl>
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
                                                    {programmeCodeOptions.map((option) => (
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
                                      </FormControl>
                                      {isCheckingCode && (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      )}
                                      {codeExists && !isCheckingCode && (
                                        <AlertCircle className="h-4 w-4 text-amber-500" />
                                      )}
                                      {!codeExists &&
                                        programmeCode.length >= 2 &&
                                        !isCheckingCode && (
                                          <Check className="h-4 w-4 text-green-500" />
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <FormControl>
                                        <Input
                                          placeholder="BCS001"
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
                                    A short code for the programme (e.g., BCS, MCS). You can select
                                    an existing code or create a new one.
                                  </FormDescription>
                                  <FormMessage />
                                  {codeExists && existingProgramme && (
                                    <Alert
                                      variant="default"
                                      className="mt-2 border-amber-200 bg-amber-50 text-amber-800"
                                    >
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-xs">
                                        A programme with code {existingProgramme.code} already
                                        exists: &quot;{existingProgramme.name}&quot; (
                                        {existingProgramme.version}) from{' '}
                                        {existingProgramme.facultyName}. Creating a new version.
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
                                  <FormLabel>Programme Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Bachelor of Computer Science" {...field} />
                                  </FormControl>
                                  <FormDescription>The full name of the programme.</FormDescription>
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
                                    The name of the faculty offering this programme.
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
                                      <Input placeholder="2025.01.0" {...field} />
                                    </FormControl>
                                    {versionExists && (
                                      <AlertCircle className="h-4 w-4 text-destructive" />
                                    )}
                                  </div>
                                  <FormDescription>
                                    Programme version in YYYY.MM.MICRO format (e.g., 2025.01.0).
                                  </FormDescription>
                                  <FormMessage />
                                  {versionExists && (
                                    <Alert variant="destructive" className="mt-2">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Version already exists</AlertTitle>
                                      <AlertDescription className="text-xs">
                                        A programme with code {programmeCode} and version{' '}
                                        {programmeVersion} already exists. Please use a different
                                        version.
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
                                  <FormLabel>Programme Description (Optional)</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="A comprehensive programme covering the fundamentals of computer science..."
                                      className="resize-none"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Provide a brief description of what students will learn in this
                                    programme.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </Form>
                      </div>
                    </div>

                    {/* Step 2: Course Selection */}
                    <div className="min-w-0 flex-[0_0_100%]">
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            2
                          </div>
                          <h3 className="font-medium">Course Selection</h3>
                        </div>

                        <div className="mb-4 rounded-lg bg-muted/50 p-4">
                          <div className="flex items-start space-x-3">
                            <BookMarked className="mt-0.5 h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">Select Courses</h4>
                              <p className="text-sm text-muted-foreground">
                                Select the courses that will be part of this programme. Students
                                will be able to download these courses.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between text-sm font-medium">
                            <span>Available Courses</span>
                            <span>{selectedCourses.length} selected</span>
                          </div>

                          {/* Search bar for filtering courses */}
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search courses..."
                              value={courseSearchTerm}
                              onChange={(e) => setCourseSearchTerm(e.target.value)}
                              className="pl-8"
                            />
                          </div>

                          {filteredCourses.length === 0 ? (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                No courses found. Please create courses first or try a different
                                search term.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <div className="max-h-[450px] space-y-2 overflow-y-auto">
                              {filteredCourses.map((course) => (
                                <div
                                  key={course.id}
                                  className={cn(
                                    'cursor-pointer rounded-md border p-3 transition-colors',
                                    selectedCourses.includes(course.id)
                                      ? 'border-primary bg-primary/5'
                                      : 'hover:bg-accent',
                                  )}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleCourseToggle(course.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      handleCourseToggle(course.id)
                                    }
                                  }}
                                >
                                  <div className="flex justify-between">
                                    <div className="flex items-center gap-2 font-medium">
                                      {course.name}
                                    </div>
                                    {selectedCourses.includes(course.id) && (
                                      <Check className="h-5 w-5 text-primary" />
                                    )}
                                  </div>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    {course.description}
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    <span className="font-medium"></span>
                                    {course.facultyName}
                                    <div className="justify-right mt-2 flex">
                                      <Badge variant="outline" className="text-xs">
                                        {course.code}
                                      </Badge>
                                      <Badge variant="secondary" className="ml-2 text-xs">
                                        {course.version}
                                      </Badge>
                                      <Badge variant="secondary" className="ml-2 text-xs">
                                        {course.tag}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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
            <Button variant="outline" onClick={handlePrev} disabled={isPending}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => router.push('/workspace/programmes')}>
              Cancel
            </Button>
          )}
        </div>
        <div>
          {currentSlide < 1 ? (
            <Button onClick={handleNext} disabled={!isCurrentSlideValid()}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Create Programme
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
