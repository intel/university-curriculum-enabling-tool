'use client'

// import * as React from "react"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { usePersonaStore } from '@/lib/store/persona-store'
import {
  BookOpen,
  Cog,
  FileCheck,
  FileText,
  LayoutDashboard,
  LibraryBig,
  MessagesSquare,
  Presentation,
} from 'lucide-react'

// interface MenuItem {
//   name: string
//   href: string
// }

// const initialMenuItems: MenuItem[] = [
//   { name: "Overview", href: "/workspace" },
//   { name: "Chat", href: "/workspace/chat" },
//   { name: "Summary", href: "/workspace/summary" },
//   { name: "Quiz", href: "/workspace/quiz" },
//   { name: "FAQ", href: "/workspace/faq" },
// ]

interface MenuItem {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  personas: string[]
}

export function AppMenu({ activeItem }: { activeItem?: string }) {
  // const [menuItems, setMenuItems] = useState(initialMenuItems)
  const pathname = usePathname()
  const { activePersona } = usePersonaStore()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  useEffect(() => {
    // Define all possible menu items
    const allMenuItems: MenuItem[] = [
      {
        id: 'overview',
        label: 'Overview',
        href: `/workspace/overview/${activePersona}`,
        icon: <LayoutDashboard className="h-4 w-4" />,
        personas: ['faculty', 'lecturer', 'student'],
      },
      {
        id: 'model',
        label: 'Model',
        href: '/workspace/model',
        icon: <BookOpen className="h-4 w-4" />,
        personas: ['faculty'],
      },
      {
        id: 'courses',
        label: 'Courses',
        href: '/workspace/courses',
        icon: <BookOpen className="h-4 w-4" />,
        personas: ['faculty', 'lecturer', 'student'],
      },
      {
        id: 'programmes',
        label: 'Programmes',
        href: '/workspace/programmes',
        icon: <LibraryBig className="h-4 w-4" />,
        personas: ['faculty'],
      },
      {
        id: 'chat',
        label: 'Chat',
        href: '/workspace/chat',
        icon: <MessagesSquare className="h-4 w-4" />,
        personas: ['faculty', 'lecturer', 'student'],
      },
      {
        id: 'summary',
        label: 'Summary',
        href: '/workspace/summary',
        icon: <FileText className="h-4 w-4" />,
        personas: ['lecturer', 'student'],
      },
      {
        id: 'faq',
        label: 'FAQ',
        href: '/workspace/faq',
        icon: <FileCheck className="h-4 w-4" />,
        personas: ['lecturer', 'student'],
      },
      {
        id: 'quiz',
        label: 'Quiz',
        href: '/workspace/quiz/practice',
        icon: <FileCheck className="h-4 w-4" />,
        personas: ['student'],
      },
      {
        id: 'slide',
        label: 'Slide',
        href: '/workspace/slide',
        icon: <Presentation className="h-4 w-4" />,
        personas: ['lecturer'],
      },
      {
        id: 'assessment',
        label: 'Assessment',
        href: '/workspace/assessment',
        icon: <FileText className="h-4 w-4" />,
        personas: ['lecturer'],
      },
      {
        id: 'settings',
        label: 'Settings',
        href: `/workspace/settings${activePersona ? `?persona=${activePersona}` : ''}`,
        icon: <Cog className="h-4 w-4" />,
        personas: ['faculty', 'lecturer', 'student'],
      },
      {
        id: 'study-plan',
        label: 'Study Plan',
        href: '/workspace/study-plan',
        icon: <FileCheck className="h-4 w-4" />,
        personas: ['student'],
      },
      // {
      //   id: "examination",
      //   label: "Examination",
      //   href: "/workspace/examination/generate",
      //   icon: <FileSpreadsheet className="h-4 w-4" />,
      //   personas: ["lecturer"],
      // },
    ]

    // Filter menu items based on active persona
    if (activePersona) {
      const filteredItems = allMenuItems.filter((item) => item.personas.includes(activePersona))
      setMenuItems(filteredItems)
    }
  }, [activePersona])

  return (
    <div className="relative m-2 ml-8">
      <ScrollArea className="max-w-[calc(100vw-2rem)]">
        <div className="flex space-x-4">
          {menuItems.map((item) => {
            const isActive = pathname.startsWith(item.href) || item.label === activeItem
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-none rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-primary',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
