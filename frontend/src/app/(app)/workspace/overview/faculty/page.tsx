// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

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
import { Plus, BookOpen, Box, Tag } from 'lucide-react'
import { useModelStore } from '@/lib/store/model-store'
import { useCourses } from '@/lib/hooks/use-courses'
import { useProgrammes } from '@/lib/hooks/use-programmes'

export default function FacultyOverviewPage() {
  const router = useRouter()
  const { data: coursesData, isLoading: isCourseLoading } = useCourses()
  const { data: programmesData, isLoading: isProgrammesLoading } = useProgrammes()
  const { models } = useModelStore()

  if (isCourseLoading || isProgrammesLoading) {
    return (
      <div className="container mx-auto flex h-full w-full flex-col px-6">
        {/* Skeleton for Dashboard Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="mb-2 mt-2 text-lg font-bold">
            <div className="h-6 w-1/4 rounded bg-muted"></div>
          </h2>
        </div>

        {/* Skeleton for Stats Cards */}
        <div className="mb-8 mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <div className="h-4 w-1/2 rounded bg-muted"></div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 h-8 w-1/3 rounded bg-muted"></div>
              <div className="h-3 w-2/3 rounded bg-muted"></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <div className="h-4 w-1/2 rounded bg-muted"></div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 h-8 w-1/3 rounded bg-muted"></div>
              <div className="h-3 w-2/3 rounded bg-muted"></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <div className="h-4 w-1/2 rounded bg-muted"></div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 h-8 w-1/3 rounded bg-muted"></div>
              <div className="h-3 w-2/3 rounded bg-muted"></div>
            </CardContent>
          </Card>
        </div>

        {/* Skeleton for Courses List */}
        <h2 className="mb-4 mt-6 text-lg font-bold">
          <div className="h-6 w-1/4 rounded bg-muted"></div>
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-md max-w-[350px] truncate">
                    <div className="h-4 w-3/4 rounded bg-muted"></div>
                  </CardTitle>
                  <Badge variant="outline">
                    <span className="inline-block h-4 w-12 rounded bg-muted" />
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">
                  <div className="mt-2 h-3 w-full rounded bg-muted"></div>
                  <div className="mt-1 h-3 w-5/6 rounded bg-muted"></div>
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div className="h-4 w-16 rounded bg-muted"></div>
                  </div>
                  <div className="flex items-center">
                    <div className="h-4 w-16 rounded bg-muted"></div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <div className="h-8 w-full rounded bg-muted"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (coursesData?.docs?.length === 0) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <BookOpen strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">Create Your First Course</h1>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            You have not created any courses yet. Create your first course to get started.
          </p>
          <Button
            onClick={() => router.push('/workspace/courses/create')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Create Course
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
          <div className="mb-4 flex items-center justify-between">
            <div className="justify-left flex flex-col">
              <h1 className="text-lg font-bold">Faculty Dashboard</h1>
            </div>
            <Button
              onClick={() => router.push('/workspace/courses/create')}
              className="flex items-center"
            >
              <Plus className="h-4 w-4" />
              Create Course
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{coursesData?.docs?.length || 0}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Active courses in all faculties
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Available Models
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{models.length}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  AI models available for courses
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Programmes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{programmesData?.docs?.length || 0}</div>
                <p className="mt-1 text-xs text-muted-foreground">Academic programmes created</p>
              </CardContent>
            </Card>
          </div>

          {/* Courses List */}
          <h2 className="mb-4 text-lg font-bold">Courses</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {coursesData?.docs.map((course) => (
              <Card key={course.id} className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-md max-w-[350px] truncate">{course.name}</CardTitle>
                    <Badge variant="outline">{course.code}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <Tag className="mr-1 h-4 w-4 text-muted-foreground" />
                      <span>{course.version}</span>
                    </div>
                    <div className="flex items-center">
                      <Box className="mr-1 h-4 w-4 text-muted-foreground" />
                      <span>
                        {typeof course.model === 'object' &&
                        course.model !== null &&
                        'name' in course.model
                          ? (course.model as { name: string }).name
                          : 'unavailable'}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => router.push(`/workspace/courses`)}
                  >
                    Manage Course
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
