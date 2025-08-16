import React from 'react'

import { RefreshCw } from 'lucide-react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { getPersonaIconComponent } from '@/components/persona-icons'
import { PersonaSelector } from '@/components/persona-selector'
import { Button } from '@/components/ui/button'

export function AppPersona({
  user,
}: {
  user: {
    email: string
  }
}) {
  const { personas, activePersona } = usePersonaStore()
  const [personaSelectorOpen, setPersonaSelectorOpen] = React.useState(false)

  const currentPersona = personas.find((p) => p.id === activePersona)

  return (
    <>
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center space-x-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-sidebar-border">
            {/* {currentPersona && <>{getPersonaIconComponent(currentPersona?.id, 5, 1.4)}</>} */}
            {currentPersona && <>{getPersonaIconComponent(activePersona, 'sm')}</>}
          </div>
          <div>
            <p className="text-sm font-medium">{currentPersona?.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button
          disabled
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={() => setPersonaSelectorOpen(true)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <PersonaSelector open={personaSelectorOpen} onOpenChange={setPersonaSelectorOpen} />
    </>
  )
}
