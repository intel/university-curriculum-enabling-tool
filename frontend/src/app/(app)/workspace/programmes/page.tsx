// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePersonaStore } from '@/lib/store/persona-store'
import {
  useBulkDeleteProgrammes,
  useDeleteProgramme,
  useProgrammes,
} from '@/lib/hooks/use-programmes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  FileJson,
  LibraryBig,
  BookOpen,
  AlertCircle,
  Download,
  Presentation,
  User,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { compareVersions, generateAbbreviation } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Programme } from '@/payload-types'
import { useCourses } from '@/lib/hooks/use-courses'
import { Skeleton } from '@/components/ui/skeleton'

// Define the export package state type
type ExportPackageState = {
  isOpen: boolean
  programmeId: number | null
  programmeName: string
  targetPersona: 'lecturer' | 'student'
  isExporting: boolean
  isError: boolean
  progress: number | null
  status: string
  isComplete: boolean
}

export default function ProgrammesPage() {
  const router = useRouter()
  const { data: coursesData, isLoading: isCoursesLoading, isError: isCoursesError } = useCourses()
  const { mutate: deleteProgrammeMutation } = useDeleteProgramme()
  const { mutate: bulkDeleteProgrammeMutation } = useBulkDeleteProgrammes()
  const {
    data: programmesData,
    isLoading: isProgrammesLoading,
    isError: isProgrammesError,
    refetch: refetchProgrammes,
  } = useProgrammes()
  const { activePersona } = usePersonaStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedProgrammes, setSelectedProgrammes] = useState<number[]>([])
  const { personas } = usePersonaStore()

  // Export package state
  const [exportPackage, setExportPackage] = useState<ExportPackageState>({
    isOpen: false,
    programmeId: null,
    programmeName: '',
    targetPersona: 'lecturer',
    isExporting: false,
    isError: false,
    progress: null,
    status: '',
    isComplete: false,
  })

  // TanStack Table states
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  // Handle export programme
  const handleExportConfigAction = useCallback(
    (programmeId: number) => {
      try {
        const programme = programmesData?.docs?.find((p: Programme) => p.id === programmeId)
        if (!programme) return

        // Create a mock programme configuration for export
        const programmeConfig = {
          id: programme.id,
          name: programme.name,
          code: programme.code,
          description: programme.description,
          facultyName: programme.facultyName,
          version: programme.version,
          courses: programme.courses,
        }

        // Convert to JSON string
        const jsonString = JSON.stringify(programmeConfig, null, 2)

        // // Generate a better filename using programme info
        const softwareNeme = process.env.NEXT_PUBLIC_APP_NAME
        const softwareVersion = process.env.NEXT_PUBLIC_APP_VERSION
        const softwareNameAbbreviation = generateAbbreviation(softwareNeme || 'app')

        // Create a blob and download
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download =
          `programme` +
          `-${programme.code.toLowerCase()}` +
          `-${programme.version}` +
          `-${softwareNameAbbreviation}` +
          `-${softwareVersion}` +
          `.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success('Programme Config Exported', {
          description: `${programme.name} config has been exported as JSON.`,
        })
      } catch (error) {
        console.log(`Failed to export programme config: ${error}`)
      }
    },
    [programmesData?.docs],
  )

  // Define columns for programmes table
  const columns = useMemo<ColumnDef<Programme>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            className="ml-4"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Programme Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          // Check if this is the latest version of the programme
          const programme = row.original
          const programmeCode = programme.code
          const programmeVersion = programme.version

          // Find all programmes with the same code
          const programmesWithSameCode = programmesData?.docs.filter(
            (p) => p.code === programmeCode,
          )

          // Check if this is the latest version
          const isLatest =
            programmesWithSameCode?.some(
              (p) => compareVersions(p.version, programmeVersion) > 0,
            ) === false

          return (
            <div className="max-w-[500px]">
              <div className="flex items-center gap-2 font-medium">
                <div className="truncate">{row.getValue('name')}</div>
                {isLatest && (
                  <Badge variant="default" className="py-0 text-xs font-normal">
                    Latest
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.description}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'code',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Code
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <Badge variant="outline">{row.getValue('code')}</Badge>,
      },
      {
        accessorKey: 'facultyName',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Faculty
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <div className="text-sm">{row.getValue('facultyName')}</div>,
      },
      {
        id: 'courseCount',
        accessorFn: (row) => row.courses?.length,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Courses
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <div className="text-sm">{row.getValue('courseCount')}</div>,
      },
      {
        accessorKey: 'version',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Version
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => <Badge variant="secondary">{row.getValue('version')}</Badge>,
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const programme = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/workspace/programmes/edit/${programme.id}`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {process.env.NODE_ENV === 'development' && (
                  <DropdownMenuItem onClick={() => handleExportConfigAction(programme.id)}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Export Config File
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => handleDownloadPackageAction(programme.id, programme.name)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Installation Package
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedProgrammes([programme.id])
                    setIsDeleteDialogOpen(true)
                  }}
                  className="text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [router, programmesData?.docs, handleExportConfigAction],
  )

  // Create table instance
  const table = useReactTable({
    data: programmesData?.docs || [],
    // data: localProgrammes,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  })

  // Update selectedProgrammes when row selection changes
  useEffect(() => {
    const selectedRows = table.getFilteredSelectedRowModel().rows
    setSelectedProgrammes(selectedRows.map((row) => row.original.id))
  }, [rowSelection, table])

  // Add useEffect to set default column visibility for mobile
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Check if we're on a mobile device
    const isMobile = window.innerWidth < 768

    if (isMobile) {
      // On mobile, only show the most essential columns
      setColumnVisibility({
        select: true,
        name: true,
        actions: true,
        // Hide all other columns on mobile
        code: false,
        facultyName: false,
        courseCount: false,
        version: false,
      })
    }
  }, [])

  // Handle download package action dialog
  const handleDownloadPackageAction = (programmeId: number, programmeName: string) => {
    setExportPackage({
      isOpen: true,
      programmeId,
      programmeName,
      targetPersona: 'lecturer',
      isExporting: false,
      isError: false,
      progress: null,
      status: '',
      isComplete: false,
    })
  }

  // Handle downloading installation package
  const handleDownloadPackage = async () => {
    if (!exportPackage.programmeId) return

    // Set exporting state
    setExportPackage((prev) => ({
      ...prev,
      isExporting: true,
      progress: 0,
      status: 'Initializing package creation...',
      isComplete: false,
    }))

    try {
      const programme = programmesData?.docs.find(
        (p: Programme) => p.id === exportPackage.programmeId,
      )
      if (!programme) return

      // Step 1: Preparing programme files
      await simulateProgress(0, 20, 'Preparing programme files...', 500)

      // Step 2: Preparing prebuilt software package
      await simulateProgress(20, 40, 'Preparing the prebuilt software package...', 500)

      // Step 3: Retrieving model files
      await simulateProgress(40, 60, 'Retrieving model files...', 500)

      // Step 4: Creating the ZIP package and triggering download
      setExportPackage((prev) => ({
        ...prev,
        status: 'Starting ZIP download...',
        progress: 70,
      }))

      // Use a simple POST request with fetch and get the blob
      const response = await fetch('/api/programmes/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          persona: exportPackage.targetPersona,
          programme: programme,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to download: ${errorText}`)
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `programme-${programme.code}-${programme.version}.zip`

      // Step 5: Downloading the ZIP
      setExportPackage((prev) => ({
        ...prev,
        status: 'Downloading ZIP file...',
        progress: 80,
      }))

      // Get the blob from the response
      const blob = await response.blob()

      // Create a temporary URL and trigger download
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()

      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 100)

      toast.success('Programme Exported', {
        description: `${programme.name} has been exported successfully. Check your Downloads folder.`,
      })

      // Complete
      setExportPackage((prev) => ({
        ...prev,
        isExporting: false,
        progress: 100,
        status: 'Download complete!',
        isComplete: true,
      }))
    } catch (error) {
      console.error('Download error:', error)
      setExportPackage((prev) => ({
        ...prev,
        isExporting: false,
        isError: true,
        status: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }))
    }
  }

  // Helper function to simulate progress
  const simulateProgress = (start: number, end: number, status: string, duration?: number) => {
    return new Promise<void>((resolve) => {
      setExportPackage((prev) => ({
        ...prev,
        status,
        progress: start,
      }))

      const interval = 100 // Update every 100ms
      const steps = duration ? duration / interval : 1
      const increment = duration ? (end - start) / steps : 0
      let currentProgress = start
      let currentStep = 0

      const timer = setInterval(() => {
        currentStep++
        currentProgress += increment

        setExportPackage((prev) => ({
          ...prev,
          progress: Math.min(currentProgress, end),
        }))

        if (currentStep >= steps) {
          clearInterval(timer)
          resolve()
        }
      }, interval)

      if (!duration) {
        setExportPackage((prev) => ({
          ...prev,
          progress: end,
        }))
        resolve()
      }
    })
  }

  // Handle delete course(s)
  const handleDeleteProgrammes = () => {
    if (selectedProgrammes.length === 1) {
      deleteProgrammeMutation(selectedProgrammes[0], {
        onSuccess: () => {
          setSelectedProgrammes([])
          table.resetRowSelection()
          setIsDeleteDialogOpen(false)
        },
      })
    } else {
      bulkDeleteProgrammeMutation(selectedProgrammes, {
        onSuccess: () => {
          setSelectedProgrammes([])
          table.resetRowSelection()
          setIsDeleteDialogOpen(false)
        },
      })
    }
  }

  // Redirect if not faculty persona
  useEffect(() => {
    if (activePersona !== 'faculty') {
      router.push('/not-available')
    }
  }, [activePersona, router])

  if (activePersona !== 'faculty') {
    return null
  }

  if (isCoursesLoading || isProgrammesLoading) {
    return (
      <div className="container mx-auto flex h-full max-w-5xl flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="justify-left flex flex-col">
            <div className="mb-2 h-6 w-32">
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="h-4 w-48">
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="h-10 w-32">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1">
            <div className="h-10 w-full">
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="h-10 w-32">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-md border">
          <ScrollArea className="h-full">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <TableHead key={index}>
                        <Skeleton className="ml-4 h-6 w-24" />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {Array.from({ length: 5 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col items-center justify-between space-y-2 py-4 sm:flex-row sm:space-x-2 sm:space-y-0">
          <Skeleton className="h-4 w-1/3" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    )
  }

  // If no models, redirect to model setup
  if ((coursesData?.docs?.length ?? 0) === 0) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <BookOpen strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">Create Course First</h1>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            You need to create courses before you can create a programme.
          </p>
          <Button onClick={() => router.push('/workspace/courses')} className="flex items-center">
            <Plus className="h-4 w-4" />
            Create Course
          </Button>
        </div>
      </div>
    )
  }

  if (isCoursesError || isProgrammesError) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <h1 className="mb-2 text-2xl font-bold">Error Loading Programmes</h1>
          <p className="mb-4 text-muted-foreground">
            There was an error loading your programmes. Please try again later.
          </p>
          <Button onClick={() => refetchProgrammes()}>Retry</Button>
        </div>
      </div>
    )
  }

  if (programmesData?.docs?.length === 0 && !isProgrammesLoading && !isProgrammesError) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <LibraryBig strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">Create Your First Programme</h1>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            Create programmes with courses for lecturers and students.
          </p>
          <Button
            onClick={() => router.push('/workspace/programmes/create')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Create Programme
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto flex h-full max-w-5xl flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="justify-left flex flex-col">
          <h1 className="text-lg font-bold">Programmes</h1>
          <p className="text-sm text-muted-foreground">
            Export created programmes for student and lecturer tool setup.
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => router.push('/workspace/programmes/create')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Create Programme
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search programmes"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              table.setGlobalFilter(e.target.value)
            }}
            className="w-full pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id === 'facultyName' ? 'Faculty' : column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedProgrammes.length > 0
            ? `${selectedProgrammes.length} selected`
            : `${table.getFilteredRowModel().rows.length} programmes`}
        </span>

        {selectedProgrammes.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="flex items-center"
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete Selected
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-md border">
        <ScrollArea className="h-full">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between space-y-2 py-4 sm:flex-row sm:space-x-2 sm:space-y-0">
        <div className="flex-1 text-center text-sm text-muted-foreground sm:text-left">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{' '}
          to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length,
          )}{' '}
          of {table.getFilteredRowModel().rows.length} entries
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <div className="text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete
              {selectedProgrammes.length === 1
                ? ' the selected programme'
                : ` ${selectedProgrammes.length} selected programmes`}
              and remove the data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProgrammes}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Installation Package Dialog */}
      <Dialog
        open={exportPackage.isOpen}
        onOpenChange={(open) => {
          if (!exportPackage.isExporting) {
            setExportPackage((prev) => ({ ...prev, isOpen: open }))
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Download Installation Package</DialogTitle>
            {!exportPackage.isError && (
              <DialogDescription>
                This process may take approximately up to 8 minutes for a single course within a
                programme.
              </DialogDescription>
            )}
          </DialogHeader>

          {!exportPackage.isExporting &&
          !exportPackage.isComplete &&
          !exportPackage.status.includes('Error') ? (
            <>
              <div className="grid gap-6 py-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Programme</h3>
                  <div className="flex items-center gap-2">
                    <LibraryBig className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{exportPackage.programmeName}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Total Courses</h3>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        {programmesData?.docs.find((p) => p.id === exportPackage.programmeId)
                          ?.courses?.length ?? 0}{' '}
                        courses
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Target User</h3>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div
                      className={cn(
                        'flex cursor-pointer flex-col items-center space-y-2 rounded-lg border p-4 transition-colors',
                        exportPackage.targetPersona === 'lecturer'
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent',
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExportPackage((prev) => ({ ...prev, targetPersona: 'lecturer' }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setExportPackage((prev) => ({ ...prev, targetPersona: 'lecturer' }))
                        }
                      }}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Presentation className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">
                          {personas.find((p) => p.id === 'lecturer')?.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {personas.find((p) => p.id === 'lecturer')?.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex cursor-pointer flex-col items-center space-y-2 rounded-lg border p-4 transition-colors',
                        exportPackage.targetPersona === 'student'
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent',
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExportPackage((prev) => ({ ...prev, targetPersona: 'student' }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setExportPackage((prev) => ({ ...prev, targetPersona: 'student' }))
                        }
                      }}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">
                          {personas.find((p) => p.id === 'student')?.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {personas.find((p) => p.id === 'student')?.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Package Contents</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>• Software packages</p>
                    <p>• Programme configuration files</p>
                    <p>• Required model files</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setExportPackage((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button onClick={handleDownloadPackage} className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Download Package
                </Button>
              </DialogFooter>
            </>
          ) : exportPackage.isComplete ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-3">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Package Created Successfully</h3>
              <p className="mb-6 text-sm text-muted-foreground">
                Your installation package for {exportPackage.targetPersona}s has been created and
                downloaded.
              </p>
              <Button onClick={() => setExportPackage((prev) => ({ ...prev, isOpen: false }))}>
                Close
              </Button>
            </div>
          ) : exportPackage.isError ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="mb-4 rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Package Creation Failed</h3>
              <p className="mb-6 text-sm text-muted-foreground">
                {exportPackage.status || 'An error occurred while creating the package.'}
              </p>
              <Button
                onClick={() =>
                  setExportPackage((prev) => ({
                    ...prev,
                    isError: false,
                    targetPersona: 'lecturer', // Reset to default persona
                    progress: null,
                    status: '',
                  }))
                }
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="py-6">
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <h3 className="text-sm font-medium">{exportPackage.status}</h3>
                </div>
                <Progress value={exportPackage.progress || 0} className="h-2" />
                <p className="text-right text-xs text-muted-foreground">
                  {exportPackage.progress !== null
                    ? `${Math.round(exportPackage.progress)}%`
                    : 'Processing...'}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  Creating {exportPackage.targetPersona} package for {exportPackage.programmeName}
                  ...
                </p>
                <p className="mt-2">{`Please don't close this window.`}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
