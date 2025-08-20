// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { NextResponse, type NextRequest } from 'next/server'
import * as docx from 'docx'
import { AssessmentDocxContent } from '@/lib/types/assessment-types'

interface Criterion {
  name: string
  weight: number
  description?: string
}

// Update the POST handler to extract course information from the request
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming request body
    const { assessmentType, difficultyLevel, courseInfo } = await request.json()

    // Extract data from courseInfo
    const { assessment, format, metadata } = courseInfo || {}

    // Check for null/undefined assessment
    if (!assessment) {
      console.error('No assessment data found in courseInfo')
      return NextResponse.json({ error: 'No assessment data found in courseInfo' }, { status: 400 })
    }

    // Log the parsed data for debugging
    console.log('Parsed request data:', {
      assessmentType,
      difficultyLevel,
      assessment,
      format,
      metadata,
    })

    // Debug log to check if we have explanation data
    if (assessment?.exampleQuestions?.[0]?.explanation) {
      console.log(
        'Explanation data found:',
        typeof assessment.exampleQuestions[0].explanation,
        Array.isArray(assessment.exampleQuestions[0].explanation?.criteria)
          ? `Criteria count: ${assessment.exampleQuestions[0].explanation.criteria.length}`
          : 'No criteria array found',
      )

      // Check for rubricLevels
      if (assessment.exampleQuestions[0].explanation?.rubricLevels) {
        console.log(
          'RubricLevels found:',
          Array.isArray(assessment.exampleQuestions[0].explanation.rubricLevels)
            ? `Levels count: ${assessment.exampleQuestions[0].explanation.rubricLevels.length}`
            : 'RubricLevels is not an array',
        )
      } else {
        console.log('No rubricLevels found in explanation')
      }
    } else {
      console.log('No explanation data found in assessment')
    }

    console.log(`Generating Word document for assessment (${format} format):`, assessment.type)

    // Generate the Word document based on the requested format
    const docBuffer = await generateAssessmentDocx({
      assessmentIdeas: [assessment],
      difficultyLevel,
      format: format || 'lecturer', // Default to lecturer format if not specified
      metadata: metadata || {
        courseCode: '',
        courseName: '',
        examTitle: assessment.type + ' Assessment',
      },
    })

    console.log('Word document generated successfully')
    console.log('Assessment type:', assessment.type)

    // Ensure assessment type is properly sanitized and used in the filename
    const sanitizedAssessmentType = assessment.type
      ? assessment.type.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      : 'assessment'

    // Debug the final generated filename
    const filename = `${sanitizedAssessmentType}_assessment_${format || 'lecturer'}.docx`
    console.log('Generated filename:', filename)

    // Return the Word document as a downloadable response
    return new NextResponse(new Uint8Array(docBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating Word document:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to generate Word document: ' + errorMessage },
      { status: 500 },
    )
  }
}

// Add a function to process text with bold formatting
function processTextWithBold(text: string): {
  text: string
  hasBold: boolean
  boldSegments: Array<{ text: string; bold: boolean }>
} {
  if (!text) return { text: '', hasBold: false, boldSegments: [] }

  const boldPattern = /\*\*(.*?)\*\*/g
  const hasBold = boldPattern.test(text)

  // Reset the regex lastIndex
  boldPattern.lastIndex = 0

  if (!hasBold) {
    return { text, hasBold, boldSegments: [{ text, bold: false }] }
  }

  const boldSegments: Array<{ text: string; bold: boolean }> = []
  let lastIndex = 0
  let match

  while ((match = boldPattern.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      boldSegments.push({
        text: text.substring(lastIndex, match.index),
        bold: false,
      })
    }

    // Add the bold part
    boldSegments.push({
      text: match[1],
      bold: true,
    })

    lastIndex = match.index + match[0].length
  }

  // Add any remaining text after the last bold part
  if (lastIndex < text.length) {
    boldSegments.push({
      text: text.substring(lastIndex),
      bold: false,
    })
  }

  // Clean the original text by removing the asterisks
  const cleanedText = text.replace(boldPattern, '$1')

  return { text: cleanedText, hasBold, boldSegments }
}

// Helper function to create default rubric descriptions if none are provided
function createDefaultRubricDescriptions(criterionName: string) {
  const name = criterionName.toLowerCase()

  return {
    excellent: `Demonstrates exceptional ${name} with comprehensive understanding and flawless execution.`,
    good: `Shows strong ${name} with minor areas for improvement.`,
    average: `Demonstrates adequate ${name} meeting basic requirements.`,
    acceptable: `Shows minimal acceptable ${name} with significant room for improvement.`,
    poor: `Fails to demonstrate adequate ${name}, falling below minimum requirements.`,
  }
}

