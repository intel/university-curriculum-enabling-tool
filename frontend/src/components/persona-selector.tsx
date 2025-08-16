'use client'

import { Check } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePersonaStore, type PersonaType } from '@/lib/store/persona-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getPersonaIconComponent } from './persona-icons'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface PersonaSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPersonaChange?: (persona: string) => void
}

export function PersonaSelector({ open, onOpenChange, onPersonaChange }: PersonaSelectorProps) {
  const { personas, activePersona, setActivePersona } = usePersonaStore()
  const router = useRouter()

  // Add loading state
  const [isLoading, setIsLoading] = useState(false)

  // Update the handlePersonaSelect function to show loading and handle redirection
  const handlePersonaSelect = (personaId: PersonaType) => {
    const persona = personas.find((p) => p.id === personaId)
    if (persona && persona.enabled) {
      setIsLoading(true)

      if (onPersonaChange) {
        onPersonaChange(personaId)
      } else {
        setActivePersona(personaId)
      }

      // Add a small delay to show loading state
      setTimeout(() => {
        // Redirect to the appropriate overview page for the new persona
        router.push(`/workspace/overview/${personaId}`)
        onOpenChange(false)
        setIsLoading(false)
      }, 1000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Switch Persona</DialogTitle>
          <DialogDescription>
            Select a persona to change your role and access different features
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className={cn(
                'flex items-center space-x-4 rounded-lg border p-4 transition-colors',
                persona.enabled
                  ? 'cursor-pointer hover:bg-accent'
                  : 'cursor-not-allowed opacity-60',
                activePersona === persona.id && 'border-primary bg-accent',
              )}
              role="button"
              tabIndex={0}
              onClick={() => handlePersonaSelect(persona.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handlePersonaSelect(persona.id)
                }
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                {getPersonaIconComponent(persona.id, 'lg')}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium leading-none">{persona.name}</p>
                  {!persona.enabled && <Badge variant="outline">Coming Soon</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{persona.description}</p>
              </div>
              {activePersona === persona.id && <Check className="h-5 w-5 text-primary" />}
            </div>
          ))}
        </div>
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
              <p className="text-sm font-medium">Switching persona...</p>
              <p className="text-xs text-muted-foreground">
                Verifying permissions and requirements
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
