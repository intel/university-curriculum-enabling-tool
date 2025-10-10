import { Lang } from '@/lib/utils/lang'

// Localize assessment title for Indonesian context without over-translating brand terms.
export function localizeTitle(rawTitle: string, language: Lang): string {
  if (language !== 'id' || !rawTitle) return rawTitle
  const map: Array<[RegExp, string]> = [
    [/assessment/gi, 'Penilaian'],
    [/project/gi, 'Proyek'],
    [/exam/gi, 'Ujian'],
    [/quiz/gi, 'Kuis'],
    [/assignment/gi, 'Tugas'],
    [/test/gi, 'Tes'],
    [/discussion/gi, 'Diskusi'],
  ]
  let title = rawTitle
  for (const [regex, replacement] of map) {
    title = title.replace(regex, replacement)
  }
  return title
}
