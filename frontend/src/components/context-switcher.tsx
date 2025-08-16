'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Plus, X, Box, Settings2, BookOpen } from 'lucide-react'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useModelStore } from '@/lib/store/model-store'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { getPersonaContextIconComponent } from './persona-icons'
import { useModels } from '@/lib/hooks/use-models'
import { useCourses } from '@/lib/hooks/use-courses'
import { Course } from '@/payload-types'

export function ContextSwitcher() {
  const router = useRouter()
  const { data: coursesData } = useCourses()
  const { personas, activePersona, selectedCourseId, setSelectedCourseId } = usePersonaStore()
  const { mutate } = useModels()
  const { models, selectedModel, setSelectedModel } = useModelStore()
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const commandRef = useRef<HTMLDivElement>(null)

  const activePersonaObj = personas.find((p) => p.id === activePersona)

  // Fetch models
  useEffect(() => {
    mutate()
  }, [mutate])

  // Handle clicks outside to close the command menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandRef.current && !commandRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Get the active course or model name for display
  const getActiveItemName = () => {
    if (activePersona === 'faculty') {
      const model = models.find((m) => m.name === selectedModel)
      return model ? model.name : 'Select model...'
    } else {
      const course: Course | undefined = coursesData?.docs
        .filter(
          (c) =>
            c.model &&
            typeof c.model === 'object' &&
            'name' in c.model &&
            models.some((model) => model.name === (c.model as { name: string }).name),
        )
        .find((c) => c.id === selectedCourseId)

      // setSelectedCourseId(course ? course?.id : "");
      return course ? course.name : 'Select course...'
    }
  }

  // Get the subtitle for the selected item
  const getActiveItemSubtitle = () => {
    if (activePersona === 'faculty') {
      const model = models.find((m) => m.name === selectedModel)
      return model ? model.details.parameter_size : ''
    } else {
      const course: Course | undefined = coursesData?.docs
        .filter(
          (c) =>
            c.model &&
            typeof c.model === 'object' &&
            'name' in c.model &&
            models.some((model) => model.name === (c.model as { name: string }).name),
        )
        .find((c) => c.id === selectedCourseId)
      return course ? `${course.code} • ${course.version}` : ''
    }
  }

  const handleCourseSelect = (courseId: number) => {
    setSelectedCourseId(courseId)
    setOpen(false)
  }

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId)
    setOpen(false)
  }

  const handleManageModels = () => {
    router.push('/workspace/model')
    setOpen(false)
  }

  const handleManageCourses = () => {
    router.push('/workspace/courses')
    setOpen(false)
  }

  const handleAddCourse = () => {
    router.push('/workspace/courses/add')
    setOpen(false)
  }

  return (
    <div className="relative w-full pl-2" ref={commandRef}>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between py-5"
        onClick={() => setOpen(!open)}
      >
        <div className="flex w-full min-w-0 items-center gap-2">
          {/* <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-border bg-primary">
                {activePersonaObj && <>{getPersonaContextIconComponent(activePersonaObj.id, "md")}</>}
              </div> */}
          {activePersonaObj && (
            <div className="flex-shrink-0">
              {getPersonaContextIconComponent(activePersonaObj.id, 'md')}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span className="w-full truncate text-sm font-medium">{getActiveItemName()}</span>
            <span className="w-full truncate text-xs text-muted-foreground">
              {getActiveItemSubtitle()}
            </span>
          </div>
        </div>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full">
          <Command className="min-w-[240px] rounded-lg border shadow-md">
            {/* // <div className="absolute top-full left-0 z-50 mt-1" style={{ minWidth: "100%", width: "max-content" }}>
        //   <Command className="rounded-lg border shadow-md min-w-[300px]"> */}
            <div className="flex items-center border-b px-3">
              <CommandInput
                placeholder={`Search ${activePersona === 'faculty' ? 'models' : 'courses'}`}
                value={inputValue}
                onValueChange={setInputValue}
                className="h-9"
              />
              {inputValue && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setInputValue('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <CommandList className="max-h-[300px] overflow-x-hidden">
              <CommandEmpty>
                No {activePersona === 'faculty' ? 'models' : 'courses'} found.
              </CommandEmpty>

              {activePersona === 'faculty' ? (
                // Models for Faculty
                <CommandGroup heading="Models">
                  {models.length > 0 ? (
                    models.map((model) => (
                      <CommandItem
                        key={model.name}
                        onSelect={() => handleModelSelect(model.name)}
                        className="flex cursor-pointer items-center py-2"
                      >
                        <Box className="mr-2 h-4 w-4 flex-shrink-0 text-primary" />
                        <div className="flex flex-1 flex-col truncate">
                          <span className="truncate font-medium">{model.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {model.details.parameter_size}
                          </span>
                        </div>
                        {model.name === selectedModel && (
                          <Check className="ml-2 h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </CommandItem>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No models available
                    </div>
                  )}
                </CommandGroup>
              ) : (
                // Courses for Student/Lecturer
                <CommandGroup heading="Courses">
                  {(coursesData?.docs ?? []).length > 0 ? (
                    coursesData?.docs
                      .filter((course: Course) =>
                        models.some(
                          (model) =>
                            typeof course.model === 'object' &&
                            course.model !== null &&
                            'name' in course.model &&
                            model.name === course.model.name,
                        ),
                      )
                      .map((course) => (
                        <CommandItem
                          key={course.id}
                          onSelect={() => handleCourseSelect(course.id)}
                          className="flex cursor-pointer items-center py-2"
                        >
                          <BookOpen className="mr-2 h-4 w-4 flex-shrink-0 text-primary" />
                          <div className="flex flex-1 flex-col truncate">
                            <span className="truncate font-medium">{course.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {course.code} • {course.version}
                            </span>
                          </div>
                          {course.id === selectedCourseId && (
                            <Check className="ml-2 h-4 w-4 flex-shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      ))
                  ) : (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No courses available
                    </div>
                  )}
                </CommandGroup>
              )}

              <CommandSeparator />

              {activePersona === 'faculty' ? (
                <CommandGroup heading="Actions">
                  <CommandItem onSelect={handleManageModels} className="cursor-pointer">
                    <Settings2 className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Manage Models</span>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <CommandGroup heading="Actions">
                  <CommandItem onSelect={handleManageCourses} className="cursor-pointer">
                    <Settings2 className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Manage Courses</span>
                  </CommandItem>
                  <CommandItem onSelect={handleAddCourse} className="cursor-pointer">
                    <Plus className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>Add New Course</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
