import type { ReactNode } from 'react'
import { BookOpen, Box } from 'lucide-react'

type IconSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Utility function to get the appropriate icon based on the user's persona context
 *
 * @param persona - The active persona ("faculty", "student", "lecturer")
 * @param size - Optional size parameter ("sm" | "md" | "lg")
 * @returns The appropriate icon component
 */
export function getContextIcon(
  persona: string,
  size: IconSize = 'md',
  strokeWidth: number = 2.0,
): ReactNode {
  const iconSizes = {
    sm: { height: 16, width: 16 },
    md: { height: 20, width: 20 },
    lg: { height: 24, width: 24 },
    xl: { height: 28, width: 28 },
  }

  const { height, width } = iconSizes[size]

  // Faculty uses model icon, others use course icon
  if (persona === 'faculty') {
    return <Box strokeWidth={strokeWidth} className={`h-${height} w-${width}`} />
  } else {
    return <BookOpen strokeWidth={strokeWidth} className={`h-${height} w-${width}`} />
  }
}
