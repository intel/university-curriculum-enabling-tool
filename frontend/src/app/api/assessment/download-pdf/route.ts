import { NextResponse, type NextRequest } from 'next/server'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AssessmentIdea, AssessmentDocxContent } from '@/lib/types/assessment-types'

// Update the POST handler to extract course information from the request
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming request body
    const { assessmentType, difficultyLevel, courseInfo } = await request.json()

    // Extract data from courseInfo
    const { assessment, format, metadata } = courseInfo || {}

    // Log the parsed data for debugging
    console.log('Parsed request data:', {
      assessmentType,
      difficultyLevel,
      assessment,
      format,
      metadata,
    })

    console.log(`Generating PDF for assessment (${format} format):`, assessment.type)

    // Generate the PDF file based on the requested format
    const pdfBuffer = await generatePDF(
      assessment,
      assessmentType,
      difficultyLevel,
      format || 'lecturer', // Default to lecturer format if not specified
      metadata || {
        courseCode: '',
        courseName: '',
        examTitle: assessment.type + ' Assessment',
      },
    )

    if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
      console.error('Invalid PDF buffer returned:', typeof pdfBuffer)
      return NextResponse.json({ error: 'Failed to generate valid PDF file' }, { status: 500 })
    }

    console.log('PDF generated successfully, buffer size:', pdfBuffer.length)

    // Return the PDF file as a downloadable response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(
          assessment.type.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
        )}_assessment_${format || 'lecturer'}.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating PDF:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: 'Failed to generate PDF document: ' + errorMessage },
      { status: 500 },
    )
  }
}

