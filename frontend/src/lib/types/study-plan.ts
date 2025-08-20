// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

export interface StudyPlanTopic {
  topic: string
  subtopics: string[]
  importance: string
  estimatedStudyHours: number
}

export interface StudyPlanActivity {
  type: string
  description: string
  duration: string
  resources: string
}

export interface StudyPlanWeek {
  week: number
  focus: string
  topics: string[]
  activities: StudyPlanActivity[]
  milestones: string[]
}

export interface StudyPlanTechnique {
  technique: string
  description: string
  bestFor: string[]
  example: string
}

export interface StudyPlanResource {
  type: string
  name: string
  description: string
  relevantTopics: string[]
}

export interface StudyPlanPracticeStrategy {
  approach: string
  frequency: string
  questionTypes: string[]
  selfAssessment: string
}

export interface StudyPlanExamPreparation {
  finalWeekPlan: string
  dayBeforeExam: string
  examDayTips: string
}

export interface StudyPlan {
  executiveSummary: string
  topicBreakdown: StudyPlanTopic[]
  weeklySchedule: StudyPlanWeek[]
  studyTechniques: StudyPlanTechnique[]
  additionalResources: StudyPlanResource[]
  practiceStrategy: StudyPlanPracticeStrategy
  examPreparation: StudyPlanExamPreparation
}
