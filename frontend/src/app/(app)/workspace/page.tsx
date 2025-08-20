// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useSources } from '@/lib/hooks/use-sources'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileCheck, MessageSquareText, FileQuestion, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import useChatStore from '@/lib/store/chat-store'

export default function OverviewPage() {
  const { isLoading, isError } = useSources()
  const chats = useChatStore((state) => state.chats)

  // Convert chats object to an array of chats
  const chatArray = Object.keys(chats).map((key) => ({
    id: key,
    ...chats[key],
  }))

  const renderCardContent = (value: number | string) => {
    if (isLoading) {
      return <Skeleton className="h-8 w-20" />
    }
    if (isError) {
      return <div className="text-destructive">Error</div>
    }
    return <div className="text-2xl font-bold">{value}</div>
  }

  return (
    <div className="container mx-auto p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chats</CardTitle>
            <MessageSquareText strokeWidth={1.0} className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>{renderCardContent(chatArray.length)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Summaries</CardTitle>
            <FileText strokeWidth={1.0} className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>{renderCardContent(0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quizzes</CardTitle>
            <FileCheck strokeWidth={1.0} className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>{renderCardContent(0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FAQs</CardTitle>
            <FileQuestion strokeWidth={1.0} className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>{renderCardContent(0)}</CardContent>
        </Card>
      </div>
    </div>
  )
}
