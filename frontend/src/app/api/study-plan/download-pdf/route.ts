// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NextResponse } from 'next/server'
import type { StudyPlan } from '@/lib/types/study-plan'

// Define a proper interface for the jsPDF instance with autoTable
interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number
  }
}

export async function POST(request: Request) {
  try {
    const studyPlan: StudyPlan = await request.json()

    // Create a new PDF document
    const doc = new jsPDF() as JsPDFWithAutoTable

    // Set default font
    doc.setFont('helvetica')

    // Add title
    doc.setFontSize(24)
    doc.text('Personalized Study Plan', 105, 20, { align: 'center' })

    // Add date
    doc.setFontSize(10)
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' })

    // Add executive summary
    doc.setFontSize(16)
    doc.text('Executive Summary', 14, 40)
    doc.setFontSize(10)

    // Handle multi-line text for executive summary
    const splitSummary = doc.splitTextToSize(studyPlan.executiveSummary, 180)
    doc.text(splitSummary, 14, 50)

    let yPosition = 50 + splitSummary.length * 5

    // Topic Breakdown
    doc.setFontSize(16)
    doc.text('Topic Breakdown', 14, yPosition + 10)
    yPosition += 15

    // Create topic breakdown table
    autoTable(doc, {
      startY: yPosition,
      head: [['Topic', 'Subtopics', 'Importance', 'Est. Hours']],
      body: studyPlan.topicBreakdown.map((topic) => [
        topic.topic,
        topic.subtopics.join(', '),
        topic.importance,
        topic.estimatedStudyHours.toString(),
      ]),
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 10 },
    })

    // Safely access the finalY property
    yPosition = doc.lastAutoTable?.finalY ?? yPosition + 50

    // Weekly Schedule
    doc.setFontSize(16)
    doc.text('Weekly Schedule', 14, yPosition + 10)
    yPosition += 20

    // Add each week
    studyPlan.weeklySchedule.forEach((week) => {
      // Check if we need a new page
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.text(`Week ${week.week}: ${week.focus}`, 14, yPosition)
      yPosition += 8

      doc.setFontSize(10)
      doc.text(`Topics: ${week.topics.join(', ')}`, 14, yPosition)
      yPosition += 6

      // Activities table
      autoTable(doc, {
        startY: yPosition,
        head: [['Activity Type', 'Description', 'Duration', 'Resources']],
        body: week.activities.map((activity) => [
          activity.type,
          activity.description,
          activity.duration,
          activity.resources,
        ]),
        headStyles: { fillColor: [41, 128, 185] },
        margin: { top: 5 },
        theme: 'striped',
      })

      // Safely access the finalY property
      yPosition = doc.lastAutoTable?.finalY ?? yPosition + 30

      // Add milestones
      doc.setFontSize(10)
      doc.text('Milestones:', 14, yPosition)
      yPosition += 5

      week.milestones.forEach((milestone) => {
        doc.text(`• ${milestone}`, 20, yPosition)
        yPosition += 5
      })

      yPosition += 10
    })

    // Add a new page for study techniques
    doc.addPage()
    yPosition = 20

    // Study Techniques
    doc.setFontSize(16)
    doc.text('Study Techniques', 14, yPosition)
    yPosition += 10

    studyPlan.studyTechniques.forEach((technique) => {
      // Check if we need a new page
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(12)
      doc.text(technique.technique, 14, yPosition)
      yPosition += 6

      doc.setFontSize(10)
      const splitDesc = doc.splitTextToSize(`Description: ${technique.description}`, 180)
      doc.text(splitDesc, 20, yPosition)
      yPosition += splitDesc.length * 5 + 2

      // Ensure bestFor is an array before joining
      const bestFor = Array.isArray(technique.bestFor)
        ? technique.bestFor.join(', ')
        : technique.bestFor || 'N/A'
      doc.text(`Best for: ${bestFor}`, 20, yPosition)
      yPosition += 5

      const splitExample = doc.splitTextToSize(`Example: ${technique.example}`, 170)
      doc.text(splitExample, 20, yPosition)
      yPosition += splitExample.length * 5 + 8
    })

    // Add a new page for resources and practice strategy
    doc.addPage()
    yPosition = 20

    // Additional Resources
    doc.setFontSize(16)
    doc.text('Additional Resources', 14, yPosition)
    yPosition += 10

    autoTable(doc, {
      startY: yPosition,
      head: [['Type', 'Name', 'Description', 'Relevant Topics']],
      body: studyPlan.additionalResources.map((resource) => [
        resource.type,
        resource.name,
        resource.description,
        resource.relevantTopics.join(', '),
      ]),
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 5 },
      theme: 'striped',
    })

    // Safely access the finalY property
    yPosition = doc.lastAutoTable?.finalY ?? yPosition + 40

    // Practice Strategy
    doc.setFontSize(16)
    doc.text('Practice Strategy', 14, yPosition + 10)
    yPosition += 10

    doc.setFontSize(10)
    doc.text(`Approach: ${studyPlan.practiceStrategy.approach}`, 14, yPosition + 10)
    yPosition += 6

    doc.text(`Frequency: ${studyPlan.practiceStrategy.frequency}`, 14, yPosition + 10)
    yPosition += 6

    doc.text('Question Types:', 14, yPosition + 10)
    yPosition += 5

    studyPlan.practiceStrategy.questionTypes.forEach((type) => {
      doc.text(`• ${type}`, 20, yPosition + 10)
      yPosition += 5
    })

    doc.text(`Self-Assessment: ${studyPlan.practiceStrategy.selfAssessment}`, 14, yPosition + 10)
    yPosition += 15

    // Exam Preparation
    doc.setFontSize(16)
    doc.text('Exam Preparation', 14, yPosition + 10)
    yPosition += 10

    doc.setFontSize(10)
    const splitFinalWeek = doc.splitTextToSize(
      `Final Week Plan: ${studyPlan.examPreparation.finalWeekPlan}`,
      180,
    )
    doc.text(splitFinalWeek, 14, yPosition + 10)
    yPosition += splitFinalWeek.length * 5 + 5

    const splitDayBefore = doc.splitTextToSize(
      `Day Before Exam: ${studyPlan.examPreparation.dayBeforeExam}`,
      180,
    )
    doc.text(splitDayBefore, 14, yPosition + 10)
    yPosition += splitDayBefore.length * 5 + 5

    const splitExamDay = doc.splitTextToSize(
      `Exam Day Tips: ${studyPlan.examPreparation.examDayTips}`,
      180,
    )
    doc.text(splitExamDay, 14, yPosition + 10)

    // Add footer with page numbers
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(10)
      doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' })
    }

    // Get the PDF as a data URI
    const pdfOutput = doc.output('datauristring')

    return new NextResponse(pdfOutput, {
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return new NextResponse(JSON.stringify({ error: 'Failed to generate PDF' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