async function generatePDF(
  assessment: AssessmentIdea,
  assessmentType: string,
  difficultyLevel: string,
  format: string,
  metadata: AssessmentDocxContent['metadata'],
): Promise<Buffer> {
  metadata = metadata || {
    courseCode: '',
    courseName: '',
    examTitle: assessment.type + ' Assessment',
  }

  // Create a new jsPDF instance (A4 size in portrait orientation)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Add custom font if needed
  pdf.setFont('helvetica')

  // Define page dimensions and margins (in mm)
  const pageWidth = 210
  const pageHeight = 297
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  // Define standard font sizes
  const FONT_SIZE_STANDARD = 12
  const FONT_SIZE_TITLE = 14
  const FONT_SIZE_SUBTITLE = 12
  const FONT_SIZE_RUBRIC_TITLE = 16
  const FONT_SIZE_RUBRIC_SECTION = 14
  const FONT_SIZE_RUBRIC_CONTENT = 10

  const addHeader = () => {
    pdf.setFontSize(FONT_SIZE_STANDARD)
    pdf.setTextColor(0, 0, 0)
    pdf.text('SULIT', pageWidth - margin - 10, 10)
  }

  // Generate HTML content based on the requested format
  const isStudentFormat = format === 'student'
  const isProjectType = assessment.type.toLowerCase().includes('project')

  // Add header to first page
  addHeader()

  // Add title and course information with proper styling
  pdf.setFontSize(FONT_SIZE_TITLE)
  pdf.setFont('helvetica', 'bold')
  const title = metadata.examTitle || assessment.type + ' Assessment'
  pdf.text(title, pageWidth / 2, margin, { align: 'center' })

  pdf.setFontSize(FONT_SIZE_SUBTITLE)
  pdf.setFont('helvetica', 'bold')
  pdf.text(
    `${metadata.courseCode || ''} – ${metadata.courseName || ''}`,
    pageWidth / 2,
    margin + 10,
    {
      align: 'center',
    },
  )

  let yPosition = margin + 20

  // Special handling for project type
  if (isProjectType) {
    // Project description
    const projectDescription = assessment.exampleQuestions[0].question || ''

    // Check which metadata fields are already in the project description
    const containsSemester = projectDescription.includes(metadata.semester || '')
    const containsAcademicYear = projectDescription.includes(metadata.academicYear || '')
    const containsDeadline = projectDescription.includes(metadata.deadline || '')
    const containsGroupSize = new RegExp(`group.*?${metadata.groupSize || 4}`, 'i').test(
      projectDescription,
    )

    // Add project-specific information
    pdf.setFontSize(FONT_SIZE_STANDARD)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      `Duration: ${metadata.projectDuration || assessment.duration}`,
      pageWidth / 2,
      yPosition,
      {
        align: 'center',
      },
    )
    yPosition += 10

    // Add project info
    pdf.setFontSize(FONT_SIZE_STANDARD)
    pdf.setFont('helvetica', 'normal')

    let infoYPosition = yPosition

    if (!containsSemester && metadata.semester) {
      pdf.text(`Semester: ${metadata.semester}`, margin, infoYPosition)
      infoYPosition += 6
    }

    if (!containsAcademicYear && metadata.academicYear) {
      pdf.text(`Academic Year: ${metadata.academicYear}`, margin, infoYPosition)
      infoYPosition += 6
    }

    if (!containsDeadline && metadata.deadline) {
      pdf.text(`Submission Deadline: ${metadata.deadline}`, margin, infoYPosition)
      infoYPosition += 6
    }

    if (!containsGroupSize && metadata.groupSize) {
      pdf.text(`Group Size: ${metadata.groupSize} members per group`, margin, infoYPosition)
      infoYPosition += 6
    }

    yPosition = infoYPosition + 10

    // Process project description
    pdf.setFontSize(FONT_SIZE_STANDARD)

    // Split project description into sections
    const sections = projectDescription.split('\n')
    const lineHeight = 6
    const marginLeft = margin
    const maxWidth = contentWidth

    for (const section of sections) {
      const lines = section.split('\n')

      for (let rawLine of lines) {
        const x = marginLeft
        let indentOffset = 0
        let bulletSymbol = ''

        const bulletMatch = rawLine.match(/^(\s*)(([*\-+])|(\d+\.))\s+(.*)/)

        if (bulletMatch) {
          const indentStr = bulletMatch[1]

          // Count tab/space-based indentation
          let spaceCount = 0
          for (const char of indentStr) {
            spaceCount += char === '\t' ? 4 : 1
          }

          const indentLevel = Math.floor(spaceCount / 4)
          indentOffset = indentLevel * 10

          // Determine symbol
          const unorderedBullet = bulletMatch[3]
          const numberedBullet = bulletMatch[4]
          const bulletText = bulletMatch[5]

          bulletSymbol = unorderedBullet ? '• ' : numberedBullet + ' '

          rawLine = bulletSymbol + bulletText
        }

        let localX = x + indentOffset

        const parts = rawLine.split('**')

        for (let i = 0; i < parts.length; i++) {
          const chunk = parts[i]
          if (!chunk) continue

          const fontStyle = i % 2 === 0 ? 'normal' : 'bold'
          pdf.setFont('helvetica', fontStyle)

          let remainingText = chunk

          while (remainingText.length > 0) {
            const availableWidth = maxWidth - (localX - marginLeft)
            const [linePart] = pdf.splitTextToSize(remainingText, availableWidth)

            if (yPosition + lineHeight > pageHeight - margin) {
              pdf.addPage()
              yPosition = margin
              addHeader()
            }

            // Draw line at correct x position
            pdf.text(linePart, localX, yPosition)

            remainingText = remainingText.slice(linePart.length).trim()

            // Wraps to next line
            if (remainingText.length > 0) {
              yPosition += lineHeight
              localX = x + indentOffset
            } else {
              localX += pdf.getTextWidth(linePart)
            }
          }
        }

        yPosition += lineHeight
      }
    }

    // Add model answer if in lecturer format
    if (!isStudentFormat && assessment.exampleQuestions[0].correctAnswer) {
      const modelAnswer = cleanModelAnswer(assessment.exampleQuestions[0].correctAnswer)

      // Add page break before model answer
      pdf.addPage()
      yPosition = margin
      addHeader()

      // Add model answer title

      // Set base font
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setFont('helvetica', 'normal')

      const answerSections = modelAnswer.split('\n')

      for (const rawSection of answerSections) {
        let rawLine = rawSection
        const x = margin
        let indentOffset = 0
        let bulletSymbol = ''

        const bulletMatch = rawLine.match(/^(\s*)(([*\-+])|(\d+\.))\s+(.*)/)

        if (bulletMatch) {
          const indentStr = bulletMatch[1]

          // Calculate indentation width
          let spaceCount = 0
          for (const char of indentStr) {
            spaceCount += char === '\t' ? 4 : 1
          }

          const indentLevel = Math.floor(spaceCount / 4)
          indentOffset = indentLevel * 10

          // Detect bullet type
          const unorderedBullet = bulletMatch[3]
          const numberedBullet = bulletMatch[4]
          const bulletText = bulletMatch[5]

          bulletSymbol = unorderedBullet ? '• ' : numberedBullet + ' '
          rawLine = bulletSymbol + bulletText
        }

        // Text with bold segments
        let localX = x + indentOffset
        const parts = rawLine.split('**')

        for (let i = 0; i < parts.length; i++) {
          const chunk = parts[i]
          if (!chunk) continue

          const fontStyle = i % 2 === 0 ? 'normal' : 'bold'
          pdf.setFont('helvetica', fontStyle)

          let remainingText = chunk

          while (remainingText.length > 0) {
            const availableWidth = contentWidth - (localX - margin)
            const [linePart] = pdf.splitTextToSize(remainingText, availableWidth)

            if (yPosition + lineHeight > pageHeight - margin) {
              pdf.addPage()
              yPosition = margin
              addHeader()
            }

            // Render line
            pdf.text(linePart, localX, yPosition)

            remainingText = remainingText.slice(linePart.length).trim()

            if (remainingText.length > 0) {
              yPosition += lineHeight
              localX = x + indentOffset // maintain indent for wrapped lines
            } else {
              localX += pdf.getTextWidth(linePart)
            }
          }
        }

        yPosition += lineHeight
      }
    }

    // Add grading rubrics if in lecturer format
    if (!isStudentFormat && assessment.exampleQuestions[0].explanation) {
      // Add page break before rubrics
      pdf.addPage()
      yPosition = margin
      addHeader()

      // Add rubrics title with centered, bold styling
      pdf.setFontSize(FONT_SIZE_RUBRIC_TITLE)
      pdf.setFont('helvetica', 'bold')
      pdf.text('GRADING RUBRICS', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      // Add marking scale with normal font
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        'Marking Scale: 1 - Poor, 2 - Acceptable, 3 - Average, 4 - Good, 5- Excellent.',
        margin,
        yPosition,
      )
      yPosition += 10

      const explanation = assessment.exampleQuestions[0].explanation
      if (typeof explanation === 'object' && Array.isArray(explanation.criteria)) {
        // Group criteria by category
        const reportCriteria = explanation.criteria.filter(
          (c): c is { name: string; weight: number; description?: string } =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Report'),
        )
        const demoCriteria = explanation.criteria.filter(
          (c): c is { name: string; weight: number; description?: string } =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Demo'),
        )
        const individualCriteria = explanation.criteria.filter(
          (c): c is { name: string; weight: number; description?: string } =>
            typeof c === 'object' &&
            c !== null &&
            'name' in c &&
            typeof c.name === 'string' &&
            c.name.includes('Individual'),
        )
        // Add Report criteria table
        if (reportCriteria.length > 0) {
          // Add section title with bold font
          pdf.setFontSize(FONT_SIZE_RUBRIC_SECTION)
          pdf.setFont('helvetica', 'bold')
          pdf.text('REPORT (55%)', margin, yPosition)
          yPosition += 8

          // Create table data
          const tableHead = [
            [
              'Criteria',
              'Excellent (5)\nA, A-',
              'Good (4)\nB+, B, B-',
              'Average (3)\nC+, C',
              'Acceptable (2)\nC-, D+',
              'Poor (1)\nD, D-, F',
            ],
          ]

          const tableBody = reportCriteria.map((criterion) => {
            const criterionName = criterion.name.replace('Report - ', '')
            return [
              `${criterionName}\n(${criterion.weight}%)`,
              'Demonstrates exceptional performance.',
              'Shows strong performance with minor areas for improvement.',
              'Demonstrates adequate performance meeting basic requirements.',
              'Shows minimal acceptable performance with significant room for improvement.',
              'Fails to demonstrate adequate performance, falling below minimum requirements.',
            ]
          })

          // Add table to PDF with improved styling
          autoTable(pdf, {
            head: tableHead,
            body: tableBody,
            startY: yPosition,
            margin: { left: margin, right: margin },
            styles: {
              overflow: 'linebreak',
              cellPadding: 3,
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
              font: 'helvetica',
            },
            headStyles: {
              fillColor: [240, 240, 240],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            bodyStyles: {
              fillColor: [255, 255, 255], // White background for body rows
              textColor: [0, 0, 0],
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            didDrawPage: () => {
              addHeader()
            },
          })

          // Get the final Y position after the table
          const finalY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
            .finalY
          yPosition = finalY + 10

          // Check if we need a new page
          if (yPosition > pageHeight - margin - 40) {
            pdf.addPage()
            yPosition = margin
            addHeader()
          }
        }

        // Add Demo criteria table
        if (demoCriteria.length > 0) {
          // Add section title with bold font
          pdf.setFontSize(FONT_SIZE_RUBRIC_SECTION)
          pdf.setFont('helvetica', 'bold')
          pdf.text('DEMO PRESENTATION (30%)', margin, yPosition)
          yPosition += 8

          // Create table data
          const tableHead = [
            [
              'Criteria',
              'Excellent (5)\nA, A-',
              'Good (4)\nB+, B, B-',
              'Average (3)\nC+, C',
              'Acceptable (2)\nC-, D+',
              'Poor (1)\nD, D-, F',
            ],
          ]

          const tableBody = demoCriteria.map((criterion) => {
            const criterionName = criterion.name.replace('Demo - ', '')
            return [
              `${criterionName}\n(${criterion.weight}%)`,
              'Demonstrates exceptional performance.',
              'Shows strong performance with minor areas for improvement.',
              'Demonstrates adequate performance meeting basic requirements.',
              'Shows minimal acceptable performance with significant room for improvement.',
              'Fails to demonstrate adequate performance, falling below minimum requirements.',
            ]
          })

          // Add table to PDF with improved styling
          autoTable(pdf, {
            head: tableHead,
            body: tableBody,
            startY: yPosition,
            margin: { left: margin, right: margin },
            styles: {
              overflow: 'linebreak',
              cellPadding: 3,
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
              font: 'helvetica',
            },
            headStyles: {
              fillColor: [240, 240, 240],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            bodyStyles: {
              fillColor: [255, 255, 255], // White background for body rows
              textColor: [0, 0, 0],
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            didDrawPage: () => {
              addHeader()
            },
          })

          // Get the final Y position after the table
          const finalY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
            .finalY
          yPosition = finalY + 10

          // Check if we need a new page
          if (yPosition > pageHeight - margin - 40) {
            pdf.addPage()
            yPosition = margin
            addHeader()
          }
        }

        // Add Individual Contribution criteria table
        if (individualCriteria.length > 0) {
          // Add section title with bold font
          pdf.setFontSize(FONT_SIZE_RUBRIC_SECTION)
          pdf.setFont('helvetica', 'bold')
          pdf.text('INDIVIDUAL CONTRIBUTION (15%)', margin, yPosition)
          yPosition += 8

          // Create table data
          const tableHead = [
            [
              'Criteria',
              'Excellent (5)\nA, A-',
              'Good (4)\nB+, B, B-',
              'Average (3)\nC+, C',
              'Acceptable (2)\nC-, D+',
              'Poor (1)\nD, D-, F',
            ],
          ]

          const tableBody = individualCriteria.map((criterion) => {
            const criterionName = criterion.name.replace('Individual Contribution - ', '')
            return [
              `${criterionName}\n(${criterion.weight}%)`,
              'Demonstrates exceptional performance.',
              'Shows strong performance with minor areas for improvement.',
              'Demonstrates adequate performance meeting basic requirements.',
              'Shows minimal acceptable performance with significant room for improvement.',
              'Fails to demonstrate adequate performance, falling below minimum requirements.',
            ]
          })

          // Add table to PDF with improved styling
          autoTable(pdf, {
            head: tableHead,
            body: tableBody,
            startY: yPosition,
            margin: { left: margin, right: margin },
            styles: {
              overflow: 'linebreak',
              cellPadding: 3,
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
              font: 'helvetica',
            },
            headStyles: {
              fillColor: [240, 240, 240],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            bodyStyles: {
              fillColor: [255, 255, 255], // White background for body rows
              textColor: [0, 0, 0],
              fontSize: FONT_SIZE_RUBRIC_CONTENT,
            },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            didDrawPage: () => {
              addHeader()
            },
          })
        }
      }
    }
  } else {
    // Regular assessment template (non-project)
    pdf.setFontSize(FONT_SIZE_STANDARD)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Duration: ${assessment.duration}`, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10

    // Add instructions
    pdf.text(
      'Please ensure that this examination paper is complete before you begin the examination.',
      margin,
      yPosition,
    )
    yPosition += 6
    pdf.text(
      `Instructions: Answer all ${assessment.exampleQuestions.length} questions.`,
      margin,
      yPosition,
    )
    yPosition += 6
    pdf.text(
      'You may answer the questions either in English or in Bahasa Malaysia.',
      margin,
      yPosition,
    )
    yPosition += 6
    pdf.text(
      'In the event of any discrepancies, the English version shall be used.',
      margin,
      yPosition,
    )
    yPosition += 10

    // Add page break after instructions
    pdf.addPage()
    yPosition = margin
    addHeader()

    // Process each question
    for (let i = 0; i < assessment.exampleQuestions.length; i++) {
      const question = assessment.exampleQuestions[i]

      // Add question number with bold font
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${i + 1}.`, margin, yPosition)
      yPosition += 6

      // Add question text with normal font
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setFont('helvetica', 'normal')
      const questionLines = pdf.splitTextToSize(question.question, contentWidth - 10)

      // Check if we need a new page
      if (yPosition + questionLines.length * 6 > pageHeight - margin) {
        pdf.addPage()
        yPosition = margin
        addHeader()
      }

      pdf.text(questionLines, margin + 10, yPosition)
      yPosition += questionLines.length * 6 + 5

      // Add options if available
      if (question.options && question.options.length > 0) {
        yPosition += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Options:', margin + 10, yPosition)
        yPosition += 6
        pdf.setFont('helvetica', 'normal')

        for (let j = 0; j < question.options.length; j++) {
          const optionLines = pdf.splitTextToSize(question.options[j], contentWidth - 20)

          // Check if we need a new page
          if (yPosition + optionLines.length * 6 > pageHeight - margin) {
            pdf.addPage()
            yPosition = margin
            addHeader()
          }

          pdf.text(`${String.fromCharCode(65 + j)}.`, margin + 10, yPosition)
          pdf.text(optionLines, margin + 20, yPosition)
          yPosition += optionLines.length * 6
        }
      }

      // Add model answer if in lecturer format
      if (!isStudentFormat && question.correctAnswer) {
        const modelAnswer = cleanModelAnswer(question.correctAnswer)

        yPosition += 10
        pdf.setFont('helvetica', 'bold')
        pdf.text('Model Answer:', margin + 10, yPosition)
        yPosition += 6
        pdf.setFont('helvetica', 'normal')

        const answerLines = pdf.splitTextToSize(modelAnswer, contentWidth - 20)

        // Check if we need a new page
        if (yPosition + answerLines.length * 6 > pageHeight - margin) {
          pdf.addPage()
          yPosition = margin
          addHeader()
        }

        pdf.text(answerLines, margin + 10, yPosition)
        yPosition += answerLines.length * 6
      }

      // Add marking criteria if in lecturer format
      if (!isStudentFormat && question.explanation) {
        yPosition += 10
        pdf.setFont('helvetica', 'bold')
        pdf.text('Marking Criteria:', margin + 10, yPosition)
        yPosition += 6
        pdf.setFont('helvetica', 'normal')

        let explanationText = ''

        if (typeof question.explanation === 'string') {
          explanationText = question.explanation
        } else if (typeof question.explanation === 'object') {
          // Format criteria
          if (Array.isArray(question.explanation.criteria)) {
            explanationText += 'Criteria:\n'
            for (const criterion of question.explanation.criteria) {
              if (typeof criterion === 'object' && criterion !== null && 'name' in criterion) {
                explanationText += `- ${criterion.name} (${criterion.weight}%): ${criterion.description || ''}\n`
              } else if (typeof criterion === 'string') {
                explanationText += `- ${criterion}\n`
              }
            }
          }

          // Format mark allocation
          if (Array.isArray(question.explanation.markAllocation)) {
            explanationText += '\nMark Allocation:\n'
            for (const item of question.explanation.markAllocation) {
              explanationText += `- ${item.component} (${item.marks} marks): ${item.description || ''}\n`
            }
          }
        }

        const explanationLines = pdf.splitTextToSize(explanationText, contentWidth - 20)

        // Check if we need a new page
        if (yPosition + explanationLines.length * 6 > pageHeight - margin) {
          pdf.addPage()
          yPosition = margin
          addHeader()
        }

        pdf.text(explanationLines, margin + 10, yPosition)
        yPosition += explanationLines.length * 6
      }

      // Add page break after each question except the last one
      if (i < assessment.exampleQuestions.length - 1) {
        pdf.addPage()
        yPosition = margin
        addHeader()
      }
    }
  }

  // Count total pages
  const totalPages = pdf.getNumberOfPages()

  // Add footers to all pages with correct page numbers
  const addFooter = (pageNum: number, totalPages: number) => {
    pdf.setFontSize(FONT_SIZE_STANDARD)
    pdf.setTextColor(0, 0, 0)
    pdf.text('SULIT', margin, pageHeight - 10)
    pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 30, pageHeight - 10)
  }

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    addFooter(i, totalPages)
  }

  // Convert the PDF to a Buffer
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}

// Helper function to clean model answer if it's in JSON format
function cleanModelAnswer(answer: string | undefined): string {
  if (!answer) return ''

  // Check if the answer looks like JSON
  if (
    (answer.trim().startsWith('{') && answer.trim().endsWith('}')) ||
    answer.includes('"modelAnswer"')
  ) {
    try {
      // Try to parse it as JSON
      const parsed = JSON.parse(answer)
      if (parsed.modelAnswer) {
        return parsed.modelAnswer
      }
    } catch {
      // If parsing fails, try to extract with regex
      const match = answer.match(/"modelAnswer"\s*:\s*"([\s\S]*?)"/)
      if (match && match[1]) {
        return match[1].replace(/\\"/g, '"')
      }
    }
  }

  return answer
}
