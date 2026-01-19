// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Settings2, ArrowLeft, Server, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activePersona, appPersona, setActivePersona, getPersonaLanguage, setPersonaLanguage } =
    usePersonaStore()

  type P = 'faculty' | 'lecturer' | 'student'
  const isPersona = (v: unknown): v is P => v === 'faculty' || v === 'lecturer' || v === 'student'
  const qp = searchParams.get('persona')
  const persona: P = isPersona(qp)
    ? qp
    : isPersona(activePersona)
      ? activePersona
      : isPersona(appPersona)
        ? appPersona
        : 'faculty'
  const currentLang = getPersonaLanguage(persona)
  useEffect(() => {
    if (activePersona !== persona) {
      setActivePersona(persona)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona])

  // Language settings state
  const [pendingLang, setPendingLang] = useState<'en' | 'id' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // LLM Configuration state
  const [providerType, setProviderType] = useState<'ollama' | 'ovms'>('ovms')
  const [originalProviderType, setOriginalProviderType] = useState<'ollama' | 'ovms'>('ovms')
  const [llmURL, setLlmURL] = useState<string>('http://localhost:5950')
  const [originalLlmURL, setOriginalLlmURL] = useState<string>('http://localhost:5950')
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [detectedProvider, setDetectedProvider] = useState<string>('')
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)

  const title = useMemo(() => {
    if (persona === 'lecturer') return 'Lecturer Settings'
    if (persona === 'student') return 'Student Settings'
    return 'Faculty Settings'
  }, [persona])

  // Load LLM configuration on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/settings/llm-config')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const type = result.data.providerType === 'ollama' ? 'ollama' : 'ovms'
            setProviderType(type)
            setOriginalProviderType(type)
            setLlmURL(result.data.llmURL)
            setOriginalLlmURL(result.data.llmURL)
          }
        } else {
          toast.error('Failed to load LLM configuration')
        }
      } catch (error) {
        console.error('Error loading LLM config:', error)
        toast.error('Error loading configuration')
      } finally {
        setIsLoadingConfig(false)
      }
    }
    loadConfig()
  }, [])

  // Test connection to LLM server
  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestStatus('idle')
    setDetectedProvider('')

    try {
      const response = await fetch('/api/settings/llm-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmURL }),
      })

      if (response.ok) {
        const result = await response.json()
        setTestStatus('success')
        setDetectedProvider(result.detectedType)
        // Auto-update provider type based on detection
        if (result.detectedType === 'ollama' || result.detectedType === 'ovms') {
          setProviderType(result.detectedType)
        }
        toast.success(result.message || 'Connection successful!')
      } else {
        const result = await response.json()
        setTestStatus('error')
        toast.error(result.error || 'Connection failed')
      }
    } catch (error) {
      console.error('Connection test error:', error)
      setTestStatus('error')
      toast.error('Connection test failed')
    } finally {
      setIsTesting(false)
    }
  }

  // Save LLM configuration
  const handleSaveConfig = async () => {
    setIsSaving(true)

    try {
      const response = await fetch('/api/settings/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType, llmURL }),
      })

      if (response.ok) {
        const result = await response.json()
        setOriginalProviderType(result.data.providerType)
        setOriginalLlmURL(result.data.llmURL)
        setTestStatus('idle')
        toast.success('LLM configuration updated successfully!')
        setConfirmSaveOpen(false)
      } else {
        const result = await response.json()
        toast.error(result.error || 'Failed to update configuration')
      }
    } catch (error) {
      console.error('Save config error:', error)
      toast.error('Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const hasUnsavedChanges = llmURL !== originalLlmURL || providerType !== originalProviderType

  return (
    <div className="container mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings2 strokeWidth={0.6} className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Button variant="outline" onClick={() => router.push(`/workspace/overview/${persona}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Overview
        </Button>
      </div>

      {/* Language Settings Section */}
      <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h2 className="mb-4 text-lg font-semibold">Language Settings</h2>
          <div className="grid gap-2">
            <Label htmlFor="language">Response Language</Label>
            <Select
              value={currentLang}
              onValueChange={(val: 'en' | 'id') => {
                setPendingLang(val)
                setConfirmOpen(true)
              }}
            >
              <SelectTrigger id="language" className="w-64">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {currentLang === 'id'
                ? 'Hanya respons yang dihasilkan AI yang akan berubah bahasa. Antarmuka aplikasi tetap dalam Bahasa Inggris.'
                : 'Only AI-generated responses change language. The app UI remains in English.'}
            </p>
          </div>
        </div>
      </div>

      {/* LLM Configuration Section */}
      <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">LLM Provider Configuration</h2>
          </div>

          {isLoadingConfig ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading configuration...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* LLM URL Input */}
              <div className="grid gap-2">
                <Label htmlFor="llmURL">LLM Server URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="llmURL"
                    type="text"
                    value={llmURL}
                    onChange={(e) => {
                      setLlmURL(e.target.value)
                      setTestStatus('idle')
                      setDetectedProvider('')
                    }}
                    placeholder="http://localhost:5950 or http://localhost:11434"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || !llmURL.trim()}
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                </div>

                {/* Connection Test Status */}
                {testStatus === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      Connection successful! Detected:{' '}
                      <strong>
                        {detectedProvider === 'ollama' ? 'Ollama' : 'OpenVINO Model Server (OVMS)'}
                      </strong>
                    </span>
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span>Connection failed</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Base URL for the LLM service. Provider type will be automatically detected when
                  you test the connection. Changes take effect immediately after saving.
                </p>
              </div>

              {/* Save Button */}
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={() => setConfirmSaveOpen(true)}
                    disabled={isSaving || !llmURL.trim()}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setProviderType(originalProviderType)
                      setLlmURL(originalLlmURL)
                      setTestStatus('idle')
                    }}
                  >
                    Cancel
                  </Button>
                  <span className="text-sm text-muted-foreground">Unsaved changes</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Language Change Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Language</DialogTitle>
            <DialogDescription>
              {`Change response language to ${pendingLang === 'id' ? 'Bahasa Indonesia' : 'English'} for ${title.replace(' Settings', '')} persona?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false)
                setPendingLang(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingLang) {
                  setPersonaLanguage(persona, pendingLang)
                }
                setConfirmOpen(false)
                setPendingLang(null)
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LLM Config Save Confirmation Dialog */}
      <Dialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save LLM Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to update the LLM configuration? <br />
              <br />
              <strong>Provider:</strong>{' '}
              {providerType === 'ollama' ? 'Ollama' : 'OpenVINO Model Server (OVMS)'}
              <br />
              <strong>URL:</strong> <span className="font-mono text-sm">{llmURL}</span>
              <br />
              <br />
              Changes will take effect immediately for all new requests.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
