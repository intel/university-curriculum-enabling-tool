'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Tag,
  Presentation,
  FileCheck,
  FilePen,
  BookOpen,
  HardDriveDownload,
  FileQuestion,
  Tags,
} from 'lucide-react'
import { useModelStore } from '@/lib/store/model-store'
import { useCourses } from '@/lib/hooks/use-courses'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Skeleton } from '@/components/ui/skeleton'

export default function LecturerOverviewPage() {
  const router = useRouter()
  const { data: coursesData, isLoading: isCourseLoading } = useCourses()
  const { selectedCourseId, setSelectedCourseId } = usePersonaStore()
  const { models } = useModelStore()

  // Select first course if none selected
  useEffect(() => {
    if (
      (coursesData?.docs ?? []).filter(
        (c) =>
          c.model != null &&
          models.some((model) => model.name === (c.model as { name: string }).name),
      ).length > 0 &&
      !selectedCourseId
    ) {
      setSelectedCourseId(coursesData?.docs[0]?.id ?? 0)
    }
  }, [coursesData?.docs, models, selectedCourseId, setSelectedCourseId])

  const activeCourse = coursesData?.docs.find((course) => course.id === Number(selectedCourseId))

  // Get courses from the same faculty as the active course
  const relatedCourses = activeCourse
    ? coursesData?.docs.filter(
        (course) =>
          course.facultyName === activeCourse.facultyName && course.id !== activeCourse.id,
      )
    : []

  // Get total version of the same course code
  const totalCoursesWithSameCode = coursesData?.docs.filter(
    (c) => c.code === activeCourse?.code,
  ).length

  if (isCourseLoading) {
    return (
      <div className="container mx-auto flex h-full w-full flex-col px-6">
        <div className="hide-scrollbar flex-1 overflow-auto">
          <div className="w-full px-2 py-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Active Course Skeleton */}
              <div className="space-y-6 md:col-span-2">
                <Card className="border-primary/20 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between truncate">
                      <div>
                        <Skeleton className="mb-2 h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="mb-4 h-4 w-full" />
                    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t pt-4">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                  </CardFooter>
                </Card>

                <div>
                  <Skeleton className="mb-4 h-6 w-1/3" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </div>
                </div>
              </div>

              {/* Sidebar Skeleton */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-10 w-24" />
                </div>

                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>

                <Skeleton className="mt-8 h-6 w-1/3" />
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if ((coursesData?.docs?.length ?? 0) === 0) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <BookOpen strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">No Courses Available</h1>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            You have not add any courses yet. Add courses to start teaching.
          </p>
          <Button
            onClick={() => router.push('/workspace/courses/add')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Add Courses
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto flex h-full w-full flex-col px-6">
      {/* Scrollable Content Area */}
      <div className="hide-scrollbar flex-1 overflow-auto">
        <div className="w-full px-2 py-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Active Course */}
            <div className="space-y-6 md:col-span-2">
              {activeCourse ? (
                <>
                  <Card className="border-primary/20 shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between truncate">
                        <div>
                          <CardTitle className="max-w-[700px] truncate text-2xl">
                            {activeCourse.name}
                          </CardTitle>
                          <CardDescription className="mt-1 flex items-center">
                            <Badge variant="outline" className="mr-2">
                              {activeCourse.code}
                            </Badge>
                            <span>{activeCourse.facultyName}</span>
                          </CardDescription>
                        </div>
                        <Badge className="bg-primary">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 text-muted-foreground">{activeCourse.description}</p>

                      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                        <div className="flex items-center">
                          <div className="mr-3 rounded-full bg-primary/10 p-2">
                            <HardDriveDownload className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Status</div>
                            <div className="font-medium">
                              {activeCourse.model &&
                              typeof activeCourse.model === 'object' &&
                              'name' in (activeCourse.model as { name: string }) &&
                              models.some(
                                (model) =>
                                  model.name === (activeCourse.model as { name: string }).name,
                              ) ? (
                                <Badge className="bg-primary">Available</Badge>
                              ) : (
                                <Badge variant="outline" className="border-primary text-primary">
                                  Unavailable
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <div className="mr-3 rounded-full bg-primary/10 p-2">
                            <Tags className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Version</div>
                            <div className="font-medium">{totalCoursesWithSameCode}</div>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <div className="mr-3 rounded-full bg-primary/10 p-2">
                            <Tag className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Version</div>
                            <div className="font-medium">{activeCourse.version}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between border-t pt-4">
                      <Button variant="outline" onClick={() => router.push('/workspace/chat')}>
                        Course Chat
                      </Button>
                      <Button onClick={() => router.push('/workspace/quiz/generate')}>
                        Generate Quiz
                      </Button>
                    </CardFooter>
                  </Card>

                  <div>
                    <h2 className="mb-4 text-lg font-bold">Teaching Materials</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Card
                        onClick={() => router.push('/workspace/slide')}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Slide</CardTitle>
                            <Presentation className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-sm text-muted-foreground">
                            Generate and manage lecture slides
                          </p>
                        </CardContent>
                      </Card>

                      <Card
                        onClick={() => router.push('/workspace/assessment')}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Assessment</CardTitle>
                            <FilePen className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-sm text-muted-foreground">
                            Create and generate assessment questions
                          </p>
                        </CardContent>
                      </Card>

                      <Card
                        onClick={() => router.push('/workspace/quiz/generate')}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Quiz</CardTitle>
                            <FileCheck className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-sm text-muted-foreground">Generate quizzes</p>
                        </CardContent>
                      </Card>

                      <Card
                        onClick={() => router.push('/workspace/faq')}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">FAQ</CardTitle>
                            <FileQuestion className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-sm text-muted-foreground">
                            Generate Frequently Ask Questions
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Course Selected</CardTitle>
                    <CardDescription>Select a course from the list to view details</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="mr-2 text-lg font-bold">Your Courses</h2>
                <Button
                  variant="outline"
                  onClick={() => router.push('/workspace/courses/add')}
                  className="flex items-center"
                >
                  <Plus className="h-4 w-4" />
                  Add Courses
                </Button>
              </div>

              <div className="space-y-3">
                {coursesData?.docs?.map((course) => {
                  const isAvailable = models.some(
                    (model) =>
                      typeof course.model === 'object' &&
                      course.model !== null &&
                      'name' in course.model &&
                      model.name === (course.model as { name: string }).name,
                  )
                  return (
                    <Card
                      key={course.id}
                      className={`transition-colors ${
                        selectedCourseId === course.id ? 'border-primary bg-primary/5' : ''
                      } ${isAvailable ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default opacity-70'}`}
                      onClick={() => isAvailable && setSelectedCourseId(course.id)}
                    >
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-base">{course.name}</CardTitle>
                        <CardDescription className="flex items-center">
                          <Badge variant="outline" className="mr-2">
                            {course.code}
                          </Badge>
                          {!isAvailable && (
                            <Badge variant="outline" className="border-primary text-primary">
                              Not Installed
                            </Badge>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <p className="truncate text-xs text-muted-foreground">
                          {course.facultyName}
                        </p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {relatedCourses && relatedCourses.length > 0 && (
                <>
                  <h2 className="mt-8 text-xl font-bold">Related Courses</h2>
                  <div className="space-y-3">
                    {relatedCourses.map((course) => {
                      const isAvailable = models.some(
                        (model) =>
                          typeof course.model === 'object' &&
                          course.model !== null &&
                          'name' in course.model &&
                          model.name === (course.model as { name: string }).name,
                      )
                      return (
                        <Card
                          key={course.id}
                          className={`transition-colors ${isAvailable ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default opacity-70'}`}
                          onClick={() => isAvailable && setSelectedCourseId(course.id)}
                        >
                          <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-base">{course.name}</CardTitle>
                            <CardDescription className="flex items-center">
                              <Badge variant="outline" className="mr-2">
                                {course.code}
                              </Badge>
                              {!isAvailable && (
                                <Badge variant="outline" className="border-primary text-primary">
                                  Not Installed
                                </Badge>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="truncate text-xs text-muted-foreground">
                              {course.facultyName}
                            </p>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
