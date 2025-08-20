// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type React from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { AppMenu } from '@/components/app-menu'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { usePersonaStore } from '@/lib/store/persona-store'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activePersona, isFirstTime, personas } = usePersonaStore()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isStoreHydrated, setIsStoreHydrated] = useState(false)
  const [originalPath, setOriginalPath] = useState<string | null>(null)

  // Store the original path on initial render
  useEffect(() => {
    if (!originalPath && pathname) {
      setOriginalPath(pathname)
    }
  }, [pathname, originalPath])

  // Check if store is hydrated
  useEffect(() => {
    // Set a flag to indicate the store is hydrated after a short delay
    // This is necessary because Zustand's persist middleware needs time to hydrate
    const timer = setTimeout(() => {
      setIsStoreHydrated(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  // Handle redirects after store is hydrated
  useEffect(() => {
    if (!isStoreHydrated) return

    if (isFirstTime || !activePersona) {
      router.push('/')
    } else {
      setIsLoading(false)
    }
  }, [isFirstTime, activePersona, router, isStoreHydrated, originalPath])

  // Don't render the dashboard if no persona is selected or still loading
  if (!activePersona || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <SidebarInset className="flex h-screen w-full flex-col overflow-hidden">
              <header className="flex h-14 w-full shrink-0 items-center gap-2 border-b">
                <div className="flex flex-none items-center gap-2 px-3">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Breadcrumb className="min-w-0 flex-1">
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbPage className="line-clamp-1 font-semibold">
                          {personas.find((persona) => persona.id === activePersona)?.name}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              </header>
              <AppMenu
                activeItem={
                  pathname.startsWith('/workspace/assessment') ||
                  pathname.startsWith('/workspace/quiz')
                    ? 'Assessment'
                    : pathname.startsWith('/workspace/chat')
                      ? 'Chat'
                      : undefined
                }
              />
              <Separator />
              <main className="w-full flex-1 overflow-hidden">
                <div className="max-w-screen-3xl mx-auto flex h-full w-full flex-wrap justify-center gap-4">
                  {children}
                  {/* <div className="h-full overflow-auto w-full max-w-screen-xl flex-wrap justify-center gap-4">{children} */}
                </div>
              </main>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
