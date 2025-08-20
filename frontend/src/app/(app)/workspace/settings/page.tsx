// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Button } from '@/components/ui/button'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Settings2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const { activePersona } = usePersonaStore()

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
        <Settings2 strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
        <h1 className="mb-2 text-2xl font-bold">Settings Coming Soon</h1>
        <p className="mb-6 max-w-xs text-sm text-muted-foreground">
          We&lsquo;re working on adding settings functionality to help you customize your
          experience. Check back soon!
        </p>
        <Button
          onClick={() => router.push(`/workspace/overview/${activePersona}`)}
          className="flex items-center"
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  )
}