// Update the Word document generation to support student and lecturer formats
async function generateAssessmentDocx(content: AssessmentDocxContent): Promise<Buffer> {
  try {
    const assessment = content.assessmentIdeas[0]
    const format = content.format || 'lecturer'
    const metadata = content.metadata || {
      courseCode: '',
      courseName: '',
      examTitle: assessment.type + ' Assessment',
    }

    console.log(
      `Generating DOCX with format: ${format}, isProjectType: ${assessment.type.toLowerCase().includes('project')}`,
    )

    const isStudentFormat = format === 'student'
    const isProjectType = assessment.type.toLowerCase().includes('project')

    // Create document sections with mutable array
    const children: (docx.Paragraph | docx.Table)[] = []

    // Add header with "SULIT" marking
    const header = new docx.Header({
      children: [
        new docx.Paragraph({
          text: 'SULIT',
          alignment: docx.AlignmentType.RIGHT,
          spacing: { after: 200 },
        }),
      ],
    })

    // Add footer with "SULIT" marking and page number
    const footer = new docx.Footer({
      children: [
        // SULIT on the left
        new docx.Paragraph({
          children: [new docx.TextRun('SULIT')],
          alignment: docx.AlignmentType.LEFT,
        }),
        // Page number in the center
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              children: [docx.PageNumber.CURRENT],
            }),
          ],
          alignment: docx.AlignmentType.CENTER,
        }),
      ],
    })

    // Exam title and information section
    children.push(
      new docx.Paragraph({
        text: metadata.examTitle || assessment.type + ' Assessment',
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 200 },
        heading: docx.HeadingLevel.HEADING_1,
      }),
    )

    // Course information
    if (metadata.courseCode || metadata.courseName) {
      children.push(
        new docx.Paragraph({
          text: `${metadata.courseCode || ''} – ${metadata.courseName || ''}`,
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 400 },
          heading: docx.HeadingLevel.HEADING_2,
        }),
      )
    }

    // Special handling for project type
    if (isProjectType) {
      // Check if project description already contains metadata fields to avoid duplication
      const projectDescription = assessment.exampleQuestions[0].question || ''

      // Check which metadata fields are already in the project description
      const containsSemester = projectDescription.includes(metadata.semester || '')
      const containsAcademicYear = projectDescription.includes(metadata.academicYear || '')
      const containsDeadline = projectDescription.includes(metadata.deadline || '')
      const containsGroupSize = new RegExp(`group.*?${metadata.groupSize || 4}`, 'i').test(
        projectDescription,
      )

      // Add project-specific information that's not already in the description
      children.push(
        new docx.Paragraph({
          text: 'PROJECT INFORMATION',
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }),
      )

      // Only add metadata that's not already in the project description
      if (!containsSemester && metadata.semester) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: 'Semester: ', bold: true }),
              new docx.TextRun({ text: metadata.semester }),
            ],
            spacing: { after: 100 },
          }),
        )
      }

      if (!containsAcademicYear && metadata.academicYear) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: 'Academic Year: ', bold: true }),
              new docx.TextRun({ text: metadata.academicYear }),
            ],
            spacing: { after: 100 },
          }),
        )
      }

      if (!containsDeadline && metadata.deadline) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: 'Submission Deadline: ', bold: true }),
              new docx.TextRun({ text: metadata.deadline }),
            ],
            spacing: { after: 100 },
          }),
        )
      }

      if (!containsGroupSize && metadata.groupSize) {
        children.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: 'Group Size: ', bold: true }),
              new docx.TextRun({ text: `${metadata.groupSize} members per group` }),
            ],
            spacing: { after: 100 },
          }),
        )
      }

      children.push(
        new docx.Paragraph({
          children: [
            new docx.TextRun({ text: 'Duration: ', bold: true }),
            new docx.TextRun({ text: metadata.projectDuration || assessment.duration }),
          ],
          spacing: { after: 200 },
        }),
      )

      // Project description
      children.push(
        new docx.Paragraph({
          text: 'PROJECT DESCRIPTION',
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 400, after: 200 },
        }),
      )

      // Split the question text into sections
      const questionParts: string[] = assessment.exampleQuestions[0].question.split(/\n+/)

      let currentTitle = ''
      let currentContent: docx.Paragraph[] = []

      // Process each paragraph of the project description
      questionParts.forEach((part) => {
        const section = part.trim()
        if (!section) return

        // Process bold formatting
        const { hasBold, boldSegments } = processTextWithBold(section)

        const inlineHeaderContent = section.match(/^\*\*(.+?):\*\*\s*(.+)$/)
        const sectionTitleOnly = section.match(/^\*\*(.+)\*\*$/)
        const sectionTitleWithColon = section.match(/^\*\*(.+?):\*\*$/)
        const isBullet = /^[ \t]*([-*+•])\s/.test(section)
        const isNumbered = /^[ \t]*(\d+\.|[a-z]\.|[ivxlcdm]+\.|[IVXLCDM]+\.)\s/.test(section)

        function getIndentLevel(text: string) {
          const leadingWhitespace = text.match(/^[ \t]*/)?.[0] || ''
          const normalized = leadingWhitespace.replace(/\t/g, '    ') // Convert tabs to 4 spaces
          return Math.floor(normalized.length / 4)
        }

        // Push previous section if new section starts
        const pushCurrentSection = () => {
          if (currentContent.length > 0) {
            if (currentTitle) {
              children.push(
                new docx.Paragraph({
                  text: currentTitle,
                  heading: docx.HeadingLevel.HEADING_3,
                  spacing: { before: 300, after: 200 },
                }),
              )
            }
            currentContent.forEach((p) => children.push(p))
            currentContent = []
          }
        }

        // Section header only
        if (sectionTitleOnly || sectionTitleWithColon) {
          pushCurrentSection()
          currentTitle = (sectionTitleOnly?.[1] || sectionTitleWithColon?.[1] || '').trim()
          return
        }

        // Inline header with content (like **Project Title:** Intel Gaudi)
        if (inlineHeaderContent) {
          const header = inlineHeaderContent[1].trim()
          const content = inlineHeaderContent[2].trim()
          currentContent.push(
            new docx.Paragraph({
              children: [
                new docx.TextRun({ text: `${header}: `, bold: true }),
                new docx.TextRun({ text: content }),
              ],
              spacing: { after: 100 },
            }),
          )
          return
        }

        if (isBullet || isNumbered) {
          const indentLevel = getIndentLevel(part)
          currentContent.push(
            new docx.Paragraph({
              children: hasBold
                ? boldSegments.map(
                    (segment) => new docx.TextRun({ text: segment.text, bold: segment.bold }),
                  )
                : [new docx.TextRun(section)],
              numbering: {
                reference: isBullet ? 'bulletPoints' : 'projectPoints',
                level: indentLevel,
              },
              spacing: { after: 100 },
            }),
          )
          return
        }
        // Regular paragraph
        currentContent.push(
          new docx.Paragraph({
            children: hasBold
              ? boldSegments.map(
                  (segment) => new docx.TextRun({ text: segment.text, bold: segment.bold }),
                )
              : [new docx.TextRun(section)],
            spacing: { after: 200 },
          }),
        )
      })

      // Push remaining content
      if (currentContent.length > 0) {
        if (currentTitle) {
          children.push(
            new docx.Paragraph({
              text: currentTitle,
              heading: docx.HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 200 },
            }),
          )
        }
        currentContent.forEach((p) => children.push(p))
      }

      // Add model answer for project type (lecturer format only)
      if (!isStudentFormat && assessment.exampleQuestions[0].correctAnswer) {
        const modelAnswer = assessment.exampleQuestions[0].correctAnswer
        if (modelAnswer) {
          // Add a page break before the model answer
          children.push(
            new docx.Paragraph({
              children: [new docx.PageBreak()],
            }),
          )

          // Add model answer heading
          children.push(
            new docx.Paragraph({
              text: 'MODEL ANSWER/GUIDELINES',
              heading: docx.HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
              alignment: docx.AlignmentType.CENTER,
            }),
          )

          // Process the model answer text
          const modelAnswerLines = modelAnswer.split('\n')

          modelAnswerLines.forEach((line: string) => {
            // Process bold formatting
            const { text, hasBold, boldSegments } = processTextWithBold(line)

            const cleanedLine = text

            // Check if this is a section header (looks like a heading)
            if (/^[A-Z][\w\s&\-]*:?$/.test(cleanedLine.trim()) && cleanedLine.trim().length < 50) {
              children.push(
                new docx.Paragraph({
                  text: cleanedLine.trim(),
                  heading: docx.HeadingLevel.HEADING_3,
                  spacing: { before: 300, after: 100 },
                }),
              )
            }
            // Check if this looks like code (indented or has special characters)
            else if (
              line.startsWith('  ') ||
              line.startsWith('\t') ||
              line.includes('def ') ||
              line.includes('return ') ||
              line.includes('```') ||
              line.includes('import ')
            ) {
              // Skip code block markers
              if (line.includes('```')) {
                return
              }
              children.push(
                new docx.Paragraph({
                  text: line,
                  style: 'code',
                  spacing: { before: 200, after: 100 },
                }),
              )
            }
            // Regular paragraph with possible bold formatting
            else if (line.trim()) {
              if (hasBold) {
                children.push(
                  new docx.Paragraph({
                    children: boldSegments.map(
                      (segment) =>
                        new docx.TextRun({
                          text: segment.text,
                          bold: segment.bold,
                        }),
                    ),
                    spacing: { before: 200, after: 100 },
                  }),
                )
              } else {
                children.push(
                  new docx.Paragraph({
                    text: line.trim(),
                    spacing: { after: 100 },
                  }),
                )
              }
            }
          })
        }
      }

      // Add grading rubrics for project type (lecturer format only)
      if (!isStudentFormat) {
        console.log('Adding grading rubrics for lecturer format')

        // Add a page break before the rubrics
        children.push(
          new docx.Paragraph({
            children: [new docx.PageBreak()],
          }),
        )

        // Add rubrics heading
        children.push(
          new docx.Paragraph({
            text: 'GRADING RUBRICS',
            heading: docx.HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            alignment: docx.AlignmentType.CENTER,
          }),
        )

        children.push(
          new docx.Paragraph({
            text: 'Marking Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5- Excellent.',
            spacing: { after: 200 },
          }),
        )

        // Get the explanation object
        const explanation = assessment.exampleQuestions[0].explanation
        console.log('Explanation type:', typeof explanation)

        // Create default criteria if none exist
        let criteria = []
        if (typeof explanation === 'object' && Array.isArray(explanation.criteria)) {
          criteria = explanation.criteria
          console.log(`Found ${criteria.length} criteria in explanation`)
        } else {
          // Create default criteria
          console.log('Creating default criteria')
          criteria = [
            { name: 'Report - Content', weight: 20, description: 'Quality and depth of content' },
            {
              name: 'Report - Analysis',
              weight: 15,
              description: 'Critical analysis and insights',
            },
            { name: 'Report - Structure', weight: 10, description: 'Organization and clarity' },
            { name: 'Report - References', weight: 10, description: 'Use of appropriate sources' },
            { name: 'Demo - Implementation', weight: 15, description: 'Quality of implementation' },
            { name: 'Demo - Presentation', weight: 15, description: 'Clarity and effectiveness' },
            {
              name: 'Individual Contribution - Participation',
              weight: 15,
              description: 'Level of participation',
            },
          ]
        }

        // Group criteria by category
        const reportCriteria: Criterion[] = criteria.filter(
          (c): c is Criterion =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Report'),
        )

        const demoCriteria: Criterion[] = criteria.filter(
          (c): c is Criterion =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Demo'),
        )

        const individualCriteria: Criterion[] = criteria.filter(
          (c): c is Criterion =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Individual'),
        )
        console.log(
          `Criteria breakdown: Report=${reportCriteria.length}, Demo=${demoCriteria.length}, Individual=${individualCriteria.length}`,
        )

        // Check if we have rubricLevels
        let rubricLevels: Array<{ level: string; criteria: { [key: string]: string } }> = []
        if (typeof explanation === 'object' && Array.isArray(explanation.rubricLevels)) {
          rubricLevels = explanation.rubricLevels
          console.log(`Found ${rubricLevels.length} rubric levels`)
        }

        // Add Report criteria table
        if (reportCriteria.length > 0) {
          children.push(
            new docx.Paragraph({
              text: 'REPORT (55%)',
              heading: docx.HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 200 },
            }),
          )

          // Create table for report criteria
          const reportTable = new docx.Table({
            width: {
              size: 100,
              type: docx.WidthType.PERCENTAGE,
            },
            rows: [
              // Header row
              new docx.TableRow({
                children: [
                  new docx.TableCell({
                    children: [new docx.Paragraph({ text: 'Criteria', style: 'strongText' })],
                    width: { size: 20, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Excellent (5)\nA, A-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Good (4)\nB+, B, B-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Average (3)\nC+, C', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Acceptable (2)\nC-, D+', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Poor (1)\nD, D-, F', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
              // Data rows for each criterion
              ...reportCriteria.map((criterion) => {
                const criterionName = criterion.name.replace('Report - ', '')

                // Find detailed descriptions for this criterion in rubricLevels if available
                let excellentDesc = '',
                  goodDesc = '',
                  averageDesc = '',
                  acceptableDesc = '',
                  poorDesc = ''

                // Try to find descriptions in rubricLevels
                if (rubricLevels.length > 0) {
                  for (const level of rubricLevels) {
                    if (level.level?.includes('Excellent') && level.criteria?.[criterion.name]) {
                      excellentDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Good') && level.criteria?.[criterion.name]) {
                      goodDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Average') &&
                      level.criteria?.[criterion.name]
                    ) {
                      averageDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Acceptable') &&
                      level.criteria?.[criterion.name]
                    ) {
                      acceptableDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Poor') && level.criteria?.[criterion.name]) {
                      poorDesc = level.criteria[criterion.name]
                    }
                  }
                }

                // If no descriptions were found, create default ones
                if (!excellentDesc && !goodDesc && !averageDesc && !acceptableDesc && !poorDesc) {
                  const defaults = createDefaultRubricDescriptions(criterionName)
                  excellentDesc = defaults.excellent
                  goodDesc = defaults.good
                  averageDesc = defaults.average
                  acceptableDesc = defaults.acceptable
                  poorDesc = defaults.poor
                }

                return new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph({ text: criterionName, style: 'strongText' }),
                        criterion.description
                          ? new docx.Paragraph({
                              text: criterion.description,
                              style: 'criteriaDescription',
                            })
                          : new docx.Paragraph(''),
                        new docx.Paragraph({ text: `(${criterion.weight}%)`, style: 'weightText' }),
                      ],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(excellentDesc || 'Excellent performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(goodDesc || 'Good performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(averageDesc || 'Average performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(acceptableDesc || 'Acceptable performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(poorDesc || 'Poor performance')],
                    }),
                  ],
                })
              }),
            ],
          })

          children.push(reportTable)

          // Add spacing after table
          children.push(
            new docx.Paragraph({
              text: '',
              spacing: { after: 200 },
            }),
          )
        }

        // Add Demo criteria table
        if (demoCriteria.length > 0) {
          children.push(
            new docx.Paragraph({
              text: 'DEMO PRESENTATION (30%)',
              heading: docx.HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 200 },
            }),
          )

          // Create table for demo criteria
          const demoTable = new docx.Table({
            width: {
              size: 100,
              type: docx.WidthType.PERCENTAGE,
            },
            rows: [
              // Header row
              new docx.TableRow({
                children: [
                  new docx.TableCell({
                    children: [new docx.Paragraph({ text: 'Criteria', style: 'strongText' })],
                    width: { size: 20, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Excellent (5)\nA, A-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Good (4)\nB+, B, B-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Average (3)\nC+, C', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Acceptable (2)\nC-, D+', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Poor (1)\nD, D-, F', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
              // Data rows for each criterion
              ...demoCriteria.map((criterion: Criterion) => {
                const criterionName = criterion.name.replace('Demo - ', '')

                // Find detailed descriptions for this criterion in rubricLevels if available
                let excellentDesc = '',
                  goodDesc = '',
                  averageDesc = '',
                  acceptableDesc = '',
                  poorDesc = ''

                // Try to find descriptions in rubricLevels
                if (rubricLevels.length > 0) {
                  for (const level of rubricLevels) {
                    if (level.level?.includes('Excellent') && level.criteria?.[criterion.name]) {
                      excellentDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Good') && level.criteria?.[criterion.name]) {
                      goodDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Average') &&
                      level.criteria?.[criterion.name]
                    ) {
                      averageDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Acceptable') &&
                      level.criteria?.[criterion.name]
                    ) {
                      acceptableDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Poor') && level.criteria?.[criterion.name]) {
                      poorDesc = level.criteria[criterion.name]
                    }
                  }
                }

                // If no descriptions were found, create default ones
                if (!excellentDesc && !goodDesc && !averageDesc && !acceptableDesc && !poorDesc) {
                  const defaults = createDefaultRubricDescriptions(criterionName)
                  excellentDesc = defaults.excellent
                  goodDesc = defaults.good
                  averageDesc = defaults.average
                  acceptableDesc = defaults.acceptable
                  poorDesc = defaults.poor
                }

                return new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph({ text: criterionName, style: 'strongText' }),
                        criterion.description
                          ? new docx.Paragraph({
                              text: criterion.description,
                              style: 'criteriaDescription',
                            })
                          : new docx.Paragraph(''),
                        new docx.Paragraph({ text: `(${criterion.weight}%)`, style: 'weightText' }),
                      ],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(excellentDesc || 'Excellent performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(goodDesc || 'Good performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(averageDesc || 'Average performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(acceptableDesc || 'Acceptable performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(poorDesc || 'Poor performance')],
                    }),
                  ],
                })
              }),
            ],
          })

          children.push(demoTable)

          // Add spacing after table
          children.push(
            new docx.Paragraph({
              text: '',
              spacing: { after: 200 },
            }),
          )
        }

        // Add Individual Contribution criteria table
        if (individualCriteria.length > 0) {
          children.push(
            new docx.Paragraph({
              text: 'INDIVIDUAL CONTRIBUTION (15%)',
              heading: docx.HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 200 },
            }),
          )

          // Create table for individual criteria
          const individualTable = new docx.Table({
            width: {
              size: 100,
              type: docx.WidthType.PERCENTAGE,
            },
            rows: [
              // Header row
              new docx.TableRow({
                children: [
                  new docx.TableCell({
                    children: [new docx.Paragraph({ text: 'Criteria', style: 'strongText' })],
                    width: { size: 20, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Excellent (5)\nA, A-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Good (4)\nB+, B, B-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Average (3)\nC+, C', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Acceptable (2)\nC-, D+', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Poor (1)\nD, D-, F', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
              // Data rows for each criterion
              ...individualCriteria.map((criterion: Criterion) => {
                const criterionName = criterion.name.replace('Individual Contribution - ', '')

                // Find detailed descriptions for this criterion in rubricLevels if available
                let excellentDesc = '',
                  goodDesc = '',
                  averageDesc = '',
                  acceptableDesc = '',
                  poorDesc = ''

                // Try to find descriptions in rubricLevels
                if (rubricLevels.length > 0) {
                  for (const level of rubricLevels) {
                    if (level.level?.includes('Excellent') && level.criteria?.[criterion.name]) {
                      excellentDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Good') && level.criteria?.[criterion.name]) {
                      goodDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Average') &&
                      level.criteria?.[criterion.name]
                    ) {
                      averageDesc = level.criteria[criterion.name]
                    } else if (
                      level.level?.includes('Acceptable') &&
                      level.criteria?.[criterion.name]
                    ) {
                      acceptableDesc = level.criteria[criterion.name]
                    } else if (level.level?.includes('Poor') && level.criteria?.[criterion.name]) {
                      poorDesc = level.criteria[criterion.name]
                    }
                  }
                }

                // If no descriptions were found, create default ones
                if (!excellentDesc && !goodDesc && !averageDesc && !acceptableDesc && !poorDesc) {
                  const defaults = createDefaultRubricDescriptions(criterionName)
                  excellentDesc = defaults.excellent
                  goodDesc = defaults.good
                  averageDesc = defaults.average
                  acceptableDesc = defaults.acceptable
                  poorDesc = defaults.poor
                }

                return new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph({ text: criterionName, style: 'strongText' }),
                        criterion.description
                          ? new docx.Paragraph({
                              text: criterion.description,
                              style: 'criteriaDescription',
                            })
                          : new docx.Paragraph(''),
                        new docx.Paragraph({ text: `(${criterion.weight}%)`, style: 'weightText' }),
                      ],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(excellentDesc || 'Excellent performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(goodDesc || 'Good performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(averageDesc || 'Average performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(acceptableDesc || 'Acceptable performance')],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(poorDesc || 'Poor performance')],
                    }),
                  ],
                })
              }),
            ],
          })

          children.push(individualTable)
        }

        // If no criteria were found, add a default rubric table
        if (
          reportCriteria.length === 0 &&
          demoCriteria.length === 0 &&
          individualCriteria.length === 0
        ) {
          console.log('No criteria found, adding default rubric table')

          // Create default criteria
          const defaultCriteria = [
            { name: 'Content Quality', weight: 25, description: 'Depth and accuracy of content' },
            { name: 'Implementation', weight: 25, description: 'Quality of implementation' },
            { name: 'Presentation', weight: 25, description: 'Clarity and organization' },
            {
              name: 'Individual Contribution',
              weight: 25,
              description: 'Individual participation and contribution',
            },
          ]

          // Create table for default criteria
          const defaultTable = new docx.Table({
            width: {
              size: 100,
              type: docx.WidthType.PERCENTAGE,
            },
            rows: [
              // Header row
              new docx.TableRow({
                children: [
                  new docx.TableCell({
                    children: [new docx.Paragraph({ text: 'Criteria', style: 'strongText' })],
                    width: { size: 20, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Excellent (5)\nA, A-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Good (4)\nB+, B, B-', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Average (3)\nC+, C', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Acceptable (2)\nC-, D+', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({ text: 'Poor (1)\nD, D-, F', style: 'strongText' }),
                    ],
                    width: { size: 16, type: docx.WidthType.PERCENTAGE },
                  }),
                ],
              }),
              // Data rows for each criterion
              ...defaultCriteria.map((criterion) => {
                const defaults = createDefaultRubricDescriptions(criterion.name)

                return new docx.TableRow({
                  children: [
                    new docx.TableCell({
                      children: [
                        new docx.Paragraph({ text: criterion.name, style: 'strongText' }),
                        criterion.description
                          ? new docx.Paragraph({
                              text: criterion.description,
                              style: 'criteriaDescription',
                            })
                          : new docx.Paragraph(''),
                        new docx.Paragraph({ text: `(${criterion.weight}%)`, style: 'weightText' }),
                      ],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(defaults.excellent)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(defaults.good)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(defaults.average)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(defaults.acceptable)],
                    }),
                    new docx.TableCell({
                      children: [new docx.Paragraph(defaults.poor)],
                    }),
                  ],
                })
              }),
            ],
          })

          children.push(defaultTable)
        }
      }
    } else {
      // Regular assessment instructions
      children.push(
        new docx.Paragraph({
          text: 'Instructions: Please ensure that this examination paper is complete before you begin the examination.',
          spacing: { after: 200 },
        }),
      )

      children.push(
        new docx.Paragraph({
          text: `Instructions: Answer all ${assessment.exampleQuestions.length} questions.`,
          spacing: { after: 400 },
        }),
      )

      children.push(
        new docx.Paragraph({
          text: 'You may answer the questions either in English or in Bahasa Malaysia.',
          spacing: { after: 200 },
        }),
      )

      children.push(
        new docx.Paragraph({
          text: 'In the event of any discrepancies, the English version shall be used.',
          spacing: { after: 400 },
        }),
      )

      // Add a page break after the instructions
      children.push(
        new docx.Paragraph({
          children: [new docx.PageBreak()],
        }),
      )

      // Questions
      for (let index = 0; index < assessment.exampleQuestions.length; index++) {
        const question = assessment.exampleQuestions[index]

        // Question number and text
        children.push(
          new docx.Paragraph({
            text: `${index + 1}.`,
            spacing: { before: 400, after: 200 },
          }),
        )

        // Split the question text into parts if it contains sub-questions
        const questionParts = question.question.split(/$$[a-z]$$|$$[ivx]+$$/g)

        if (questionParts.length > 1) {
          // Main question text
          children.push(
            new docx.Paragraph({
              text: questionParts[0].trim(),
              spacing: { after: 200 },
            }),
          )

          // Extract the sub-question labels
          const subQuestionLabels = []
          const labelRegex = /$$([a-z]|[ivx]+)$$/g
          let match
          while ((match = labelRegex.exec(question.question)) !== null) {
            subQuestionLabels.push(match[1])
          }

          // Sub-questions
          for (let i = 1; i < questionParts.length; i++) {
            if (questionParts[i] && questionParts[i].trim()) {
              const label =
                i - 1 < subQuestionLabels.length
                  ? subQuestionLabels[i - 1]
                  : String.fromCharCode(96 + i)
              children.push(
                new docx.Paragraph({
                  children: [
                    new docx.TextRun({ text: `(${label}) `, bold: true }),
                    new docx.TextRun({ text: questionParts[i].trim() }),
                  ],
                  indent: { left: 720 }, // 0.5 inch indent
                  spacing: { after: 200 },
                }),
              )
            }
          }
        } else {
          // Simple question without sub-parts
          children.push(
            new docx.Paragraph({
              text: question.question,
              spacing: { after: 200 },
            }),
          )
        }

        // Only include answers and marking criteria in lecturer format
        if (!isStudentFormat) {
          // Correct/Model Answer
          if (question.correctAnswer) {
            // Clean up model answer if it's in JSON format
            let modelAnswer = question.correctAnswer

            // Check if the answer looks like JSON
            if (
              (modelAnswer.trim().startsWith('{') && modelAnswer.trim().endsWith('}')) ||
              modelAnswer.includes('"modelAnswer"')
            ) {
              try {
                // Try to parse it as JSON
                const parsed = JSON.parse(modelAnswer)
                if (parsed.modelAnswer) {
                  modelAnswer = parsed.modelAnswer
                }
              } catch {
                // If parsing fails, try to extract with regex
                const match = modelAnswer.match(/"modelAnswer"\s*:\s*"([\s\S]*?)"/)
                if (match && match[1]) {
                  modelAnswer = match[1].replace(/\\"/g, '"')
                }
              }
            }

            children.push(
              new docx.Paragraph({
                text: 'Model Answer:',
                heading: docx.HeadingLevel.HEADING_4,
                spacing: { before: 200, after: 100 },
              }),
            )

            children.push(
              new docx.Paragraph({
                text: modelAnswer,
                spacing: { after: 200 },
              }),
            )
          }

          // Explanation/Grading Criteria
          if (question.explanation) {
            children.push(
              new docx.Paragraph({
                text: 'Marking Criteria:',
                heading: docx.HeadingLevel.HEADING_4,
                spacing: { before: 200, after: 100 },
              }),
            )

            if (typeof question.explanation === 'string') {
              // Handle string explanation
              children.push(
                new docx.Paragraph({
                  text: question.explanation,
                  spacing: { after: 200 },
                }),
              )
            } else if (typeof question.explanation === 'object') {
              // Handle criteria as paragraphs
              if (
                Array.isArray(question.explanation.criteria) &&
                question.explanation.criteria.length > 0
              ) {
                children.push(
                  new docx.Paragraph({
                    text: 'Criteria:',
                    style: 'strongText',
                    spacing: { before: 100, after: 100 },
                  }),
                )

                question.explanation.criteria.forEach(
                  (criterion: { name: string; weight: number; description?: string } | string) => {
                    if (typeof criterion === 'object' && criterion.name) {
                      children.push(
                        new docx.Paragraph({
                          children: [
                            new docx.TextRun({ text: criterion.name || 'Criterion', bold: true }),
                            new docx.TextRun({ text: ` (${criterion.weight || 0}%)` }),
                          ],
                          spacing: { after: 100 },
                        }),
                      )

                      if (criterion.description) {
                        children.push(
                          new docx.Paragraph({
                            text: criterion.description,
                            spacing: { after: 200 },
                            indent: { left: 720 },
                          }),
                        )
                      }
                    } else if (typeof criterion === 'string') {
                      children.push(
                        new docx.Paragraph({
                          text: criterion,
                          spacing: { after: 100 },
                        }),
                      )
                    }
                  },
                )
              }

              // Handle mark allocation as paragraphs
              if (
                Array.isArray(question.explanation.markAllocation) &&
                question.explanation.markAllocation.length > 0
              ) {
                children.push(
                  new docx.Paragraph({
                    text: 'Mark Allocation:',
                    style: 'strongText',
                    spacing: { before: 200, after: 100 },
                  }),
                )

                question.explanation.markAllocation.forEach(
                  (item: { component: string; marks: number; description?: string }) => {
                    children.push(
                      new docx.Paragraph({
                        children: [
                          new docx.TextRun({ text: item.component || 'Component', bold: true }),
                          new docx.TextRun({ text: ` (${item.marks || 0} marks)` }),
                        ],
                        spacing: { after: 100 },
                      }),
                    )

                    if (item.description) {
                      children.push(
                        new docx.Paragraph({
                          text: item.description,
                          spacing: { after: 200 },
                          indent: { left: 720 },
                        }),
                      )
                    }
                  },
                )
              }
            }
          }
        }

        // Add a page break after every question (except the last one)
        if (index < assessment.exampleQuestions.length - 1) {
          children.push(
            new docx.Paragraph({
              children: [new docx.PageBreak()],
            }),
          )
        }
      }
    }

    // Create the document
    const doc = new docx.Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1000,
                right: 1000,
                bottom: 1000,
                left: 1000,
              },
            },
          },
          headers: {
            default: header,
          },
          footers: {
            default: footer,
          },
          children: children,
        },
      ],
      styles: {
        paragraphStyles: [
          {
            id: 'footer',
            name: 'Footer',
            run: {
              size: 20,
              color: '666666',
            },
          },
          {
            id: 'strongText',
            name: 'Strong Text',
            run: {
              bold: true,
            },
          },
          {
            id: 'criteriaDescription',
            name: 'Criteria Description',
            run: {
              size: 20,
              color: '1a56db',
              italics: true,
            },
          },
          {
            id: 'weightText',
            name: 'Weight Text',
            run: {
              size: 18,
              color: '666666',
              italics: true,
            },
          },
          {
            id: 'code',
            name: 'Code',
            run: {
              font: 'Courier New',
              size: 20,
            },
            paragraph: {
              spacing: { before: 40, after: 40 },
              indent: { left: 720 },
              shading: {
                type: docx.ShadingType.SOLID,
                color: 'F5F5F5',
              },
            },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: 'projectPoints',
            levels: Array.from({ length: 5 }, (_, i) => ({
              level: i,
              format: 'decimal',
              text: '', // e.g., "1.", "1.1.", etc.
              alignment: 'start',
              style: {
                paragraph: {
                  indent: { left: 240 * (i + 1), hanging: 120 },
                },
              },
            })),
          },
          {
            reference: 'bulletPoints',
            levels: Array.from({ length: 5 }, (_, i) => ({
              level: i,
              format: docx.LevelFormat.BULLET,
              text: '',
              alignment: 'start',
              style: {
                paragraph: {
                  indent: { left: 240 * (i + 1), hanging: 120 },
                },
              },
            })),
          },
        ],
      },
    })

    // Generate buffer
    return docx.Packer.toBuffer(doc)
  } catch (error: unknown) {
    console.error('Error generating Word document:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    throw new Error('Failed to generate Word document: ' + errorMessage)
  }
}
