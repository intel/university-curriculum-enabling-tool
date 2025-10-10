// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useForm, FieldErrors } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useProgrammes, useUpdateProgramme } from '@/lib/hooks/use-programmes'
import { useCourses } from '@/lib/hooks/use-courses'
import { Check, Search, AlertCircle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { Programme, Course } from '@/payload-types'

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
  courses: z.array(z.number()).min(1, { message: 'Select at least one course.' }),
})

type ProgrammeFormValues = z.infer<typeof programmeFormSchema>

export default function EditProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { data: programmesData, isLoading: isProgrammesLoading } = useProgrammes()
  const { mutateAsync: updateProgramme, isPending } = useUpdateProgramme()
  const { data: coursesData } = useCourses()
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [selectedCourses, setSelectedCourses] = useState<number[]>([])
  const [courseSearchTerm, setCourseSearchTerm] = useState('')
  const [, setOriginalCourses] = useState<number[]>([])
  const [backendError, setBackendError] = useState<string | null>(null)
  const [versionExists, setVersionExists] = useState(false)

  const defaultValues: Partial<ProgrammeFormValues> = {
    name: '',
    code: '',
    facultyName: '',
    version: '2025.01.0',
    description: '',
    courses: [],
  }

  const [initialValues, setInitialValues] = useState(defaultValues)
  const unwrappedParams = React.use(params)
  const id = unwrappedParams.id

  useEffect(() => {
    if (programmesData) {
      setProgrammes(programmesData.docs || [])
    }
  }, [programmesData])

  const programme = programmes.find((p: Programme) => p.id === Number(id))

  useEffect(() => {
    if (programmes.length > 0 && !programme) {
      router.push('/workspace/programmes')
    }
  }, [programme, programmes, router])

  const form = useForm<ProgrammeFormValues>({
    resolver: standardSchemaResolver(programmeFormSchema),
    mode: 'onChange',
  })

  useEffect(() => {
    if (programme && Array.isArray(programme.courses)) {
      // const courseIds = programme.courses.map((c: number | Course ) => (typeof c === 'number' ? c : c.id))
      const courseIds = programme.courses.map((c: number | Course) =>
        typeof c === 'number' ? c : c.id,
      )
      setSelectedCourses(courseIds)
      setOriginalCourses(courseIds)
      form.reset({
        name: programme.name || '',
        code: programme.code || '',
        facultyName: programme.facultyName || '',
        version: programme.version || '2025.01.0',
        description: programme.description || '',
        courses: courseIds,
      })
      setInitialValues({
        name: programme.name || '',
        code: programme.code || '',
        facultyName: programme.facultyName || '',
        version: programme.version || '2025.01.0',
        description: programme.description || '',
        courses: courseIds,
      })
      setBackendError(null)
    }
  }, [programme, form])

  // Keep form courses in sync with selectedCourses
  useEffect(() => {
    form.setValue('courses', selectedCourses, { shouldValidate: true })
  }, [selectedCourses, form])

  // Watch for version/code existence
  const code = form.watch('code')
  const version = form.watch('version')

  useEffect(() => {
    if (code && version && programmes.length > 0 && programme) {
      // Only check for version conflicts if the code or version has actually changed
      const hasChanged =
        code.toLowerCase() !== programme.code.toLowerCase() || version !== programme.version

      if (hasChanged) {
        // Check if this exact version already exists for this code (excluding the current programme)
        const currentProgrammeId = Number(id)
        const exists = programmes.some(
          (p: Programme) =>
            p.id !== currentProgrammeId &&
            p.code.toLowerCase() === code.toLowerCase() &&
            p.version === version,
        )
        setVersionExists(exists)
      } else {
        // If values haven't changed from the original, no conflict
        setVersionExists(false)
      }
    } else {
      setVersionExists(false)
    }
  }, [code, version, programmes, programme, id])

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

  // Add validation to prevent duplicate programme details (all fields match another programme except id)
  const isDuplicateProgrammeDetails = (data: ProgrammeFormValues) => {
    return programmes.some(
      (p: Programme) =>
        p.id !== Number(id) &&
        p.name === data.name &&
        p.code === data.code &&
        p.facultyName === data.facultyName &&
        p.version === data.version &&
        p.description === (data.description || '') &&
        JSON.stringify((p.courses || []).sort()) === JSON.stringify((data.courses || []).sort()),
    )
  }

  const onError = (errors: FieldErrors<ProgrammeFormValues>) => {
    console.log('Form validation errors:', errors)
    toast.error('Please check all required fields and fix any errors.')
  }

  const onSubmit = async (data: ProgrammeFormValues) => {
    setBackendError(null)

    if (!data.courses.length) {
      const errMsg = 'Please select at least one course.'
      setBackendError(errMsg)
      toast.error(errMsg)
      return
    }
    if (!programme) return

    // Check if code+version already exists (excluding current)
    const versionAlreadyExists = programmes.some(
      (p: Programme) =>
        p.id !== Number(id) &&
        p.code.toLowerCase() === data.code.toLowerCase() &&
        p.version === data.version,
    )
    if (versionAlreadyExists) {
      toast.error(`A programme with code ${data.code} and version ${data.version} already exists.`)
      return
    }

    // Check for duplicate details (all fields match another programme)
    if (isDuplicateProgrammeDetails(data)) {
      const errMsg =
        'A programme with exactly the same details already exists. Please modify at least one field.'
      setBackendError(errMsg)
      toast.error(errMsg)
      return
    }

    try {
      await updateProgramme({ ...programme, ...data, courses: data.courses })
      toast.success('Programme updated', {
        description: `${data.name} has been updated successfully.`,
      })
      router.push('/workspace/programmes')
    } catch (error: unknown) {
      let errMsg = 'Failed to update programme. Please try again.'
      if (typeof error === 'object' && error !== null && 'message' in error) {
        errMsg = String((error as { message?: string }).message) || errMsg
      }
      setBackendError(errMsg)
      toast.error(errMsg)
      console.log(`Failed to update programme: ${error}`)
    }
  }

  if (isProgrammesLoading) {
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
                      <CardDescription>Loading programme data...</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push('/workspace/programmes')}
                    >
                      X
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

  if (!programme && !isProgrammesLoading) {
    return (
      <div className="h-full w-full">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 lg:min-w-[750px] xl:min-w-[1000px]">
          <div className="hide-scrollbar flex-1 overflow-auto pb-16">
            <div className="w-full py-6">
              <Card className="mx-auto max-w-3xl">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Programme Not Found</CardTitle>
                      <CardDescription>
                        The programme with ID {id} was not found or may have been deleted.
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push('/workspace/programmes')}
                    >
                      X
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-center text-muted-foreground">
                      This programme may have been deleted or you may not have permission to access
                      it.
                    </p>
                    <Button onClick={() => router.push('/workspace/programmes')}>
                      Back to Programmes
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
        <div className="hide-scrollbar flex-1 overflow-auto pb-16">
          <div className="w-full py-6">
            <Card className="mx-auto max-w-3xl">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Edit Programme</CardTitle>
                    <CardDescription>Update the programme details below.</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/workspace/programmes')}
                  >
                    X
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Toast z-index style */}
                <style>{`.sonner-toast { z-index: 99999 !important; }`}</style>
                {backendError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{backendError}</AlertDescription>
                  </Alert>
                )}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-6">
                    {/* Show form validation errors */}
                    {Object.keys(form.formState.errors).length > 0 && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Please fix the following errors:
                          <ul className="mt-2 list-inside list-disc">
                            {Object.entries(form.formState.errors).map(([field, error]) => (
                              <li key={field}>
                                {field}: {error?.message || 'Invalid value'}
                              </li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Programme Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Bachelor of Computer Science" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Programme Code</FormLabel>
                            <FormControl>
                              <Input placeholder="BCS001" {...field} />
                            </FormControl>
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
                                  placeholder="2025.01.0"
                                  {...field}
                                  value={field.value ?? ''}
                                />
                              </FormControl>
                              {versionExists && (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              )}
                            </div>
                            <FormMessage />
                            {versionExists && (
                              <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Version already exists</AlertTitle>
                                <AlertDescription className="text-xs">
                                  A programme with code {code} and version {version} already exists.
                                  Please use a different version.
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {/* Course Selection UI */}
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Available Courses</span>
                        <span>{selectedCourses.length} selected</span>
                      </div>
                      <div className="mb-2 flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedCourses(filteredCourses.map((c) => c.id))}
                          disabled={
                            filteredCourses.length === 0 ||
                            selectedCourses.length === filteredCourses.length
                          }
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedCourses([])}
                          disabled={selectedCourses.length === 0}
                        >
                          Deselect All
                        </Button>
                      </div>
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
                          <AlertDescription>
                            No courses found. Please create courses first or try a different search
                            term.
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
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between pt-4">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => router.push('/workspace/programmes')}
                      >
                        Cancel
                      </Button>
                      <div className="flex gap-2">
                        {versionExists && (
                          <div className="self-center text-sm text-red-600">
                            A programme with this code and version already exists
                          </div>
                        )}
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            form.reset(initialValues)
                            setSelectedCourses(initialValues.courses || [])
                            setBackendError(null)
                          }}
                        >
                          Reset
                        </Button>
                        <Button type="submit" disabled={isPending || versionExists}>
                          {isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Update Programme
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
