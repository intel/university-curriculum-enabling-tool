// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PersonaType = 'faculty' | 'lecturer' | 'student' | ''
export type PersonaViewType = 'default' | 'limited' | ''

export interface Persona {
  id: PersonaType
  name: string
  description: string
  enabled: boolean
  hidden: boolean
}

interface PersonaStore {
  personas: Persona[]
  personaView: PersonaViewType | ''
  appPersona: PersonaType | ''
  activePersona: PersonaType | ''
  isFirstTime: boolean
  selectedCourseId: number | null
  // Language preferences per persona (en = English, id = Bahasa Indonesia)
  languageByPersona: Partial<Record<PersonaType, 'en' | 'id'>>
  getPersonaLanguage: (persona?: PersonaType | '') => 'en' | 'id'
  setPersonaLanguage: (persona: PersonaType, lang: 'en' | 'id') => void
  setActivePersona: (persona: PersonaType) => void
  completeFirstTimeSetup: () => void
  setSelectedCourseId: (course: number) => void
}
export const usePersonaStore = create<PersonaStore>()(
  persist(
    (set, get) => ({
      personas: [],
      personaView: (process.env.NEXT_PUBLIC_PERSONA_VIEW as PersonaViewType) || 'default',
      appPersona: (process.env.NEXT_PUBLIC_PERSONA as PersonaType) || 'faculty',
      activePersona: '',
      isFirstTime: true,
      selectedCourseId: null,
      languageByPersona: {
        faculty: 'en',
        lecturer: 'en',
        student: 'en',
      },
      getPersonaLanguage: (persona?: PersonaType | ''): 'en' | 'id' => {
        const key = (persona || get().activePersona) as PersonaType
        return (get().languageByPersona[key] ?? 'en') as 'en' | 'id'
      },
      setPersonaLanguage: (persona: PersonaType, lang: 'en' | 'id') => {
        set((state) => ({
          languageByPersona: {
            ...state.languageByPersona,
            [persona]: lang,
          },
        }))
      },
      setActivePersona: (persona: PersonaType) => {
        set({ activePersona: persona })
      },
      completeFirstTimeSetup: () => {
        set({ isFirstTime: false })
      },
      setSelectedCourseId: (course: number) => {
        set({ selectedCourseId: course })
      },
    }),
    {
      name: 'persona-storage',
      partialize: (state) => ({
        activePersona: state.activePersona,
        isFirstTime: state.isFirstTime,
        selectedCourseId: state.selectedCourseId,
        languageByPersona: state.languageByPersona,
      }),
    },
  ),
)

// Update personas based on personaView and appPersona
const updatePersonasVisibility = () => {
  const store = usePersonaStore.getState()
  const { personaView, appPersona } = store
  const personas: Persona[] = [
    {
      id: 'faculty',
      name: 'Curriculum Builder',
      description: 'For faculty to build content and fine tune content for every courses',
      enabled: true,
      hidden:
        appPersona === 'faculty' && personaView === 'default'
          ? false
          : appPersona === 'faculty' && personaView === 'limited'
            ? false
            : appPersona !== 'faculty',
    },
    {
      id: 'lecturer',
      name: 'Expert Advisor',
      description:
        'For lecturer to customize and build their teaching material and other resources to aid their course delivery',
      enabled: true,
      hidden:
        appPersona === 'faculty' && personaView === 'default'
          ? false
          : appPersona === 'faculty' && personaView === 'limited'
            ? true
            : appPersona !== 'lecturer',
    },
    {
      id: 'student',
      name: 'Learning Companion',
      description:
        'For student to use learn and practice their learning within and beyond the content deliver by lecturer',
      enabled: true,
      hidden:
        appPersona === 'faculty' && personaView === 'default'
          ? false
          : appPersona === 'faculty' && personaView === 'limited'
            ? true
            : appPersona !== 'student',
    },
  ]

  // personas.forEach(persona => {
  //   console.log(`Persona: ${persona.name}, Hidden: ${persona.hidden}`)
  // })

  usePersonaStore.setState({ personas })
}

updatePersonasVisibility()
