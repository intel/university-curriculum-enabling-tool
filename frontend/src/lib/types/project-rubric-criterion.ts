export interface ProjectRubricCriterion {
  name: string
  weight: number
  description?: string
  levels?: {
    excellent: string
    good: string
    average: string
    acceptable: string
    poor: string
  }
}

export interface ProjectRubric {
  categories: {
    report: ProjectRubricCriterion[]
    demo: ProjectRubricCriterion[]
    individual: ProjectRubricCriterion[]
  }
  markingScale: string
  totalMarks: number
  reportWeight: number
  demoWeight: number
  individualWeight: number
}
