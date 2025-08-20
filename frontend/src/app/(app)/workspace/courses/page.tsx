// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePersonaStore } from '@/lib/store/persona-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  Box,
  BookOpen,
  X,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
import { useModelStore } from '@/lib/store/model-store'
import { compareVersions } from '@/lib/utils'
import { useBulkDeleteCourses, useCourses, useDeleteCourse } from '@/lib/hooks/use-courses'
import { Skeleton } from '@/components/ui/skeleton'
import { Course as PayloadCourse } from '@/payload-types'

// Define filter value interface
interface FilterValue {
  searchTerm?: string
  tagFilter?: string | null
}

// Define model interface for better type safety
interface CourseModel {
  name?: string
  digest?: string
  [key: string]: unknown
}

// Extend the Course interface with better model typing
interface Course extends Omit<PayloadCourse, 'model'> {
  model?: CourseModel | null
}

// Define table row interface
interface TableRow {
  original: Course
}

export default function CoursesPage() {
  const router = useRouter()
  const { data: coursesData, isLoading: isCourseLoading } = useCourses()
  const { mutate: deleteCourseMutation } = useDeleteCourse()
  const { mutate: bulkDeleteCoursesMutation } = useBulkDeleteCourses()
  const { models } = useModelStore()
  const { activePersona } = usePersonaStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedCourses, setSelectedCourses] = useState<number[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // TanStack Table states
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  // Custom global filter function
  function courseGlobalFilter(
    row: { original: Course },
    columnId: string,
    filterValue: FilterValue | string,
  ): boolean {
    // Defensive: allow string for backward compatibility (should be object)
    if (typeof filterValue === 'string') {
      filterValue = { searchTerm: filterValue, tagFilter: null }
    }
    const { searchTerm, tagFilter } = filterValue || {}
    const course = row.original
    // Tag match: allow null/empty tagFilter to match all
    const tagMatch = tagFilter ? course.tag === tagFilter : true
    // Search match: allow null/empty searchTerm to match all
    const search = (searchTerm || '').toLowerCase()
    const searchMatch = search
      ? [course.name, course.code, course.description]
          .filter(Boolean)
          .some((field) => field?.toLowerCase().includes(search))
      : true
    return tagMatch && searchMatch
  }

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
        modelName: false,
        version: false,
      })
    }
  }, [])

  // Open edit dialog
  const handleEditCourse = useCallback(
    (courseId: number) => {
      router.push(`/workspace/courses/edit/${courseId}`)
    },
    [router],
  )

  // Update search filter only if no tag filter is active
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  // Define columns for faculty persona
  const facultyColumns = useMemo<ColumnDef<Course>[]>(
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
              Course Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          // Check if this is the latest version of the programme
          const course = row.original
          const courseCode = course.code
          const courseVersion = course.version

          // Find all programmes with the same code
          const coursesWithSameCode = coursesData?.docs?.filter((c) => c.code === courseCode)

          // Check if this is the latest version
          const isLatest = !(coursesWithSameCode ?? []).some(
            (p) => compareVersions(p.version, courseVersion) > 0,
          )

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
        id: 'modelName',
        accessorFn: (row) => row.model?.name,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Model
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.getValue('modelName')}</span>
            <span className="max-w-[100px] truncate text-xs text-muted-foreground">
              {row.original.model?.digest}
            </span>
          </div>
        ),
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
        accessorKey: 'tag',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="flex items-center gap-1 px-0"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Tag
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const tag = row.original.tag || 'default'
          return (
            <Badge
              variant={tagFilter === tag ? 'default' : 'secondary'}
              className="cursor-pointer text-xs"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag}
            </Badge>
          )
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const course = row.original

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditCourse(course.id)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedCourses([course.id])
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
    [coursesData?.docs, handleEditCourse, tagFilter],
  )

  // Define columns for student/lecturer persona
  const studentLecturerColumns = useMemo<ColumnDef<Course>[]>(
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
              Course Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="max-w-[200px]">
            <div className="truncate font-medium">{row.getValue('name')}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.description}</div>
          </div>
        ),
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
        id: 'modelName',
        accessorFn: (row) => row.model?.name,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Status
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const modelName = row.original.model?.name
          const isAvailable = modelName && models.some((model) => model.name === modelName)

          return (
            <div className="text-sm">
              {isAvailable ? (
                <Badge className="min-w-[97px] justify-center bg-primary">Available</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="min-w-[97px] justify-center border-primary text-primary"
                >
                  Not Installed
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'tag',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="flex items-center gap-1 px-0"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Tag
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const tag = row.original.tag || 'default'
          return (
            <Badge
              variant={tagFilter === tag ? 'default' : 'secondary'}
              className="cursor-pointer text-xs"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag}
            </Badge>
          )
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const course = row.original
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
                  onClick={() => {
                    setSelectedCourses([course.id])
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
    [models, tagFilter],
  )

  // Choose columns based on persona
  const columns = activePersona === 'faculty' ? facultyColumns : studentLecturerColumns

  // Create table instance
  const table = useReactTable({
    data: (coursesData?.docs || []) as Course[],
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
    globalFilterFn: courseGlobalFilter, // <-- add this line
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  })

  // Update selectedCourses when row selection changes
  useEffect(() => {
    const selectedRows = table.getFilteredSelectedRowModel().rows
    setSelectedCourses(selectedRows.map((row) => row.original.id))
  }, [rowSelection, table])

  // Update table filter when searchTerm or tagFilter changes
  useEffect(() => {
    table.setGlobalFilter({ searchTerm, tagFilter })
  }, [searchTerm, tagFilter, table])

  // Handle delete course(s)
  const handleDeleteCourses = () => {
    if (selectedCourses.length === 1) {
      deleteCourseMutation(selectedCourses[0], {
        onSuccess: () => {
          setSelectedCourses([])
          table.resetRowSelection()
          setIsDeleteDialogOpen(false)
        },
      })
    } else {
      bulkDeleteCoursesMutation(selectedCourses, {
        onSuccess: () => {
          setSelectedCourses([])
          table.resetRowSelection()
          setIsDeleteDialogOpen(false)
        },
      })
    }
  }

  // Loading state
  if (isCourseLoading) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
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
                    {Array.from({ length: 6 }).map((_, index) => (
                      <TableHead key={index}>
                        <Skeleton className="ml-4 h-4 w-24" />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 10 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {Array.from({ length: 6 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>

        {/* Pagination */}
        <div className="flex flex-col items-center justify-between space-y-2 py-4 sm:flex-row sm:space-x-2 sm:space-y-0">
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>
    )
  }

  // If faculty persona
  if (activePersona === 'faculty') {
    // If no models, redirect to model setup
    if (models.length === 0) {
      return (
        <div className="container mx-auto max-w-5xl p-6">
          <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
            <Box strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Add Model First</h1>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              You need to add AI models before you can create courses.
            </p>
            <Button onClick={() => router.push('/workspace/model')} className="flex items-center">
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </div>
        </div>
      )
    }

    // If no courses, show welcome screen
    if (!isCourseLoading && coursesData?.docs?.length === 0) {
      return (
        <div className="container mx-auto max-w-7xl p-6">
          <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
            <BookOpen strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
            <h1 className="mb-2 text-2xl font-bold">Create Your First Course</h1>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              Create courses with AI models that can be downloaded by lecturers and students.
            </p>
            <Button
              onClick={() => router.push('/workspace/courses/create')}
              className="flex items-center"
            >
              <Plus className="h-4 w-4" />
              Create Course
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="container mx-auto flex h-full max-w-5xl flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="justify-left flex flex-col">
            <h1 className="text-lg font-bold">Courses</h1>
            <p className="text-sm text-muted-foreground">
              List of created courses for students and lecturers
            </p>
          </div>

          <Button
            onClick={() => router.push('/workspace/courses/create')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Create Course
          </Button>
        </div>

        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchTerm}
              onChange={handleSearchChange}
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
                      {column.id === 'modelName'
                        ? 'Model'
                        : column.id === 'facultyName'
                          ? 'Faculty'
                          : column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedCourses.length > 0
                ? `${selectedCourses.length} selected`
                : `${table.getFilteredRowModel().rows.length} courses`}
            </span>
            {tagFilter && (
              <Badge variant="default" className="flex items-center gap-1 text-xs">
                {tagFilter}
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTagFilter(null)} />
              </Badge>
            )}
          </div>
          {selectedCourses.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="flex items-center"
            >
              <Trash className="h-4 w-4" />
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
            Showing{' '}
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
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
                {selectedCourses.length === 1
                  ? ' the selected course'
                  : ` ${selectedCourses.length} selected courses`}
                and remove the data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCourses}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // Student or Lecturer persona
  // If no courses, show welcome screen
  if (!isCourseLoading && coursesData?.docs?.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center text-center">
          <BookOpen strokeWidth={0.6} className="mb-2 h-28 w-28 text-primary" />
          <h1 className="mb-2 text-2xl font-bold">Add Your First Course</h1>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            {activePersona === 'lecturer'
              ? 'Add courses from faculty to create and manage learning materials for your students.'
              : 'Add courses from faculty to access learning materials and resources.'}
          </p>
          <Button
            onClick={() => router.push('/workspace/courses/add')}
            className="flex items-center"
          >
            <Plus className="h-4 w-4" />
            Add Course
          </Button>
        </div>
      </div>
    )
  }

  // If courses exist, show table
  return (
    // <div className="container mx-auto p-6 md:px-8 md:px-10 max-w-5xl h-full flex flex-col">
    <div className="container mx-auto flex h-full max-w-5xl flex-col p-6 px-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="justify-left flex flex-col">
          <h1 className="text-md font-semibold">Courses</h1>
          <p className="text-sm text-muted-foreground">
            List of courses to access learning materials and resources.
          </p>
        </div>
        <Button onClick={() => router.push('/workspace/courses/add')} className="flex items-center">
          <Plus className="h-4 w-4" />
          Add Course
        </Button>
      </div>

      <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full pl-8"
          />
          {tagFilter && (
            <div className="absolute right-2.5 top-2.5 flex items-center gap-2">
              <Badge variant="default" className="text-xs">
                Tag: {tagFilter}
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTagFilter(null)} />
              </Badge>
            </div>
          )}
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
                    {column.id === 'modelName'
                      ? 'Status'
                      : column.id === 'facultyName'
                        ? 'Faculty'
                        : column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedCourses.length > 0
              ? `${selectedCourses.length} selected`
              : `${table.getFilteredRowModel().rows.length} courses`}
          </span>
          {tagFilter && (
            <Badge variant="default" className="flex items-center gap-1 text-xs">
              Tag: {tagFilter}
              <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTagFilter(null)} />
            </Badge>
          )}
        </div>
        {selectedCourses.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="flex items-center"
          >
            <Trash className="h-4 w-4" />
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
              {selectedCourses.length === 1
                ? ' the selected course'
                : ` ${selectedCourses.length} selected courses`}
              from your device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCourses}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
