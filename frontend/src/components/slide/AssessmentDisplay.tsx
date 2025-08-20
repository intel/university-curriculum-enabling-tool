// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AssessmentIdea } from '@/lib/types/slide'
import { formatQuizOptions, renderExplanation } from './utils'

interface AssessmentDisplayProps {
  assessmentIdeas: AssessmentIdea[]
  expandedQuestions: Record<string, boolean>
  toggleQuestionExpansion: (questionId: string) => void
}

export function AssessmentDisplay({
  assessmentIdeas,
  expandedQuestions,
  toggleQuestionExpansion,
}: AssessmentDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Assessment Ideas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {assessmentIdeas.map((idea, index) => (
            <div key={index} className="overflow-hidden rounded-lg border">
              <div className="bg-muted p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">{idea.type}</h3>
                  <Badge variant="outline">{idea.duration}</Badge>
                </div>
                <p className="mt-2">{idea.description}</p>
              </div>

              {idea.exampleQuestions && idea.exampleQuestions.length > 0 && (
                <div className="p-4">
                  <h4 className="mb-3 font-medium">Example Questions</h4>
                  <div className="space-y-4">
                    {idea.exampleQuestions.map((question, qIndex) => {
                      const questionId = `question-${index}-${qIndex}`
                      const isExpanded = expandedQuestions[questionId] || false

                      return (
                        <div key={qIndex} className="overflow-hidden rounded-lg border">
                          <div
                            className="flex cursor-pointer items-center justify-between bg-background p-3"
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleQuestionExpansion(questionId)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                toggleQuestionExpansion(questionId)
                              }
                            }}
                          >
                            <h5 className="font-medium">{question.question}</h5>
                            <Button variant="ghost" size="sm">
                              {isExpanded ? 'Hide Details' : 'Show Details'}
                            </Button>
                          </div>

                          {isExpanded && (
                            <div className="border-t p-4">
                              {/* For quiz questions with options - now in A) B) C) D) format */}
                              {question.options &&
                                Array.isArray(question.options) &&
                                question.options.length > 0 && (
                                  <div className="mb-4">
                                    <h6 className="mb-2 font-medium">Options:</h6>
                                    {formatQuizOptions(question.options)}
                                  </div>
                                )}

                              {/* Correct Answer Section */}
                              {question.correctAnswer && (
                                <div className="mb-3 rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                                  <h6 className="mb-1 font-medium">
                                    {idea.type.toLowerCase().includes('quiz')
                                      ? 'Correct Answer:'
                                      : idea.type.toLowerCase().includes('discussion')
                                        ? 'Discussion Guidance:'
                                        : idea.type.toLowerCase().includes('project') ||
                                            idea.type.toLowerCase().includes('assignment')
                                          ? 'Model Solution:'
                                          : 'Model Answer:'}
                                  </h6>
                                  <div className="whitespace-pre-wrap">
                                    {question.correctAnswer}
                                  </div>
                                </div>
                              )}

                              {/* Model Answer Section - for discussion questions */}
                              {idea.type.toLowerCase().includes('discussion') &&
                                question.modelAnswer && (
                                  <div className="mb-3 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
                                    <h6 className="mb-1 font-medium">Model Answer:</h6>
                                    <div className="whitespace-pre-wrap">
                                      {question.modelAnswer}
                                    </div>
                                  </div>
                                )}

                              {/* Explanation Section */}
                              {question.explanation && (
                                <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-900/20">
                                  <h6 className="mb-1 font-medium">
                                    {idea.type.toLowerCase().includes('quiz')
                                      ? 'Explanation:'
                                      : idea.type.toLowerCase().includes('project') ||
                                          idea.type.toLowerCase().includes('assignment')
                                        ? 'Marking Scheme:'
                                        : 'Assessment Criteria:'}
                                  </h6>
                                  {renderExplanation(question.explanation, idea.type)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
