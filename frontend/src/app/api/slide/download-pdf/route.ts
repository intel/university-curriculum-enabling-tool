import { NextResponse, type NextRequest } from 'next/server'
import jsPDF from 'jspdf'
import type { LectureContent } from '../types'
import type { ExplanationObject } from '@/lib/types/assessment-types'

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json()

    if (!content || !content.title || !content.slides) {
      return NextResponse.json({ error: 'Invalid content structure' }, { status: 400 })
    }

    console.log('Generating PDF for:', content.title)

    // Generate the PDF file
    const pdfBuffer = await generatePDF(content)

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
          content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
        )}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Failed to generate PDF document' }, { status: 500 })
  }
}

async function generatePDF(content: LectureContent): Promise<Buffer> {
  // Create a new jsPDF instance (A4 size in portrait orientation)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Define page dimensions and margins (in mm)
  const pageWidth = 210
  const pageHeight = 297
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  // Define colors to match the images
  const purpleColor = [94, 53, 177] // RGB for #5E35B1 (purple)
  const lightBlueColor = [240, 248, 255] // RGB for #F0F8FF (light blue background)

  // Define standard font sizes
  const FONT_SIZE_SECTION_TITLE = 16
  const FONT_SIZE_TITLE = 14
  const FONT_SIZE_SUBTITLE = 12
  const FONT_SIZE_STANDARD = 11
  const FONT_SIZE_SMALL = 10
  const FONT_SIZE_FOOTER = 10

  // Add custom font if needed
  pdf.setFont('helvetica')

  // Function to add a page break
  const addPageBreak = () => {
    pdf.addPage()
    addFooter()
  }

  // Function to add footer
  const addFooter = () => {
    pdf.setFontSize(FONT_SIZE_FOOTER)
    pdf.setTextColor(100, 100, 100) // Gray color
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    })
  }

  // Function to add a section header
  const addSectionHeader = (title: string, yPos: number) => {
    // Add section title
    pdf.setFontSize(FONT_SIZE_SECTION_TITLE)
    pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
    pdf.setFont('helvetica', 'bold')
    pdf.text(title, margin, yPos)

    // Add horizontal line
    yPos += 5
    pdf.setDrawColor(200, 200, 200) // Light gray
    pdf.line(margin, yPos, pageWidth - margin, yPos)

    return yPos + 10
  }

  // Start adding content to PDF
  let yPosition = margin

  // Add title
  pdf.setFontSize(FONT_SIZE_TITLE)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'bold')
  pdf.text(content.title, margin, yPosition)
  yPosition += 8

  // Add metadata
  pdf.setFontSize(FONT_SIZE_STANDARD)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Content Type: ${content.contentType || 'Lecture'}`, margin, yPosition)
  yPosition += 6
  pdf.text(`Difficulty Level: ${content.difficultyLevel || 'Intermediate'}`, margin, yPosition)
  yPosition += 10

  // Add Introduction
  if (content.introduction && content.introduction.trim() !== '') {
    pdf.setFont('helvetica', 'bold')
    pdf.text('Introduction', margin, yPosition)
    yPosition += 6

    // Add introduction text
    pdf.setFont('helvetica', 'normal')
    const introLines = pdf.splitTextToSize(content.introduction, contentWidth)
    pdf.text(introLines, margin, yPosition)
    yPosition += introLines.length * 6
  }

  // Add Learning Outcomes
  pdf.setFont('helvetica', 'bold')
  pdf.text('Learning Outcomes', margin, yPosition)
  yPosition += 6

  // Add learning outcomes as a numbered list
  pdf.setFont('helvetica', 'normal')
  for (let i = 0; i < content.learningOutcomes.length; i++) {
    const outcomeLines = pdf.splitTextToSize(
      `${i + 1}. ${content.learningOutcomes[i]}`,
      contentWidth,
    )
    pdf.text(outcomeLines, margin, yPosition)
    yPosition += outcomeLines.length * 6
  }
  yPosition += 5

  // --- KEY TERMS SECTION ---
  if (content.keyTerms && content.keyTerms.length > 0) {
    addPageBreak()
    yPosition = margin
    yPosition = addSectionHeader('Key Terms', yPosition)

    // Set smaller font for key terms and definitions
    const KEY_TERM_FONT_SIZE = 11
    const KEY_TERM_DEF_FONT_SIZE = 10

    // Add each key term - matching the image format
    for (const term of content.keyTerms) {
      // Check if we need a new page
      if (yPosition > pageHeight - margin - 20) {
        addPageBreak()
        yPosition = margin
        // Ensure font is reset after page break
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(KEY_TERM_FONT_SIZE)
      }

      // Add term name in bold, smaller font
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(KEY_TERM_FONT_SIZE)
      pdf.setTextColor(0, 0, 0)
      pdf.text(term.term, margin, yPosition)
      yPosition += 6

      // Add definition with indentation, smaller font
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(KEY_TERM_DEF_FONT_SIZE)
      const definitionLines = pdf.splitTextToSize(term.definition, contentWidth - 10)
      pdf.text(definitionLines, margin + 10, yPosition)
      yPosition += definitionLines.length * 5 + 7
    }
  }

  // --- SLIDES SECTION ---
  if (content.slides && content.slides.length > 0) {
    addPageBreak()
    yPosition = margin
    yPosition = addSectionHeader('Slides', yPosition)

    // Add each slide - matching the image format exactly
    for (let i = 0; i < content.slides.length; i++) {
      const slide = content.slides[i]

      // Check if we need a new page
      if (yPosition > pageHeight - margin - 80) {
        addPageBreak()
        yPosition = margin
        // Re-add the section header if we're at the start of a new page
        yPosition = addSectionHeader('Slides', yPosition)
      }

      // Calculate height needed for this slide
      const slideContentLines = slide.content
        .map((point: string) => pdf.splitTextToSize(point, contentWidth - 25))
        .reduce((acc, lines) => acc + lines.length, 0)
      const slideContentHeight = slideContentLines * 6 + slide.content.length * 2 + 5 // reduced bottom space

      // Wrap speaker notes text if too long
      const speakerNotesBoxWidth = contentWidth - 16
      const label = 'Speaker Notes:'
      pdf.setFontSize(FONT_SIZE_SMALL)
      pdf.setFont('helvetica', 'bold')

      // Wrap speaker notes content to fit inside the box, full width minus padding
      const speakerNotesLinesBox = pdf.splitTextToSize(slide.notes, speakerNotesBoxWidth - 16)
      // Height: label line + content lines + top/bottom padding (6+6+2)
      const speakerNotesHeightBox = 6 + speakerNotesLinesBox.length * 6 + 2 // reduced bottom padding

      // Calculate total height for the slide box (title + content + speaker notes + spacing)
      const totalSlideHeight = 25 + slideContentHeight + speakerNotesHeightBox + 5 // reduced bottom space

      // Draw the vertical purple line on the left
      pdf.setDrawColor(purpleColor[0], purpleColor[1], purpleColor[2])
      pdf.setLineWidth(2)
      pdf.line(margin, yPosition, margin, yPosition + totalSlideHeight)
      pdf.setLineWidth(0.1)

      // Draw the slide background (now includes speaker notes)
      pdf.setFillColor(245, 247, 250) // Light gray background #F5F7FA
      pdf.rect(margin + 2, yPosition, contentWidth - 2, totalSlideHeight, 'F')

      // Add slide number and title in purple
      pdf.setFontSize(FONT_SIZE_TITLE)
      pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${i + 1}. ${slide.title}`, margin + 10, yPosition + 15)
      let slideY = yPosition + 30

      // Add slide content as bullet points
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')

      for (const point of slide.content) {
        const pointLines = pdf.splitTextToSize(point, contentWidth - 25)
        pdf.text('•', margin + 10, slideY)
        pdf.text(pointLines, margin + 15, slideY)
        slideY += pointLines.length * 6 + 2
      }

      slideY += 3 // reduced space before speaker notes

      // Draw the speaker notes box inside the slide box
      pdf.setFillColor(240, 240, 240) // Light gray for speaker notes
      pdf.rect(margin + 8, slideY, speakerNotesBoxWidth, speakerNotesHeightBox, 'F')

      // Draw label
      pdf.setFontSize(FONT_SIZE_SMALL)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(80, 80, 80)
      pdf.text(label, margin + 12, slideY + 8)

      // Draw content one line below the label, left-aligned with label
      pdf.setFont('helvetica', 'italic')
      pdf.text(speakerNotesLinesBox, margin + 12, slideY + 14)

      // Move yPosition for next slide
      yPosition += totalSlideHeight + 2 // reduced space after slide
    }
  }

  // --- ACTIVITIES SECTION ---
  if (content.activities && content.activities.length > 0) {
    addPageBreak()
    yPosition = margin
    yPosition = addSectionHeader('Activities', yPosition)

    for (let a = 0; a < content.activities.length; a++) {
      const activity = content.activities[a]
      if (a > 0) {
        addPageBreak()
        yPosition = margin
        yPosition = addSectionHeader('Activities', yPosition)
      }

      // Estimate activity box height (you can refine this as needed)
      let activityHeight = 40 // base height for title/meta/desc
      const descLines = pdf.splitTextToSize(activity.description, contentWidth - 20)
      activityHeight += descLines.length * 6

      let instructionsHeight = 0
      for (let i = 0; i < activity.instructions.length; i++) {
        const instructionLines = pdf.splitTextToSize(activity.instructions[i], contentWidth - 30)
        instructionsHeight += instructionLines.length * 6 + 2
      }
      activityHeight += 12 + instructionsHeight // header + instructions

      let materialsHeight = 0
      for (const material of activity.materials) {
        const materialLines = pdf.splitTextToSize(material, contentWidth - 30)
        materialsHeight += materialLines.length * 6 + 2
      }
      activityHeight += 12 + materialsHeight // header + materials

      // Draw the left border
      pdf.setDrawColor(0, 153, 255) // Light blue border
      pdf.setLineWidth(1.5)
      pdf.line(margin, yPosition, margin, yPosition + activityHeight)
      pdf.setLineWidth(0.1)

      // Draw the activity background
      pdf.setFillColor(lightBlueColor[0], lightBlueColor[1], lightBlueColor[2])
      pdf.rect(margin + 1.5, yPosition, contentWidth - 1.5, activityHeight, 'F')

      // Add activity title in purple
      pdf.setFontSize(FONT_SIZE_TITLE)
      pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
      pdf.setFont('helvetica', 'bold')
      pdf.text(activity.title, margin + 10, yPosition + 10)
      let activityY = yPosition + 15

      // Add activity meta (type and duration) on the same line
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Type: ${activity.type}`, margin + 10, activityY)
      pdf.text(`Duration: ${activity.duration}`, margin + contentWidth - 60, activityY)
      activityY += 10

      // Add activity description
      pdf.setFont('helvetica', 'normal')
      pdf.text(descLines, margin + 10, activityY)
      activityY += descLines.length * 6 + 5

      // Add instructions header in purple
      pdf.setFontSize(FONT_SIZE_SUBTITLE)
      pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
      pdf.setFont('helvetica', 'bold')
      pdf.text('Instructions:', margin + 10, activityY)
      activityY += 8

      // Add numbered instructions
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      for (let i = 0; i < activity.instructions.length; i++) {
        const instructionLines = pdf.splitTextToSize(activity.instructions[i], contentWidth - 30)
        pdf.text(`${i + 1}.`, margin + 10, activityY)
        pdf.text(instructionLines, margin + 20, activityY)
        activityY += instructionLines.length * 6 + 2
      }

      // Add materials needed header in purple
      pdf.setFontSize(FONT_SIZE_SUBTITLE)
      pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
      pdf.setFont('helvetica', 'bold')
      pdf.text('Materials Needed:', margin + 10, activityY + 6)
      activityY += 12

      // Add materials as bullet points
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      for (const material of activity.materials) {
        const materialLines = pdf.splitTextToSize(material, contentWidth - 30)
        pdf.text('•', margin + 10, activityY)
        pdf.text(materialLines, margin + 15, activityY)
        activityY += materialLines.length * 6 + 2
      }

      yPosition += activityHeight + 10 // Add space between activity boxes
    }
  }

  // --- ASSESSMENT IDEAS SECTION ---
  if (content.assessmentIdeas && content.assessmentIdeas.length > 0) {
    addPageBreak()
    yPosition = margin

    // Add Assessment Ideas section header with enhanced styling
    pdf.setFontSize(FONT_SIZE_SECTION_TITLE)
    pdf.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2])
    pdf.setFont('helvetica', 'bold')
    pdf.text('Assessment Ideas', margin, yPosition)

    // Add horizontal line
    yPosition += 5
    pdf.setDrawColor(200, 200, 200) // Light gray
    pdf.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 10

    // Separate quizzes and discussions
    const quizIdeas = content.assessmentIdeas.filter((idea) =>
      idea.type.toLowerCase().includes('quiz'),
    )
    const discussionIdeas = content.assessmentIdeas.filter((idea) =>
      idea.type.toLowerCase().includes('discussion'),
    )
    const otherIdeas = content.assessmentIdeas.filter(
      (idea) =>
        !idea.type.toLowerCase().includes('quiz') &&
        !idea.type.toLowerCase().includes('discussion'),
    )

    // --- QUIZ SECTION ---
    if (quizIdeas.length > 0) {
      // Add Quiz header with icon-like element
      pdf.setFillColor(79, 70, 229) // Purple
      pdf.circle(margin + 4, yPosition + 4, 4, 'F')

      pdf.setFontSize(FONT_SIZE_TITLE)
      pdf.setTextColor(79, 70, 229) // Purple
      pdf.setFont('helvetica', 'bold')
      pdf.text('Quiz Assessments', margin + 12, yPosition + 5)
      yPosition += 15

      for (const idea of quizIdeas) {
        // Calculate height for description box (title, meta, description, example questions header)
        const descLines = pdf.splitTextToSize(idea.description, contentWidth - 10)
        const descHeight = descLines.length * 6 + 5

        // Height for "Example Questions" header
        const exampleHeaderHeight = 15

        // Description box height (title/meta/desc/header)
        const descBoxHeight = 22 + descHeight + exampleHeaderHeight

        // Check if we need a new page for the description box
        if (yPosition > pageHeight - margin - descBoxHeight - 10) {
          addPageBreak()
          yPosition = margin
        }

        // Draw quiz description box
        pdf.setFillColor(245, 247, 250) // Light gray background
        pdf.roundedRect(margin, yPosition, contentWidth, descBoxHeight, 3, 3, 'F')

        // Add a colored stripe at the top
        pdf.setFillColor(79, 70, 229) // Purple
        pdf.rect(margin, yPosition, contentWidth, 5, 'F')

        // Assessment title and meta
        pdf.setFontSize(FONT_SIZE_SUBTITLE)
        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'bold')
        pdf.text(idea.type, margin + 10, yPosition + 13)

        // Duration with clock icon simulation
        pdf.setFontSize(FONT_SIZE_SMALL)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`⏱ Duration: ${idea.duration}`, margin + contentWidth - 70, yPosition + 13)

        // Description (inside the description box)
        pdf.setFontSize(FONT_SIZE_STANDARD)
        pdf.setFont('helvetica', 'normal')
        pdf.text(descLines, margin + 10, yPosition + 22)

        // "Example Questions" header
        pdf.setFillColor(230, 230, 250) // Lavender
        pdf.roundedRect(margin + 5, yPosition + 22 + descHeight, contentWidth - 10, 10, 2, 2, 'F')
        pdf.setFontSize(FONT_SIZE_SUBTITLE)
        pdf.setTextColor(79, 70, 229) // Purple
        pdf.setFont('helvetica', 'bold')
        pdf.text('Example Questions', margin + contentWidth / 2, yPosition + 22 + descHeight + 7, {
          align: 'center',
        })

        // Move yPosition below the description box for questions
        yPosition += descBoxHeight + 10

        // Now render each question as a separate box, each on a new page except the first (if you want)
        for (let q = 0; q < idea.exampleQuestions.length; q++) {
          if (q > 0) {
            addPageBreak()
            yPosition = margin
          }

          const question = idea.exampleQuestions[q]
          const questionLines = pdf.splitTextToSize(question.question, contentWidth - 50)
          const questionHeight = Math.max(questionLines.length * 6 + 10, 30)

          let optionsHeight = 0
          if (question.options && question.options.length > 0) {
            for (let o = 0; o < question.options.length; o++) {
              const optionLines = pdf.splitTextToSize(question.options[o], contentWidth - 70)
              optionsHeight += Math.max(optionLines.length * 6, 15)
            }
          }

          let answerHeight = 0
          let answerLines: string[] = []
          if (question.correctAnswer) {
            answerLines = pdf.splitTextToSize(question.correctAnswer, contentWidth - 100)
            answerHeight = Math.max(answerLines.length * 6, 15) + 2
          }

          let explanationHeight = 0
          let explanationLines: string[] = []
          if (question.explanation) {
            const explanationText =
              typeof question.explanation === 'string'
                ? question.explanation
                : JSON.stringify(question.explanation, null, 2)
            explanationLines = pdf.splitTextToSize(explanationText, contentWidth - 100)
            explanationHeight = Math.max(explanationLines.length * 6, 15) + 2
          }

          // Calculate total box height for this question
          const totalBoxHeight =
            questionHeight +
            optionsHeight +
            (answerHeight ? answerHeight + 5 : 0) +
            (explanationHeight ? explanationHeight + 5 : 0) +
            20

          // Draw question box with enough height
          pdf.setFillColor(250, 250, 250) // White
          pdf.setDrawColor(220, 220, 220) // Light gray border
          pdf.roundedRect(margin + 10, yPosition, contentWidth - 20, totalBoxHeight, 3, 3, 'FD')

          // Question number in a circle
          pdf.setFillColor(79, 70, 229) // Purple
          pdf.circle(margin + 25, yPosition + 15, 8, 'F')
          pdf.setTextColor(255, 255, 255) // White
          pdf.setFontSize(FONT_SIZE_SMALL)
          pdf.setFont('helvetica', 'bold')
          pdf.text(`${q + 1}`, margin + 25, yPosition + 17, { align: 'center' })

          // Question text
          pdf.setTextColor(0, 0, 0) // Black
          pdf.setFontSize(FONT_SIZE_STANDARD)
          pdf.setFont('helvetica', 'normal')
          pdf.text(questionLines, margin + 40, yPosition + 15)

          let qBoxY = yPosition + 15 + questionLines.length * 6 + 5

          // Options with attractive styling
          if (question.options && question.options.length > 0) {
            for (let o = 0; o < question.options.length; o++) {
              pdf.setFillColor(245, 247, 250) // Light gray
              pdf.roundedRect(margin + 30, qBoxY, contentWidth - 60, 10, 2, 2, 'F')

              pdf.setFillColor(200, 200, 230) // Light purple
              pdf.circle(margin + 40, qBoxY + 5, 5, 'F')
              pdf.setTextColor(0, 0, 0) // Black
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text(String.fromCharCode(65 + o), margin + 40, qBoxY + 7, { align: 'center' })

              pdf.setFont('helvetica', 'normal')
              const optionLines = pdf.splitTextToSize(question.options[o], contentWidth - 80)
              pdf.text(optionLines, margin + 50, qBoxY + 5)
              qBoxY += Math.max(optionLines.length * 6, 15)
            }
          }

          // Correct Answer with visual indicator
          if (question.correctAnswer) {
            qBoxY += 5
            pdf.setFillColor(230, 250, 230) // Light green
            pdf.roundedRect(margin + 30, qBoxY, contentWidth - 60, answerHeight, 2, 2, 'F')

            pdf.setTextColor(0, 130, 0) // Dark green
            pdf.setFontSize(FONT_SIZE_SMALL)
            pdf.setFont('helvetica', 'bold')
            pdf.text('Correct Answer:', margin + 40, qBoxY + 5)

            pdf.setTextColor(0, 0, 0) // Black
            pdf.setFont('helvetica', 'normal')
            pdf.text(answerLines, margin + 90, qBoxY + 5)
            qBoxY += answerHeight
          }

          // Explanation/Mark Allocation with visual styling
          if (question.explanation) {
            qBoxY += 5
            pdf.setFillColor(240, 245, 250) // Light blue
            pdf.roundedRect(margin + 30, qBoxY, contentWidth - 60, explanationHeight, 2, 2, 'F')

            pdf.setTextColor(0, 0, 150) // Dark blue
            pdf.setFontSize(FONT_SIZE_SMALL)
            pdf.setFont('helvetica', 'bold')
            pdf.text('Explanation:', margin + 40, qBoxY + 5)

            pdf.setTextColor(0, 0, 0) // Black
            pdf.setFont('helvetica', 'normal')
            pdf.text(explanationLines, margin + 90, qBoxY + 5)
            qBoxY += explanationHeight
          }

          yPosition += totalBoxHeight + 15 // Space between questions
        }
      }
    }

    // --- DISCUSSION SECTION ---
    if (discussionIdeas.length > 0) {
      // Add page break before Discussion section
      addPageBreak()
      yPosition = margin

      // Add Discussion header with icon-like element
      pdf.setFillColor(14, 165, 233) // Blue
      pdf.circle(margin + 4, yPosition + 4, 4, 'F')

      pdf.setFontSize(FONT_SIZE_TITLE)
      pdf.setTextColor(14, 165, 233) // Blue
      pdf.setFont('helvetica', 'bold')
      pdf.text('Discussion Assessments', margin + 12, yPosition + 5)
      yPosition += 15

      for (const idea of discussionIdeas) {
        // --- DISCUSSION DESCRIPTION CARD ---
        const descLines = pdf.splitTextToSize(idea.description, contentWidth - 10)
        const descHeight = descLines.length * 6 + 5
        const exampleHeaderHeight = 15
        const descBoxHeight = 22 + descHeight + exampleHeaderHeight

        if (yPosition > pageHeight - margin - descBoxHeight - 10) {
          addPageBreak()
          yPosition = margin
        }

        // Draw discussion description box (full width)
        pdf.setFillColor(240, 249, 255)
        pdf.roundedRect(margin, yPosition, contentWidth, descBoxHeight, 3, 3, 'F')
        pdf.setFillColor(14, 165, 233)
        pdf.rect(margin, yPosition, contentWidth, 5, 'F')

        pdf.setFontSize(FONT_SIZE_SUBTITLE)
        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'bold')
        pdf.text(idea.type, margin + 10, yPosition + 13)

        pdf.setFontSize(FONT_SIZE_SMALL)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Duration: ${idea.duration}`, margin + contentWidth - 70, yPosition + 13)

        pdf.setFontSize(FONT_SIZE_STANDARD)
        pdf.setFont('helvetica', 'normal')
        pdf.text(descLines, margin + 10, yPosition + 22)

        pdf.setFillColor(230, 240, 250)
        pdf.roundedRect(margin + 5, yPosition + 22 + descHeight, contentWidth - 10, 10, 2, 2, 'F')
        pdf.setFontSize(FONT_SIZE_SUBTITLE)
        pdf.setTextColor(14, 165, 233)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Discussion Topics', margin + contentWidth / 2, yPosition + 22 + descHeight + 7, {
          align: 'center',
        })

        yPosition += descBoxHeight + 10

        // --- INDIVIDUAL DISCUSSION QUESTION CARDS ---
        if (idea.exampleQuestions && idea.exampleQuestions.length > 0) {
          for (let q = 0; q < idea.exampleQuestions.length; q++) {
            const question = idea.exampleQuestions[q]
            const questionLines = pdf.splitTextToSize(question.question, contentWidth - 40)
            const questionHeight = Math.max(questionLines.length * 6 + 10, 30)

            // Always re-initialize for each question
            let guidanceLines: string[] = []
            let guidanceHeight = 0
            if (question.correctAnswer) {
              guidanceLines = pdf.splitTextToSize(question.correctAnswer, contentWidth - 40)
              guidanceHeight = Math.max(guidanceLines.length * 6, 15) + 8
            }

            // Assessment Criteria Table
            let criteriaRows: { name: string; weight: string }[] = []
            let hasCriteria = false
            if (
              question.explanation &&
              typeof question.explanation === 'object' &&
              'criteria' in question.explanation &&
              Array.isArray(question.explanation.criteria)
            ) {
              hasCriteria = true
              const explanationObj = question.explanation as ExplanationObject
              criteriaRows = explanationObj.criteria.map((c) => ({
                name: c.name,
                weight: `${c.weight}%`,
              }))
            }

            // Point Allocation Table
            let pointAllocRows: { key: string; value: string }[] = []
            let hasPointAlloc = false

            // Check for markAllocation (ExplanationObject structure)
            if (
              question.explanation &&
              typeof question.explanation === 'object' &&
              'markAllocation' in question.explanation &&
              Array.isArray(question.explanation.markAllocation)
            ) {
              hasPointAlloc = true
              const explanationObj = question.explanation as ExplanationObject
              pointAllocRows = explanationObj.markAllocation.map((allocation) => ({
                key: allocation.component
                  .replace(/([A-Z])/g, ' $1')
                  .trim()
                  .replace(/^./, (str) => str.toUpperCase()),
                value: `${allocation.marks} marks`,
              }))
            }
            // Fallback to pointAllocation (slide types structure) for backward compatibility
            else if (
              question.explanation &&
              typeof question.explanation === 'object' &&
              'pointAllocation' in question.explanation &&
              question.explanation.pointAllocation
            ) {
              hasPointAlloc = true
              const pointAllocation = question.explanation.pointAllocation
              if (typeof pointAllocation === 'object' && pointAllocation !== null) {
                pointAllocRows = Object.entries(pointAllocation).map(([key, value]) => ({
                  key: key
                    .replace(/([A-Z])/g, ' $1')
                    .trim()
                    .replace(/^./, (str) => str.toUpperCase()),
                  value: `${value} points`,
                }))
              } else {
                pointAllocRows = [{ key: 'Points', value: String(pointAllocation) }]
              }
            }

            // Fallback for simple explanation
            let explanationHeight = 0
            let explanationLines: string[] = []
            if (question.explanation && !hasCriteria && !hasPointAlloc) {
              const explanationText =
                typeof question.explanation === 'string'
                  ? question.explanation
                  : JSON.stringify(question.explanation, null, 2)
              explanationLines = pdf.splitTextToSize(explanationText, contentWidth - 40)
              explanationHeight = explanationLines.length * 6 + 10
            }

            // Table heights
            const tableRowHeight = 8
            const tableHeaderSpacing = 6 // <-- Add spacing between header and first row
            const criteriaTableHeight = hasCriteria
              ? 10 + tableHeaderSpacing + criteriaRows.length * tableRowHeight
              : 0
            const pointAllocTableHeight = hasPointAlloc
              ? 10 + tableHeaderSpacing + pointAllocRows.length * tableRowHeight
              : 0

            // Calculate total box height for this question card (full width)
            const totalBoxHeight =
              questionHeight +
              (guidanceHeight ? guidanceHeight + 5 : 0) +
              (hasCriteria ? criteriaTableHeight + 5 : 0) +
              (hasPointAlloc ? pointAllocTableHeight + 5 : 0) +
              (explanationHeight ? explanationHeight + 5 : 0) +
              20

            // --- PAGE FIT CHECK ---
            if (yPosition + totalBoxHeight > pageHeight - margin - 10) {
              addPageBreak()
              yPosition = margin
            }

            // Draw question card (full width)
            pdf.setFillColor(250, 250, 250)
            pdf.setDrawColor(220, 220, 220)
            pdf.roundedRect(margin, yPosition, contentWidth, totalBoxHeight, 3, 3, 'FD')

            // Question number in a circle
            pdf.setFillColor(14, 165, 233)
            pdf.circle(margin + 15, yPosition + 15, 8, 'F')
            pdf.setTextColor(255, 255, 255)
            pdf.setFontSize(FONT_SIZE_SMALL)
            pdf.setFont('helvetica', 'bold')
            pdf.text(`${q + 1}`, margin + 15, yPosition + 17, { align: 'center' })

            // Question text
            pdf.setTextColor(0, 0, 0)
            pdf.setFontSize(FONT_SIZE_STANDARD)
            pdf.setFont('helvetica', 'normal')
            pdf.text(questionLines, margin + 30, yPosition + 15)

            let qBoxY = yPosition + 15 + questionLines.length * 6 + 5

            // --- Discussion Guidance (always wrapped in a card, left-aligned, for every question) ---
            if (question.correctAnswer) {
              pdf.setFillColor(230, 245, 255)
              // Increase width: use margin + 10 and contentWidth - 20 for a wider box
              pdf.roundedRect(margin + 10, qBoxY, contentWidth - 20, guidanceHeight, 2, 2, 'F')

              pdf.setTextColor(0, 100, 150)
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text('Discussion Guidance:', margin + 20, qBoxY + 7)

              pdf.setTextColor(0, 0, 0)
              pdf.setFont('helvetica', 'normal')
              pdf.text(guidanceLines, margin + 20, qBoxY + 14, { maxWidth: contentWidth - 30 })
              qBoxY += guidanceHeight + 5
            }

            // --- Assessment Criteria Table (with header spacing) ---
            if (hasCriteria && criteriaRows.length > 0) {
              pdf.setFillColor(240, 245, 255)
              // Increase width: use margin + 10 and contentWidth - 20 for a wider box
              pdf.roundedRect(margin + 10, qBoxY, contentWidth - 20, criteriaTableHeight, 2, 2, 'F')

              pdf.setTextColor(14, 165, 233)
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text('Assessment Criteria:', margin + 20, qBoxY + 7)

              // Table header
              pdf.setFont('helvetica', 'bold')
              pdf.setTextColor(0, 0, 0)
              pdf.text('Criteria', margin + 30, qBoxY + 15)
              pdf.text('Weight', margin + contentWidth - 30, qBoxY + 15)

              // Add spacing between header and first row
              let rowY = qBoxY + 15 + tableHeaderSpacing
              pdf.setFont('helvetica', 'normal')
              for (const row of criteriaRows) {
                pdf.text(row.name, margin + 30, rowY)
                pdf.text(row.weight, margin + contentWidth - 30, rowY)
                rowY += tableRowHeight
              }
              qBoxY += criteriaTableHeight + 5
            }

            // --- Point Allocation Table (with header spacing) ---
            if (hasPointAlloc && pointAllocRows.length > 0) {
              pdf.setFillColor(235, 245, 255)
              // Increase width: use margin + 10 and contentWidth - 20 for a wider box
              pdf.roundedRect(
                margin + 10,
                qBoxY,
                contentWidth - 20,
                pointAllocTableHeight,
                2,
                2,
                'F',
              )

              pdf.setTextColor(14, 165, 233)
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text('Point Allocation:', margin + 20, qBoxY + 7)

              // Table header
              pdf.setFont('helvetica', 'bold')
              pdf.setTextColor(0, 0, 0)
              pdf.text('Component', margin + 30, qBoxY + 15)
              pdf.text('Points', margin + contentWidth - 30, qBoxY + 15)

              // Add spacing between header and first row
              let rowY = qBoxY + 15 + tableHeaderSpacing
              pdf.setFont('helvetica', 'normal')
              for (const row of pointAllocRows) {
                pdf.text(row.key, margin + 30, rowY)
                pdf.text(row.value, margin + contentWidth - 30, rowY)
                rowY += tableRowHeight
              }
              qBoxY += pointAllocTableHeight + 5
            }

            // Fallback for simple explanation
            if (explanationHeight > 0) {
              pdf.setFillColor(235, 245, 255)
              pdf.roundedRect(margin + 20, qBoxY, contentWidth - 40, explanationHeight, 2, 2, 'F')

              pdf.setTextColor(0, 100, 150)
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text('Assessment Criteria:', margin + 30, qBoxY + 7)

              pdf.setTextColor(0, 0, 0)
              pdf.setFont('helvetica', 'normal')
              pdf.text(explanationLines, margin + 40, qBoxY + 14)
              qBoxY += explanationHeight + 5
            }

            yPosition += totalBoxHeight + 15
          }
        }

        yPosition += 10
      }
    }

    // --- OTHER ASSESSMENT TYPES ---
    if (otherIdeas.length > 0) {
      // Add page break before Other Assessments section
      addPageBreak()
      yPosition = margin

      // Add Other Assessments header with icon-like element
      pdf.setFillColor(16, 185, 129) // Green
      pdf.circle(margin + 4, yPosition + 4, 4, 'F')

      pdf.setFontSize(FONT_SIZE_TITLE)
      pdf.setTextColor(16, 185, 129) // Green
      pdf.setFont('helvetica', 'bold')
      pdf.text('Other Assessments', margin + 12, yPosition + 5)
      yPosition += 15

      for (const idea of otherIdeas) {
        // Check if we need a new page
        if (yPosition > pageHeight - margin - 100) {
          addPageBreak()
          yPosition = margin
        }

        // Draw assessment box with gradient-like effect
        pdf.setFillColor(240, 253, 244) // Light green background
        pdf.roundedRect(margin, yPosition, contentWidth, 30, 3, 3, 'F')

        // Add a colored stripe at the top
        pdf.setFillColor(16, 185, 129) // Green
        pdf.rect(margin, yPosition, contentWidth, 5, 'F')

        // Assessment title and meta
        pdf.setFontSize(FONT_SIZE_SUBTITLE)
        pdf.setTextColor(0, 0, 0)
        pdf.setFont('helvetica', 'bold')
        pdf.text(idea.type, margin + 10, yPosition + 18)

        // Duration with clock icon simulation
        pdf.setFontSize(FONT_SIZE_SMALL)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Duration: ${idea.duration}`, margin + contentWidth - 70, yPosition + 18)

        // Description
        yPosition += 35
        const descLines = pdf.splitTextToSize(idea.description, contentWidth - 10)
        pdf.text(descLines, margin + 5, yPosition)
        yPosition += descLines.length * 6 + 10

        // Process example questions similar to quiz or discussion based on format
        if (idea.exampleQuestions && idea.exampleQuestions.length > 0) {
          // Add example questions header
          pdf.setFillColor(230, 250, 240) // Light green
          pdf.roundedRect(margin, yPosition, contentWidth, 10, 2, 2, 'F')

          pdf.setFontSize(FONT_SIZE_SUBTITLE)
          pdf.setTextColor(16, 185, 129) // Green
          pdf.setFont('helvetica', 'bold')
          pdf.text('Example Questions', margin + contentWidth / 2, yPosition + 7, {
            align: 'center',
          })
          yPosition += 20

          // Process questions (simplified version of quiz processing)
          for (let q = 0; q < idea.exampleQuestions.length; q++) {
            const question = idea.exampleQuestions[q]

            // Check if we need a new page
            if (yPosition > pageHeight - margin - 80) {
              addPageBreak()
              yPosition = margin
            }

            // Question box
            pdf.setFillColor(250, 250, 250) // White
            pdf.setDrawColor(220, 220, 220) // Light gray border
            pdf.roundedRect(margin, yPosition, contentWidth, 10, 3, 3, 'FD')

            // Question number in a circle
            pdf.setFillColor(16, 185, 129) // Green
            pdf.circle(margin + 15, yPosition + 15, 8, 'F')
            pdf.setTextColor(255, 255, 255) // White
            pdf.setFontSize(FONT_SIZE_SMALL)
            pdf.setFont('helvetica', 'bold')
            pdf.text(`${q + 1}`, margin + 15, yPosition + 17, { align: 'center' })

            // Question text
            pdf.setTextColor(0, 0, 0) // Black
            pdf.setFontSize(FONT_SIZE_STANDARD)
            pdf.setFont('helvetica', 'normal')
            const questionLines = pdf.splitTextToSize(question.question, contentWidth - 50)
            pdf.text(questionLines, margin + 30, yPosition + 15)

            yPosition += Math.max(questionLines.length * 6 + 10, 30)

            // Add options, answers, and explanations similar to quiz section
            // (Simplified for brevity)
            if (question.correctAnswer) {
              yPosition += 5
              pdf.setFillColor(230, 250, 240) // Light green
              pdf.roundedRect(margin + 20, yPosition, contentWidth - 40, 10, 2, 2, 'F')

              pdf.setTextColor(0, 130, 0) // Dark green
              pdf.setFontSize(FONT_SIZE_SMALL)
              pdf.setFont('helvetica', 'bold')
              pdf.text('Model Answer:', margin + 30, yPosition + 5)

              pdf.setTextColor(0, 0, 0) // Black
              pdf.setFont('helvetica', 'normal')
              const answerLines = pdf.splitTextToSize(question.correctAnswer, contentWidth - 100)
              pdf.text(answerLines, margin + 80, yPosition + 5)
              yPosition += Math.max(answerLines.length * 6, 15) + 5
            }

            yPosition += 15 // Space between questions
          }
        }

        yPosition += 10 // Space between assessment types
      }
    }
  }

  // --- FURTHER READINGS SECTION ---
  if (content.furtherReadings && content.furtherReadings.length > 0) {
    addPageBreak()
    yPosition = margin
    yPosition = addSectionHeader('Further Readings', yPosition)

    // Add each reading - matching the image format
    for (const reading of content.furtherReadings) {
      // Check if we need a new page
      if (yPosition > pageHeight - margin - 40) {
        addPageBreak()
        yPosition = margin
      }

      // Add bullet and reading title in bold
      pdf.setFontSize(FONT_SIZE_STANDARD)
      pdf.setTextColor(0, 0, 0)
      pdf.text('•', margin, yPosition)

      pdf.setFont('helvetica', 'bold')
      pdf.text(reading.title, margin + 5, yPosition)

      // Add author on a new line
      yPosition += 7
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Author: ${reading.author}`, margin + 5, yPosition)
      yPosition += 8

      // Add description with indentation
      const descLines = pdf.splitTextToSize(reading.readingDescription, contentWidth - 10)
      pdf.text(descLines, margin + 5, yPosition)
      yPosition += descLines.length * 6 + 10
    }
  }

  // Add footers to all pages
  const totalPages = pdf.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i)
    addFooter()
  }

  // Convert the PDF to a Buffer
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}
