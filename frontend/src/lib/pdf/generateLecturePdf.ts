import type { LectureContent } from '@/app/api/slide/types'
import type { Lang } from './labels'
import { createPdfContext, applyFootersToAllPages } from './utils'
import { renderTitleAndMetadata } from './sections/titleMetadata'
import { renderKeyTerms } from './sections/keyTerms'
import { renderSlides } from './sections/slides'
import { renderActivities } from './sections/activities'
import { renderAssessments } from './sections/assessments'
import { renderFurtherReadings } from './sections/furtherReadings'

export async function generateLecturePdf(content: LectureContent, lang: Lang): Promise<Buffer> {
  const ctx = createPdfContext(lang)

  renderTitleAndMetadata(ctx, content)
  renderKeyTerms(ctx, content)
  renderSlides(ctx, content)
  renderActivities(ctx, content)
  renderAssessments(ctx, content)
  renderFurtherReadings(ctx, content)

  applyFootersToAllPages(ctx)

  return Buffer.from(ctx.pdf.output('arraybuffer'))
}
