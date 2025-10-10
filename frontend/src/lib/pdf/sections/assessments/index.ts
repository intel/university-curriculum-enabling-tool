// Aggregated assessment renderers (quiz, discussion, other)
import type { SectionRenderer } from '../../types'
import { LABELS } from '../../labels'
import { addPageBreak, addSectionHeader } from '../../utils'
import { renderQuizAssessments } from './quiz'
import { renderDiscussionAssessments } from './discussion'
import { renderOtherAssessments } from './other'

export const renderAssessments: SectionRenderer = (ctx, content) => {
  if (!content.assessmentIdeas || content.assessmentIdeas.length === 0) return
  const { lang } = ctx
  addPageBreak(ctx)
  addSectionHeader(ctx, LABELS[lang].assessmentIdeas)
  renderQuizAssessments(ctx, content)
  renderDiscussionAssessments(ctx, content)
  renderOtherAssessments(ctx, content)
}
