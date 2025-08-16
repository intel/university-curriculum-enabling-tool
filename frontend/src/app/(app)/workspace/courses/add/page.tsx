'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Loader2,
  Search,
  X,
  AlertCircle,
  FileJson,
  FileUp,
} from 'lucide-react'
import { useModelStore } from '@/lib/store/model-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import useEmblaCarousel from 'embla-carousel-react'
import { cn, compareVersions } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDropzone } from 'react-dropzone'
import { OllamaModel } from '@/lib/types/ollama-model'
import { useCourses, useCreateCourse } from '@/lib/hooks/use-courses'
import { Course } from '@/payload-types'

interface ProgrammeConfig {
  id: number
  name: string
  code: string
  description?: string
  facultyName: string
  version: string
  model: OllamaModel
  courses: {
    id: number
    name: string
    code: string
    description?: string
    facultyName: string
    version: string
    tag: string
    model: OllamaModel
  }[]
}

interface CourseToAdd {
  id: number
  name: string
  code: string
  description?: string
  facultyName: string
  version: string
  tag: string
  model: OllamaModel
  alreadyAdded?: boolean
  isLatestVersion?: boolean
  modelMissing?: boolean
  exactVersionExists?: boolean
}

export default function AddCoursePage() {
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const { mutateAsync: createCourse, isPending: isCreateCoursePending } = useCreateCourse()
  const [courses, setCourses] = useState<Course[]>([])
  const { models } = useModelStore()
  const [, setIsVerifying] = useState(false)
  const [isValidConfig, setIsValidConfig] = useState(false)
  const [programmeConfig, setProgrammeConfig] = useState<ProgrammeConfig | null>(null)
  const [coursesToAdd, setCoursesToAdd] = useState<CourseToAdd[]>([])
  const [selectedCourses, setSelectedCourses] = useState<number[]>([])
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'center' })
  const [currentSlide, setCurrentSlide] = useState(0)
  const [courseSearchTerm, setCourseSearchTerm] = useState('')
  const [tag, setTag] = useState('')
  const [tagError, setTagError] = useState('')

  // Update course state when courses data changes
  useEffect(() => {
    if (coursesData) {
      setCourses(coursesData.docs || [])
    }
  }, [coursesData])

  // Setup dropzone for file upload
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/json': ['.json'],
    },
    onDrop: (acceptedFiles) => {
      handleFileUpload(acceptedFiles)
    },
  })

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return

    setIsVerifying(true)

    try {
      const file = files[0]

      // Check if it's a JSON file
      if (file.type === 'application/json') {
        const text = await file.text()
        const json = JSON.parse(text)

        // Validate the JSON structure
        if (validateProgrammeConfig(json)) {
          setProgrammeConfig(json)
          setTag(json.courses[0]?.tag || '')
          processCoursesFromConfig(json)
          setIsValidConfig(true)
          toast.success('Programme Configuration Loaded', {
            description: `Successfully loaded ${json.name} with ${json.courses.length} courses.`,
          })
        } else {
          toast.error('Invalid Configuration', {
            description: `The uploaded JSON file is not a valid programme configuration.`,
          })
        }
      } else {
        toast.error('Unsupported File Type', {
          description: `Please upload a JSON file containing programme configuration.`,
        })
      }
    } catch (error) {
      console.error('Error processing file:', error)
      toast.error('Error Processing File', {
        description: `Failed to process the uploaded file. Please ensure it's a valid JSON file.`,
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const validateProgrammeConfig = (config: ProgrammeConfig): config is ProgrammeConfig => {
    return (
      config &&
      typeof config.id === 'number' &&
      typeof config.name === 'string' &&
      typeof config.code === 'string' &&
      typeof config.facultyName === 'string' &&
      typeof config.version === 'string' &&
      Array.isArray(config.courses) &&
      config.courses.every(
        (course: ProgrammeConfig['courses'][0]) =>
          typeof course.id === 'number' &&
          typeof course.name === 'string' &&
          typeof course.code === 'string' &&
          typeof course.facultyName === 'string' &&
          typeof course.version === 'string' &&
          typeof course.tag === 'string' &&
          typeof course.model === 'object' &&
          typeof course.model?.name === 'string' &&
          typeof course.model?.digest === 'string',
      )
    )
  }

  const processCoursesFromConfig = (config: ProgrammeConfig) => {
    // Process each course and check if it's already added and if its model exists
    const processed: CourseToAdd[] = config.courses.map((course) => {
      // Find all existing courses with the same code
      const existingCourses = courses.filter((c) => c.code === course.code)
      const alreadyAdded = existingCourses.length > 0
      const exactVersionExists = existingCourses.some((c) => c.version === course.version)
      // Only consider it upgradeable if it's already added, no exact version exists, and the new version is higher than ALL existing versions
      const isUpgradeable =
        alreadyAdded &&
        !exactVersionExists &&
        existingCourses.every((c) => compareVersions(course.version, c.version) > 0)
      // Check if the required model exists
      const modelExists = models.some(
        (model) =>
          model.digest === course.model?.digest ||
          model.name.toLowerCase() === course.model?.name.toLowerCase(),
      )
      return {
        ...course,
        facultyName: config.facultyName,
        tag: course.tag || 'default',
        alreadyAdded: alreadyAdded && (exactVersionExists || !isUpgradeable),
        isLatestVersion: isUpgradeable,
        exactVersionExists: exactVersionExists,
        modelMissing: !modelExists,
      }
    })

    setCoursesToAdd(processed)

    // Show a warning if any models are missing
    const missingModels = processed.filter((course) => course.modelMissing)
    if (missingModels.length > 0) {
      toast.warning('Missing Models Detected', {
        description: `${missingModels.length} course(s) require models that are not installed. These courses cannot be selected.`,
      })
    }
  }

  const handleCourseToggle = (courseId: number) => {
    // Find the course
    const course = coursesToAdd.find((c) => c.id === courseId)

    // If course has missing model, show a toast and don't toggle
    if (course?.modelMissing) {
      toast.error('Course Package Not Installed', {
        description: `Please install the required course "${course.name}" package first.`,
      })
      return
    }

    // If course is already added with exact same version, show a toast and don't toggle
    if (course?.exactVersionExists) {
      toast.error('Duplicate Course Version', {
        description: `The course "${course.name}" with code ${course.code} and version ${course.version} already exists in your courses.`,
      })
      return
    }

    // If course is already added and not a newer version, show a toast and don't toggle
    if (course?.alreadyAdded && !course.isLatestVersion) {
      toast('Course Already Added', {
        description: `The course "${course.name}" with code ${course.code} is already in your courses and this is not a newer version.`,
      })
      return
    }

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

  const filteredCoursesToAdd = coursesToAdd.filter(
    (course) =>
      courseSearchTerm === '' ||
      course.name.toLowerCase().includes(courseSearchTerm.toLowerCase()) ||
      course.code?.toLowerCase().includes(courseSearchTerm.toLowerCase()) ||
      course.description?.toLowerCase().includes(courseSearchTerm.toLowerCase()),
  )

  const onNext = () => {
    if (!tag.trim()) {
      setTagError('Tag is required')
      return
    }
    setTagError('')
    handleNext()
  }

  const onSubmit = async () => {
    if (currentSlide === 0) {
      onNext()
    } else {
      try {
        const addedCourses = []

        for (const courseId of selectedCourses) {
          const course = coursesToAdd.find((c) => c.id === courseId)
          if (course) {
            // Use createCourse hook to add the course
            await createCourse({
              name: course.name,
              code: course.code,
              description: course.description || '',
              facultyName: course.facultyName,
              model: { ...course.model },
              version: course.version,
              tag: tag || course.tag || 'default',
            })

            addedCourses.push(course)
          }
        }

        if (addedCourses.length > 0) {
          toast.success('Courses Added', {
            description: `${addedCourses.length} course${addedCourses.length === 1 ? '' : 's'} ${addedCourses.length === 1 ? 'has' : 'have'} been added successfully.`,
          })
        } else {
          toast.error('No Courses Added', {
            description: `No courses were selected to add.`,
          })
        }

        // Navigate back to courses page
        router.push('/workspace/courses')
      } catch (error) {
        toast.error('Error', {
          description: `Failed to add courses. Please try again.`,
        })
        console.log(`Failed to add courses: ${error}`)
      }
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

  // Count how many courses are already added but not newer versions
  const alreadyAddedCount = filteredCoursesToAdd.filter(
    (course) => course.alreadyAdded && !course.isLatestVersion && !course.exactVersionExists,
  ).length

  const exactVersionCount = filteredCoursesToAdd.filter(
    (course) => course.exactVersionExists,
  ).length

  const availableToAddCount = filteredCoursesToAdd.length - alreadyAddedCount - exactVersionCount
  const upgradeableCount = filteredCoursesToAdd.filter(
    (course) => course && !course.modelMissing && course.isLatestVersion,
  ).length

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
                    <CardTitle>Add Courses</CardTitle>
                    <CardDescription>
                      Upload a programme configuration file to add courses.
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
                    {/* Step 1: File Upload */}
                    <div className="min-w-0 flex-[0_0_100%]">
                      <div className="space-y-6">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            1
                          </div>
                          <h3 className="font-medium">Upload Programme Configuration</h3>
                        </div>

                        <div className="mb-4 rounded-lg bg-muted/50 p-4">
                          <div className="flex items-start space-x-3">
                            <FileJson className="mt-0.5 h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">Programme Configuration File</h4>
                              <p className="text-sm text-muted-foreground">
                                Upload a JSON file containing programme configuration. This will
                                allow you to add courses from the programme.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div
                          {...getRootProps()}
                          className="cursor-pointer rounded-md border-2 border-dashed p-8 text-center"
                        >
                          <input {...getInputProps()} />
                          {isDragActive ? (
                            <div>
                              <FileUp
                                strokeWidth={0.8}
                                className="mx-auto h-10 w-10 text-primary"
                              />
                              <p className="pt-4 text-xs text-muted-foreground">
                                Drop the files here ...
                              </p>
                            </div>
                          ) : (
                            <div>
                              <FileUp
                                strokeWidth={0.8}
                                className="mx-auto h-8 w-8 text-muted-foreground"
                              />
                              <p className="pt-4 text-xs text-muted-foreground">
                                Drag & drop a programme configuration file here, or click to select
                                files
                              </p>
                              <p className="text-xs text-muted-foreground">
                                (Supported formats: JSON)
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Tag input field, only show after valid config */}
                        {programmeConfig && (
                          <div className="mt-6">
                            <label htmlFor="tag" className="mb-1 block text-sm font-medium">
                              Tag
                            </label>
                            <Input
                              id="tag"
                              value={tag}
                              onChange={(e) => setTag(e.target.value)}
                              placeholder="Enter a tag for all courses (e.g. default, 2025, etc.)"
                            />
                            {tagError && <span className="text-xs text-red-500">{tagError}</span>}
                          </div>
                        )}

                        {programmeConfig && (
                          <div className="mt-6 space-y-4">
                            <h4 className="text-sm font-medium">Programme Details</h4>
                            <div className="space-y-2 rounded-md border p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-medium">{programmeConfig.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {programmeConfig.description}
                                  </div>
                                </div>
                                <Badge variant="outline">{programmeConfig.code}</Badge>
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">Faculty:</span>{' '}
                                {programmeConfig.facultyName}
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">Version:</span>{' '}
                                {programmeConfig.version}
                              </div>
                              <div className="text-sm">
                                <span className="font-medium">Total Courses:</span>{' '}
                                {programmeConfig.courses.length}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            {isValidConfig ? (
                              <span className="flex items-center text-green-500">
                                <Check className="mr-1 h-4 w-4" />
                                Valid Configuration
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No file uploaded</span>
                            )}
                          </div>
                        </div>
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
                            <BookOpen className="mt-0.5 h-5 w-5 text-primary" />
                            <div>
                              <h4 className="font-medium">Available Courses</h4>
                              <p className="text-sm text-muted-foreground">
                                Select the courses you want to add to your account. You can select
                                multiple courses.
                              </p>
                            </div>
                          </div>
                        </div>

                        {coursesToAdd.length > 0 ? (
                          <div className="space-y-4">
                            <div className="flex justify-between text-sm font-medium">
                              <span>Select Courses</span>
                              <span>
                                {selectedCourses.length} of {availableToAddCount} available selected
                              </span>
                            </div>

                            {/* Add search bar for filtering courses */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search courses..."
                                value={courseSearchTerm}
                                onChange={(e) => setCourseSearchTerm(e.target.value)}
                                className="pl-8"
                              />
                            </div>

                            {/* Add alerts for different course statuses */}
                            <div className="space-y-2">
                              {alreadyAddedCount > 0 && (
                                <Alert className="border-yellow-200 bg-yellow-50">
                                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                                  <AlertDescription className="text-yellow-800">
                                    {alreadyAddedCount} course
                                    {alreadyAddedCount === 1 ? ' is' : 's are'} already in your
                                    library and cannot be added again.
                                  </AlertDescription>
                                </Alert>
                              )}

                              {upgradeableCount > 0 && (
                                <Alert className="border-blue-200 bg-blue-50">
                                  <AlertCircle className="h-4 w-4 text-blue-600" />
                                  <AlertDescription className="text-blue-800">
                                    {upgradeableCount} course
                                    {upgradeableCount === 1 ? ' has' : 's have'} a newer version
                                    available. Selecting {upgradeableCount === 1 ? 'it' : 'them'}{' '}
                                    will add the newer version.
                                  </AlertDescription>
                                </Alert>
                              )}

                              {coursesToAdd.filter((c) => c.exactVersionExists).length > 0 && (
                                <Alert
                                  variant="destructive"
                                  className="border-orange-200 bg-orange-50"
                                >
                                  <AlertCircle className="h-4 w-4 text-orange-600" />
                                  <AlertDescription className="text-orange-800">
                                    {coursesToAdd.filter((c) => c.exactVersionExists).length} course
                                    {coursesToAdd.filter((c) => c.exactVersionExists).length === 1
                                      ? ' has'
                                      : 's have'}{' '}
                                    identical versions already in your library and cannot be added
                                    again.
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>

                            <div className="max-h-[300px] space-y-2 overflow-y-auto pr-2">
                              {filteredCoursesToAdd.map((course) => (
                                <button
                                  key={course.id}
                                  type="button"
                                  className={cn(
                                    'w-full rounded-md border p-3 text-left transition-colors',
                                    course.modelMissing
                                      ? 'cursor-not-allowed border-muted bg-muted/50 opacity-70'
                                      : course.exactVersionExists
                                        ? 'cursor-not-allowed border-muted bg-muted/50 opacity-70'
                                        : // : course.alreadyAdded && !course.isLatestVersion
                                          // ? "border-muted bg-muted/50 opacity-70 cursor-not-allowed"
                                          selectedCourses.includes(course.id)
                                          ? 'cursor-pointer border-primary bg-primary/5'
                                          : 'cursor-pointer hover:bg-accent',
                                  )}
                                  onClick={() => handleCourseToggle(course.id)}
                                  disabled={course.modelMissing || course.exactVersionExists}
                                >
                                  <div className="flex justify-between">
                                    <div className="flex flex-wrap items-center gap-2 font-medium">
                                      {course.name}
                                      <Badge variant="outline" className="text-xs">
                                        {course.code}
                                      </Badge>
                                      {course.modelMissing && (
                                        <Badge
                                          variant="outline"
                                          className="border-primary text-xs text-primary"
                                        >
                                          Course Package Not Installed
                                        </Badge>
                                      )}
                                      {!course.modelMissing && course.isLatestVersion && (
                                        <Badge className="bg-primary text-xs">
                                          Upgrade Available
                                        </Badge>
                                      )}
                                      {/* {course.exactVersionExists && (
                                        <Badge className="bg-orange-500 hover:bg-orange-600 text-xs">
                                          Duplicate Version
                                        </Badge>
                                      )} */}
                                      {course.alreadyAdded && !course.isLatestVersion && (
                                        <Badge
                                          variant="outline"
                                          className="border-primary text-xs text-primary"
                                        >
                                          Already Added
                                        </Badge>
                                      )}
                                    </div>
                                    {selectedCourses.includes(course.id) && (
                                      <Check className="h-5 w-5 text-primary" />
                                    )}
                                  </div>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    {course.description}
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    <span className="font-medium">Version:</span> {course.version} •
                                    <span className="ml-2 font-medium">Faculty:</span>{' '}
                                    {course.facultyName}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-muted-foreground">
                              No courses available. Please upload a programme configuration file
                              first.
                            </p>
                          </div>
                        )}
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
            <Button onClick={onNext} disabled={!isValidConfig}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={onSubmit}
              disabled={selectedCourses.length === 0 || isCreateCoursePending}
            >
              {isCreateCoursePending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Add Selected Courses
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
