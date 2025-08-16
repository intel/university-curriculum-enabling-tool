'use client'

import { Button } from '@/components/ui/button'
import { usePersonaStore } from '@/lib/store/persona-store'
import { FileSpreadsheet } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AssignmentPage() {
  const router = useRouter()
  const { activePersona } = usePersonaStore()

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
        <FileSpreadsheet strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
        <h1 className="mb-2 text-2xl font-bold">Examination Generator</h1>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          We&lsquo;re working on adding slides functionality to help you generate comprehensive
          final examinations with various question types and difficulty levels. Check back soon!
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
