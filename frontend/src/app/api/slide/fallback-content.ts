// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { LectureContent } from './types'

// Learning Outcomes
export const fallbackLearningOutcomes = [
  'Understand the basic concepts related to this topic',
  'Identify key principles and applications',
  'Apply fundamental knowledge to solve problems in this domain',
]

// Key Terms
export const fallbackKeyTerms = [
  { term: 'Example Term 1', definition: 'This is a placeholder definition for the first term.' },
  { term: 'Example Term 2', definition: 'This is a placeholder definition for the second term.' },
  { term: 'Example Term 3', definition: 'This is a placeholder definition for the third term.' },
  { term: 'Example Term 4', definition: 'This is a placeholder definition for the fourth term.' },
  { term: 'Example Term 5', definition: 'This is a placeholder definition for the fifth term.' },
]

// Introduction
export const fallbackIntroduction = (topicName: string) =>
  `This is a placeholder introduction for the topic "${topicName}". The AI model encountered an error while generating content. Please try again or modify your request parameters.`

// Slides
export const fallbackSlides = [
  {
    title: 'Introduction to the Topic',
    content: ['This is a placeholder slide.', 'The content generation encountered an error.'],
    notes: 'Placeholder notes for this slide.',
  },
  {
    title: 'Key Concepts',
    content: ['Placeholder for key concept 1', 'Placeholder for key concept 2'],
    notes: 'Placeholder notes for the key concepts slide.',
  },
  {
    title: 'Important Principles',
    content: ['Placeholder for principle 1', 'Placeholder for principle 2'],
    notes: 'Placeholder notes for the principles slide.',
  },
  {
    title: 'Applications',
    content: ['Placeholder for application 1', 'Placeholder for application 2'],
    notes: 'Placeholder notes for the applications slide.',
  },
  {
    title: 'Summary and Conclusion',
    content: ['Summary of key points', 'Next steps and further learning'],
    notes: 'Placeholder notes for the summary slide.',
  },
]

// Activities
// Activities
export const fallbackActivities = (topicName: string, isWorkshop: boolean, isTutorial: boolean) =>
  isWorkshop || isTutorial
    ? [
        {
          title: isWorkshop
            ? 'Workshop Activity 1: Collaborative Problem Solving'
            : 'Tutorial Exercise 1: Guided Practice',
          type: isWorkshop ? 'Group work' : 'Individual exercise',
          description: isWorkshop
            ? `This collaborative workshop activity helps participants apply key concepts through teamwork. Participants will work in small groups to solve a problem related to ${topicName}.`
            : `This guided tutorial exercise helps students develop practical skills related to ${topicName}.`,
          duration: '20 minutes',
          instructions: isWorkshop
            ? [
                'Step 1: Form groups of 3-4 participants',
                'Step 2: Introduce the problem scenario to the groups',
                'Step 3: Groups collaborate to develop a solution',
                'Step 4: Each group presents their solution to the class',
                'Step 5: Facilitate a discussion comparing different approaches',
              ]
            : [
                'Step 1: Review the concept and example provided',
                'Step 2: Follow the step-by-step instructions to complete the basic task',
                'Step 3: Check your work against the provided solution',
                'Step 4: Try the extension activity to deepen your understanding',
                "Step 5: Reflect on what you've learned and how it connects to previous concepts",
              ],
          materials: isWorkshop
            ? ['Problem scenario handouts', 'Whiteboard or digital collaboration tool']
            : ['Exercise worksheet', 'Reference materials'],
        },
        {
          title: isWorkshop
            ? 'Workshop Activity 2: Applied Learning'
            : 'Tutorial Exercise 2: Independent Practice',
          type: isWorkshop ? 'Discussion and application' : 'Guided practice with feedback',
          description: isWorkshop
            ? `This activity helps participants apply theoretical knowledge to practical situations related to ${topicName}. It includes both discussion and hands-on components.\n\nFacilitation notes: Ensure all participants have a chance to contribute to the discussion. Consider using a structured turn-taking approach.`
            : `This exercise allows students to practice skills independently with feedback opportunities. It builds on the concepts from the first exercise.\n\nSuccess criteria: Students can complete the task with minimal guidance and explain their reasoning.`,
          duration: '25 minutes',
          instructions: isWorkshop
            ? [
                'Step 1: Introduce the real-world scenario',
                'Step 2: Facilitate a brief discussion about key considerations',
                'Step 3: Participants work in pairs to develop an approach',
                'Step 4: Pairs implement their approach with provided materials',
                'Step 5: Groups share insights and lessons learned',
              ]
            : [
                'Step 1: Review the learning from the previous exercise',
                'Step 2: Examine the new problem scenario',
                'Step 3: Plan your approach before starting',
                'Step 4: Complete the task using the techniques learned',
                'Step 5: Compare your solution with a partner and discuss differences',
              ],
          materials: isWorkshop
            ? [
                'Real-world scenario descriptions',
                'Application materials specific to the topic',
                'Discussion prompt cards',
                'Reflection worksheet',
              ]
            : [
                'Problem scenario worksheet',
                'Reference guide',
                'Self-assessment checklist',
                'Peer feedback form',
              ],
        },
        {
          title: isWorkshop
            ? 'Workshop Activity 3: Reflection and Synthesis'
            : 'Tutorial Exercise 3: Challenge Activity',
          type: isWorkshop ? 'Reflective practice' : 'Advanced application',
          description: isWorkshop
            ? `This closing activity helps participants consolidate their learning and plan for application beyond the workshop. It focuses on reflection and action planning.\n\nFacilitation notes: Create a supportive atmosphere for honest reflection. Consider having participants write individually before sharing.`
            : `This challenging exercise tests deeper understanding and application of all concepts covered in the tutorial. It requires students to combine multiple skills.\n\nSuccess criteria: Students can solve a complex problem by applying multiple concepts in combination.`,
          duration: '15 minutes',
          instructions: isWorkshop
            ? [
                'Step 1: Individual reflection on key learnings',
                'Step 2: Small group sharing of insights',
                'Step 3: Creation of personal action plan',
                'Step 4: Commitment sharing with a partner',
                'Step 5: Whole group debrief on next steps',
              ]
            : [
                'Step 1: Review all concepts covered in previous exercises',
                'Step 2: Analyze the complex problem scenario',
                'Step 3: Plan your approach, identifying which concepts apply',
                'Step 4: Implement your solution step by step',
                'Step 5: Evaluate your solution against the provided criteria',
              ],
          materials: isWorkshop
            ? [
                'Reflection worksheet',
                'Action planning template',
                'Commitment cards',
                'Follow-up resource list',
              ]
            : [
                'Complex problem scenario',
                'Hint sheet (to be used only if needed)',
                'Evaluation rubric',
                'Extension resources for further learning',
              ],
        },
      ]
    : []

