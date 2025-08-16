import { Building2, BookOpen, Presentation, User, Box } from 'lucide-react'
import type { PersonaType } from '@/lib/store/persona-store'

export function getPersonaIconComponent(
  personaId: PersonaType | 'none',
  size: 'sm' | 'md' | 'lg' = 'md',
  stroke: number = 2.0,
) {
  const iconSizes = {
    sm: { height: 16, width: 16 },
    md: { height: 20, width: 20 },
    lg: { height: 24, width: 24 },
  }

  const { height, width } = iconSizes[size]

  switch (personaId) {
    case 'faculty':
      return <Building2 strokeWidth={stroke} height={height} width={width} />
    case 'lecturer':
      return <Presentation strokeWidth={stroke} height={height} width={width} />
    case 'student':
      return <User strokeWidth={stroke} height={height} width={width} />
    default:
      return null
  }
}

export function getPersonaContextIconComponent(
  personaId: PersonaType | null,
  size: 'sm' | 'md' | 'lg' = 'md',
  stroke: number = 2.0,
) {
  const iconSizes = {
    sm: { height: 16, width: 16 },
    md: { height: 20, width: 20 },
    lg: { height: 24, width: 24 },
  }

  const { height, width } = iconSizes[size]

  switch (personaId) {
    case 'faculty':
      return <Box strokeWidth={stroke} height={height} width={width} />
    case 'lecturer':
      return <BookOpen strokeWidth={stroke} height={height} width={width} />
    case 'student':
      return <BookOpen strokeWidth={stroke} height={height} width={width} />
    default:
      return null
  }
}
