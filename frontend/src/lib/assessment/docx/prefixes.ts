export const REPORT_PREFIXES = ['Report - ', 'Laporan - ']
export const DEMO_PREFIXES = ['Demo - ', 'Presentasi Demo - ']
export const INDIVIDUAL_PREFIXES = ['Individual Contribution - ', 'Kontribusi Individu - ']

interface CriterionLike {
  name?: string
  weight?: number
  description?: string
}

function startsWithAny(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name.startsWith(p))
}

export function removeAnyPrefix(name: string, prefixes: string[]): string {
  for (const p of prefixes) {
    if (name.startsWith(p)) return name.substring(p.length)
  }
  return name
}

function getCriterionNameMaybe(c: unknown): string | undefined {
  if (typeof c === 'object' && c !== null && 'name' in c) {
    const n = (c as CriterionLike).name
    if (typeof n === 'string') return n
  }
  return undefined
}

export function isCriterionWithPrefix<T extends CriterionLike>(
  c: unknown,
  prefixes: string[],
): c is T {
  const name = getCriterionNameMaybe(c)
  return typeof name === 'string' && startsWithAny(name, prefixes)
}
