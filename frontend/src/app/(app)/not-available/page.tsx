// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { usePersonaStore } from '@/lib/store/persona-store'
import { ArrowLeft, PackageX } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function NotAvailablePage() {
  const router = useRouter()
  const { activePersona } = usePersonaStore()

  const getPersonaName = () => {
    switch (activePersona) {
      case 'faculty':
        return 'Faculty'
      case 'lecturer':
        return 'Lecturer'
      case 'student':
        return 'Student'
      default:
        return 'User'
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <PackageX className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Feature Not Available</CardTitle>
          <CardDescription>This feature is not available in your current view.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p>
            This feature is not enabled for the {getPersonaName()} view. You can return to the
            dashboard or switch to a different view to access other available features.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            onClick={() => router.push(`/workspace/overview/${activePersona}`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
