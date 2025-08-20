// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Loader2,
  X,
  Trash2,
  Edit2,
  Save,
  RefreshCw,
  FolderOpen,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/utils'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Model {
  id: string
  fileName: string
  courseName: string
  fileSize: number
  isEditing?: boolean
}

export default function AddModelPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const prevModelCount = useRef(0) // Track the previous model count

  // Fetch models on initial load
  useEffect(() => {
    fetchModels()
  }, [])

  // Function to fetch models from the backend
  const fetchModels = async () => {
    setIsFetching(true)
    try {
      const response = await fetch('/api/add_gguf_model', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch models')
      }

      const data = await response.json()
      const modelList = data.files.map(
        (file: { fileName: string; fileSize: number }, index: number) => {
          // Ensure the fileName always ends with .gguf
          const fileName = file.fileName.endsWith('.gguf') ? file.fileName : `${file.fileName}.gguf`

          return {
            id: `${index}`, // Generate a unique ID for each model
            fileName, // Use the validated fileName
            courseName: fileName.replace('.gguf', ''), // Set courseName to the file name without the .gguf extension
            fileSize: file.fileSize, // Use the fileSize from the API response
          }
        },
      )

      setModels(modelList)
      setLastUpdated(new Date())

      if (modelList.length !== prevModelCount.current) {
        prevModelCount.current = modelList.length // Update the previous count
        if (modelList.length > 0) {
          toast.success(`${modelList.length} model${modelList.length > 1 ? 's' : ''} found!`)
        } else {
          toast.info('No models found in the directory')
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error)
      toast.error('Failed to fetch models. Please try again.')
    } finally {
      setIsFetching(false)
    }
  }

  const toggleEditMode = (id: string) => {
    setModels(
      models.map((model) => (model.id === id ? { ...model, isEditing: !model.isEditing } : model)),
    )
  }

  const updateCourseName = (id: string, newName: string) => {
    setModels(models.map((model) => (model.id === id ? { ...model, courseName: newName } : model)))
  }

  const removeModel = (id: string) => {
    setModels(models.filter((model) => model.id !== id))
  }

  const handleSaveChanges = async () => {
    setIsLoading(true)

    console.log('Saving models:', models)

    try {
      const response = await fetch('/api/add_gguf_model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ models }),
      })

      if (!response.ok) {
        throw new Error('Failed to update models')
      }

      toast.success('Models saved successfully!')
    } catch (error) {
      console.error('Error updating models:', error)
      toast.error('Failed to save changes. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatLastUpdated = () => {
    if (!lastUpdated) return null
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(lastUpdated)
  }

  return (
    <div className="flex h-full w-full flex-col px-16 py-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold">Manage Course Models</h1>
          <p className="text-sm text-muted-foreground">
            Configure .gguf model files for your courses
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => router.push('/workspace/courses')}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="flex h-full flex-col md:flex-row">
          {/* Left side - Instructions */}
          <div className="flex-1 space-y-4 p-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Step 1: Add Model Files</h3>
            </div>

            <div className="rounded-md border bg-muted/50 p-3">
              <p className="mb-2 text-sm">Place your .gguf model files in this directory:</p>
              <code className="block overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1 font-mono text-xs">
                /models
              </code>

              <Alert className="mt-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
                <AlertDescription className="flex items-start text-xs text-amber-700 dark:text-amber-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1 mt-0.5 flex-shrink-0"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                    <path d="M12 9v4"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <span>
                    Models must be located in the correct directory to be detected by the system.
                  </span>
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Step 2: Refresh Model List</h3>
            </div>

            <div className="flex items-center">
              <Button
                onClick={fetchModels}
                disabled={isFetching}
                variant="outline"
                className="mr-3"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Scan Directory
                  </>
                )}
              </Button>

              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Last updated: {formatLastUpdated()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-4">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Step 3: Configure & Save</h3>
            </div>

            <p className="text-sm text-muted-foreground">
              Review the detected models, edit course names if needed, and save your changes.
            </p>
          </div>

          {/* Separator */}
          <div className="hidden md:block">
            <Separator orientation="vertical" className="h-full" />
          </div>

          <div className="px-4 md:hidden">
            <Separator className="w-full" />
          </div>

          {/* Right side - Model list */}
          <div className="flex-1 space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Detected Models</h3>
              <Badge variant="outline">
                {models.length} {models.length === 1 ? 'model' : 'models'}
              </Badge>
            </div>

            {models.length > 0 ? (
              <div className="h-[calc(100vh-240px)] space-y-2 overflow-y-auto pr-1">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="rounded-md border bg-background p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {model.fileName}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {formatBytes(model.fileSize)} {/* Display the formatted file size */}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          {model.isEditing ? (
                            <Input
                              value={model.courseName}
                              onChange={(e) => updateCourseName(model.id, e.target.value)}
                              className="w-full"
                            />
                          ) : (
                            <h4 className="font-medium">{model.courseName}</h4>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleEditMode(model.id)}
                          >
                            {model.isEditing ? (
                              <Save className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeModel(model.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive/90"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[calc(100vh-240px)] flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 text-muted-foreground">
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="mb-1 text-center">No models detected</p>
                <p className="text-center text-xs">
                  Place your .gguf files in the models directory and click &quot;Scan
                  Directory&quot;
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button
          variant="outline"
          onClick={() => router.push('/workspace/courses')}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          {models.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Edit course names as needed before saving
            </p>
          )}
          <Button onClick={handleSaveChanges} disabled={models.length === 0 || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Add Models
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
