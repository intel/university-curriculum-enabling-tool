// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { usePersonaStore } from '@/lib/store/persona-store'

export default function OverviewPage() {
  const router = useRouter()
  const { activePersona } = usePersonaStore()

  useEffect(() => {
    // Redirect to persona-specific overview pages
    if (activePersona === 'faculty') {
      router.push('/workspace/overview/faculty')
    } else if (activePersona === 'lecturer') {
      router.push('/workspace/overview/lecturer')
    } else if (activePersona === 'student') {
      router.push('/workspace/overview/student')
    }
  }, [activePersona, router])

  return (
    <div className="flex h-[calc(100vh-200px)] items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
    </div>
  )
}