// Assessment Ideas
export const fallbackQuiz = [
  {
    type: 'Quiz',
    duration: '20 minutes',
    description: 'Multiple-choice quiz covering the main concepts',
    exampleQuestions: [
      {
        question: 'What is the primary focus of this topic?',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
        explanation:
          'Option A is correct because it represents the fundamental concept of the topic.',
      },
      {
        question:
          'Which of the following best describes the relationship between concepts X and Y?',
        options: [
          'They are identical',
          'X is a subset of Y',
          'Y is a subset of X',
          'They are unrelated',
        ],
        correctAnswer: 'Option X is a subset of Y',
        explanation:
          'X is a subset of Y because it represents a specific case within the broader concept of Y.',
      },
      {
        question: 'What is the most appropriate application of this knowledge?',
        options: ['Application A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option C',
        explanation:
          'Application C represents the most direct and effective use of the principles covered.',
      },
    ],
  },
]

export const fallbackDiscussionIdeas = [
  {
    type: 'Discussion',
    duration: '30 minutes',
    description: 'Group discussion on key topics and applications',
    exampleQuestions: [
      {
        question:
          'How can the principles covered in this topic be applied to solve real-world problems?',
        correctAnswer:
          'Discussion should cover practical applications, implementation challenges, and potential outcomes.',
        explanation: 'This question helps students explore practical applications of the topic.',
        pointAllocation:
          '30% for quality contributions, 25% for understanding, 25% for critical thinking, 20% for engagement.',
      },
      {
        question:
          'What are the ethical implications of applying these concepts in different contexts?',
        correctAnswer:
          'Discussion should address ethical considerations, potential conflicts, and responsible implementation approaches.',
        explanation: 'This question encourages students to think critically about ethical issues.',
        pointAllocation:
          '30% for ethical awareness, 25% for balanced perspective, 25% for critical analysis, 20% for engagement.',
      },
    ],
  },
]

// Further Readings
export const fallbackFurtherReadings = [
  {
    title: 'Introduction to the Topic',
    author: 'John Smith',
    readingDescription: 'A comprehensive overview of the key concepts',
  },
  {
    title: 'Advanced Applications',
    author: 'Jane Doe',
    readingDescription: 'Explores practical implementations and case studies',
  },
  {
    title: 'Theoretical Foundations',
    author: 'Alex Johnson',
    readingDescription: 'Detailed examination of the underlying principles and theories',
  },
  {
    title: 'Current Research Trends',
    author: 'Maria Garcia',
    readingDescription: 'Overview of recent developments and future directions in the field',
  },
]

// Create fallback content when AI generation fails
export function createFallbackContent(
  topicName: string,
  contentType: string,
  difficultyLevel: string,
): LectureContent {
  const isWorkshop = contentType === 'workshop'
  const isTutorial = contentType === 'tutorial'

  return {
    title: `${topicName} (Fallback Content)`,
    learningOutcomes: fallbackLearningOutcomes,
    keyTerms: fallbackKeyTerms,
    introduction: fallbackIntroduction(topicName),
    slides: isWorkshop || isTutorial ? [] : fallbackSlides,
    activities: fallbackActivities(topicName, isWorkshop, isTutorial),
    assessmentIdeas: [...fallbackQuiz, ...fallbackDiscussionIdeas], // Combine fallbackQuiz and fallbackDIdeas
    furtherReadings: fallbackFurtherReadings,
    contentType,
    difficultyLevel,
  }
}
