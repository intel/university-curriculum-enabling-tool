import jsPDF from 'jspdf'
import type { LectureContent } from '@/app/api/slide/types'
import type { Lang } from './labels'

// Rendering context passed to every section renderer
// Holds mutable vertical cursor plus immutable layout metrics
export interface PdfContext {
  pdf: jsPDF
  lang: Lang
  y: number // current vertical cursor (mm)
  pageWidth: number
  pageHeight: number
  margin: number
  contentWidth: number
}

export interface SectionRenderer {
  (ctx: PdfContext, content: LectureContent): void
}

// Optional hooks invoked when a new page is inserted
export interface SpaceCheckOptions {
  beforeAdd?: () => void
  afterAdd?: () => void
}
