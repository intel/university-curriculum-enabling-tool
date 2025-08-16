import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define path exclusions for each persona type
const PERSONA_EXCLUSIONS = {
  faculty: [], // Faculty can access everything
  lecturer: [
    '/workspace/overview/faculty',
    '/workspace/overview/student',
    '/workspace/model',
    '/workspace/courses/create',
    '/workspace/courses/edit',
    '/workspace/programmes/create',
    '/workspace/quiz/practice',
  ],
  student: [
    '/workspace/overview/faculty',
    '/workspace/overview/lecturer',
    '/workspace/model',
    '/workspace/courses/create',
    '/workspace/courses/edit',
    '/workspace/programmes/create',
    '/workspace/quiz/generate',
  ],
}

export function middleware(request: NextRequest) {
  // Get the pathname from the URL
  const { pathname } = request.nextUrl

  try {
    const activePersonaEnv = (process.env.PERSONA || 'faculty') as keyof typeof PERSONA_EXCLUSIONS

    // Check if the current path is excluded for the active persona
    const isExcluded = PERSONA_EXCLUSIONS[activePersonaEnv]?.some((path) =>
      pathname.startsWith(path),
    )

    // If the path is excluded for this persona, redirect to not-authorized page
    if (isExcluded) {
      return NextResponse.rewrite(new URL('/not-available', request.url))
    }

    // Allow access to the requested route
    return NextResponse.next()
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.next()
  }
}
