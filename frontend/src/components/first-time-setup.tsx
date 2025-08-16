'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Loader2, GraduationCap } from 'lucide-react'
import { usePersonaStore, type PersonaType } from '@/lib/store/persona-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getPersonaIconComponent } from '@/components/persona-icons'
import { motion } from 'framer-motion'

export function FirstTimeSetup() {
  const router = useRouter()
  const {
    personas,
    activePersona,
    isFirstTime,
    setActivePersona,
    completeFirstTimeSetup,
    setSelectedCourseId,
  } = usePersonaStore()
  const [selectedPersona, setSelectedPersona] = useState<PersonaType | null>(null)
  const [canContinue, setCanContinue] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    // Reset canContinue when persona changes
    setCanContinue(!!selectedPersona)
  }, [selectedPersona])

  const handlePersonaSelect = (personaId: PersonaType) => {
    const persona = personas.find((p) => p.id === personaId)
    if (persona && persona.enabled) {
      setSelectedPersona(personaId)
      setCanContinue(true)
    }
  }
  // Update the handleComplete function to show loading state
  const handleComplete = () => {
    if (selectedPersona && !isNavigating) {
      setIsNavigating(true)

      // Set the active persona in the store
      setActivePersona(selectedPersona)

      // reset selected course and model
      setSelectedCourseId(0) // or use null if the type allows

      // Mark first-time setup as complete
      completeFirstTimeSetup()

      // Force a small delay to ensure state is updated before navigation
      // This also gives time to show the loading state
      setTimeout(() => {
        // Redirect to the appropriate dashboard based on persona
        switch (selectedPersona) {
          case 'faculty':
            router.push('/workspace/overview/faculty')
            break
          case 'lecturer':
            router.push('/workspace/overview/lecturer')
            break
          case 'student':
            router.push('/workspace/overview/student')
            break
          default:
            router.push('/workspace/overview')
        }
      }, 200)
    }
  }

  // If not first time and has active persona, redirect to dashboard
  useEffect(() => {
    if (!isFirstTime && activePersona) {
      // Only redirect if we're on the root path
      // This prevents redirects when already on dashboard pages
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        router.push('/workspace/overview')
      }
    }
  }, [isFirstTime, activePersona, router])

  // If not first time setup, don't render this page
  if (!isFirstTime && activePersona) {
    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-background shadow-lg"
      >
        <div className="p-4 sm:p-6">
          <div className="mb-6 flex items-center justify-center">
            <div className="rounded-md bg-primary/10 p-2">
              <div className="rounded-md bg-primary p-2 text-primary-foreground">
                <GraduationCap strokeWidth={1.2} className="h-8 w-8" />
              </div>
            </div>
            <h1 className="ml-4 text-3xl font-bold">University Curriculum Enabling Tool</h1>
          </div>

          <div className="px-4">
            <h2 className="mb-0 text-center text-lg font-semibold">Choose Your Persona</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Select a persona that best matches your role to experience AI-powered RAG tool
            </p>

            <div className="mx-auto max-w-xl space-y-4">
              {personas
                .filter((persona) => !persona.hidden)
                .map((persona) => (
                  <motion.div
                    key={persona.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'flex min-h-[110px] items-center space-x-4 rounded-lg border p-4 transition-colors',
                      persona.enabled
                        ? 'cursor-pointer hover:bg-accent'
                        : 'cursor-not-allowed opacity-60',
                      selectedPersona === persona.id && 'border-primary bg-accent',
                    )}
                    onClick={() => persona.enabled && handlePersonaSelect(persona.id)}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      {getPersonaIconComponent(persona.id, 'lg')}
                    </div>
                    <div className="flex-1 space-y-0">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-medium">{persona.name}</p>
                        {selectedPersona === persona.id && (
                          <Check className="mr-4 h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{persona.description}</p>
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>

          {/* Navigation dots */}
          <div className="mt-8 flex justify-end">
            <Button onClick={handleComplete} disabled={!canContinue || isNavigating}>
              {isNavigating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Add loading overlay when navigating */}
        {isNavigating && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
              <p className="text-sm font-medium">Setting up your account...</p>
              <p className="text-xs text-muted-foreground">
                Verifying permissions and requirements
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
