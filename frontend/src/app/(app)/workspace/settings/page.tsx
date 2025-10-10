// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Settings2, ArrowLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  const [pendingLang, setPendingLang] = useState<'en' | 'id' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const title = useMemo(() => {
    if (persona === 'lecturer') return 'Lecturer Settings'
    if (persona === 'student') return 'Student Settings'
    return 'Faculty Settings'
  }, [persona])

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

      <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
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
    </div>
  )
}
