// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { ChatLayout } from '@/components/chat/chat-layout'
import React, { useRef } from 'react'
import { notFound, useRouter } from 'next/navigation'
import useChatStore from '@/lib/store/chat-store'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useContextAvailability } from '@/lib/hooks/use-context-availability'
import { useCourses } from '@/lib/hooks/use-courses'
import { Skeleton } from '@/components/ui/skeleton'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { data: coursesData, isLoading: isCourseLoading } = useCourses()
  const unwrappedParams = React.use(params)
  const id = unwrappedParams.id
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { activePersona, selectedCourseId } = usePersonaStore()
  const { getActiveContextModelName } = useContextAvailability()

  const modelName = getActiveContextModelName()
  const getChatById = useChatStore((state) => state.getChatById)
  const chat = getChatById(id)

  const selectedCourse = coursesData?.docs?.find((course) => course.id === selectedCourseId)
  if (isCourseLoading) {
    return (
      <main className="w-full max-w-3xl space-y-6 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="h-8 w-8">
              <Skeleton className="h-full w-full rounded-full" />
            </div>
            <div className="ml-2 h-6 w-32">
              <Skeleton className="h-full w-full rounded-md" />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      </main>
    )
  }

  if (!chat) {
    return notFound()
  }

  return (
    <main className="w-full max-w-3xl space-y-0 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/workspace/chat/history')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-md ml-2 font-bold">{`${activePersona === 'faculty' ? modelName : selectedCourse?.name}`}</h1>
        </div>
      </div>

      <ChatLayout key={id} id={id} initialMessages={chat.messages} selectedModel={modelName} />
      <div ref={messagesEndRef} />
    </main>
  )
}
