// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { generateText, type ModelMessage } from 'ai'
import type { OllamaFn } from '../types/assessment.types'
import type { CourseInfo } from '@/lib/types/course-info-types'
import {
  TEMPERATURE,
  TOKEN_RESPONSE_BUDGET,
  PROJECT_DESCRIPTION_TEMPERATURE_INCREASE,
} from '../config/constants'
import { stripThinkTags, stripHorizontalRules } from '../utils/generalHelpers'
import { detectLikelyLanguage, ensureTargetLanguageText } from '../utils/languageHelpers'

// Generate project description based on course information and source materials
export async function generateProjectDescription(
  difficultyLevel: string,
  ollama: OllamaFn,
  selectedModel: string,
  assistantMessage: ModelMessage,
  courseInfo: CourseInfo,
  language: 'en' | 'id',
): Promise<string> {
  console.log(`Generating project description for ${difficultyLevel} level course...`)

  const hasSourceMaterials = (assistantMessage.content as string).includes('SOURCE MATERIALS:')
  console.log('=== PROJECT DESCRIPTION GENERATION ===')
  console.log('Has source materials:', hasSourceMaterials)
  console.log('Language:', language)
  console.log('Will use source-based prompts:', hasSourceMaterials)
  console.log('Assistant message content length:', (assistantMessage.content as string).length)
  console.log(
    'Assistant message preview:',
    (assistantMessage.content as string).substring(0, 200) + '...',
  )
  console.log('=== END PROJECT DESCRIPTION DEBUG ===')

  // Use modular prompt builder for project description
  const projectPrompts = await import('../prompts/project')
  const systemPrompt = projectPrompts.buildProjectDescriptionSystemPrompt(
    difficultyLevel,
    courseInfo,
    language,
    hasSourceMaterials,
  )

  const systemMessage: ModelMessage = {
    role: 'system',
    content: systemPrompt,
  }

  const userMessage: ModelMessage = {
    role: 'user',
    content: projectPrompts.buildProjectDescriptionUserPrompt(courseInfo, language),
  }

  try {
    const response = await generateText({
      model: ollama(selectedModel),
      messages: [systemMessage, assistantMessage, userMessage],
      temperature: TEMPERATURE + PROJECT_DESCRIPTION_TEMPERATURE_INCREASE,
      maxOutputTokens: Math.floor(TOKEN_RESPONSE_BUDGET),
    })

    let cleaned = stripThinkTags(response.text)
    console.log(
      'Raw project description (before language enforcement):',
      cleaned.substring(0, 200) + '...',
    )

    // Always ensure final text adheres to the selected language (regardless of source language)
    // But be careful not to override source-based content with course-based content
    if (hasSourceMaterials) {
      console.log(
        'Skipping language enforcement for source-based content to preserve source fidelity',
      )
      // For source-based content, only do minimal language enforcement to avoid content drift
      const detected = detectLikelyLanguage(cleaned)
      if (detected !== language && detected !== 'unknown') {
        console.log(
          `Language mismatch detected (${detected} vs ${language}), enforcing target language`,
        )
        // Always enforce language, even for source-based content
        cleaned = await ensureTargetLanguageText(cleaned, language, ollama, selectedModel, {
          force: true,
        })
      }
    } else {
      cleaned = await ensureTargetLanguageText(cleaned, language, ollama, selectedModel, {
        force: true,
      })
      console.log('Applied language enforcement for course-based content')
    }

    cleaned = stripHorizontalRules(cleaned)
    cleaned = cleaned.replace(/^[ \t]*[\*-]\s+/gm, '• ')
    console.log('Final project description:', cleaned.substring(0, 200) + '...')
    console.log('Project description generated successfully')
    return cleaned
  } catch (error) {
    console.error('Error generating project description:', error)

    // If sources were available but generation failed, return a more generic fallback
    if (hasSourceMaterials) {
      const fallbackDescription =
        language === 'id'
          ? `**Instruksi Proyek**

Berdasarkan materi sumber yang disediakan, buatlah proyek yang menunjukkan pemahaman mendalam terhadap konsep dan teknologi yang dibahas dalam materi tersebut.

**Deliverables:**
• Laporan komprehensif yang menganalisis dan menerapkan konsep dari materi sumber
• Implementasi praktis atau demonstrasi teknis
• Presentasi yang menjelaskan metodologi dan temuan

**Persyaratan:**
• Gunakan pendekatan yang sesuai dengan teknologi dan metodologi yang dijelaskan dalam materi sumber
• Analisis mendalam terhadap masalah yang diidentifikasi
• Rekomendasi berdasarkan temuan

Durasi: ${courseInfo.duration || '2 minggu'}
`
          : `**Project Instructions**

Based on the provided source materials, create a project that demonstrates deep understanding of the concepts and technologies discussed in the materials.

**Deliverables:**
• Comprehensive report analyzing and applying concepts from source materials  
• Practical implementation or technical demonstration
• Presentation explaining methodology and findings

**Requirements:**
• Use approaches consistent with technologies and methodologies explained in source materials
• In-depth analysis of identified problems
• Recommendations based on findings

Duration: ${courseInfo.duration || '2 weeks'}
`
      return stripHorizontalRules(fallbackDescription)
    }

    // Course-based fallback when no sources were available
    const courseFallback =
      language === 'id'
        ? `
Sekolah Ilmu Komputer, Universiti Sains Malaysia 

Batas waktu pengumpulan adalah ${courseInfo.deadline || '10 Januari 2024'}, pukul 6:15 sore. Pengumpulan daring melalui e-learn. 

${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}  
${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'} 
 
PROYEK (20%) – LAPORAN & PRESENTASI
(Kerja Kelompok: Maksimal ${courseInfo.groupSize || 4} anggota per kelompok) 
 
Instruksi: Proyek akan dievaluasi berdasarkan kerja kelompok serta kontribusi individu melalui laporan tertulis dan presentasi kelompok. Setiap kelompok harus menyerahkan laporan tertulis dan melakukan presentasi. Pembentukan kelompok dilakukan melalui tautan Padlet yang tersedia di portal e-learn. 
 
Batas Waktu: ${courseInfo.deadline || '10 Januari 2024'} (6:15 sore). Serahkan softcopy laporan/slide & kode sumber melalui portal e-learning pada waktu kelas. Presentasi kelompok akan dilaksanakan di kelas selama dua minggu. Penentuan urutan presentasi dilakukan secara acak. 
 
Deskripsi Proyek: Setiap kelompok harus mengidentifikasi sebuah dataset yang relevan dengan konten mata kuliah. Bangun solusi penyimpanan dan pemrosesan data yang sesuai berdasarkan materi kuliah. Anda mungkin perlu mengunduh dan memasang perangkat lunak yang diperlukan atau menggunakan layanan cloud. Anda dapat memakai mesin lokal (laptop) atau layanan cloud (Google Cloud, Amazon, dll.) atau teknologi kontainer (Docker) untuk menyiapkan lingkungan. Masukkan dataset ke dalam basis data. Jalankan minimal empat kueri yang bermakna yang paling menggambarkan data. Bandingkan dan diskusikan performanya dalam hal kemudahan penggunaan, pembuatan kueri, dan kecepatan pemrosesan data. 
 
Deliverables wajib mencakup:
• Platform yang dipilih untuk implementasi  
• Proses instalasi dan pemasukan data  
• Minimal lima kueri atau operasi bermakna  
• Perbandingan dan diskusi performa  
• Rekomendasi & pelajaran yang dipetik  
 
Panduan penyusunan laporan:
i. Abstrak  
ii. Pendahuluan  
iii. Konten Proyek
  1. Deskripsi singkat dataset  
  2. Pemilihan platform implementasi
  3. Proses instalasi, konstruksi sistem, dan pemasukan data
  4. Minimal 4 operasi bermakna
  5. Perbandingan, diskusi, dan rekomendasi
  6. Pernyataan penutup
iv. Pelajaran yang dipetik dari proyek
v. Pembagian peran anggota kelompok secara jelas  
vi. Kesimpulan
vii. Referensi (Minimal 8 referensi termasuk 4 artikel jurnal)
viii. Lampiran (Jika ada)
 
Skema Penilaian: lihat rubrik yang diunggah pada e-learn. 
 
Untuk presentasi di kelas, setiap kelompok mendapat waktu sekitar 15 menit termasuk tanya jawab:
• Setiap anggota diharapkan mempresentasikan bagian tugasnya. 
 
Kumpulkan berikut ini bersama laporan yang diformat baik (satu pengumpulan per kelompok):
• Format IEEE (lihat contoh templat di e-learn)
• Soft copy - (Laporan + kode sumber dan slide): e-learning 
 
Catatan:  
Laporan harus menyertakan lampiran yang menjelaskan secara rinci kontribusi setiap anggota kelompok. Jika bagian laporan disalin langsung tanpa referensi, nilai F akan diberikan.
`
        : `
School of Computer Science, Universiti Sains Malaysia

Submission deadline is ${courseInfo.deadline || 'January 10, 2024'}, at 6:15 pm. Online submission via e-learn.

${courseInfo.courseCode || 'CDS502'} ${courseInfo.courseName || 'Big Data Storage and Management'}
${courseInfo.semester || 'Semester 1'}, ${courseInfo.academicYear || '2023/2024'}

PROJECT (20%) – REPORT & PRESENTATION
(Group Work: Maximum ${courseInfo.groupSize || 4} members per group)

Instructions: The project will be evaluated based on group work and individual contributions through a written report and a group presentation. Each group must submit a written report and deliver a presentation. Group formation is done via the Padlet link available on the e-learn portal.

Deadline: ${courseInfo.deadline || 'January 10, 2024'} (6:15 pm). Submit the soft copy of the report/slides & source code via the e-learning portal during class time. Group presentations will be conducted in class over two weeks. The presentation order will be randomized.

Project Description: Each group must identify a dataset relevant to the course content. Build an appropriate data storage and processing solution based on the course material. You may need to download and install required software or use cloud services. You may use a local machine (laptop) or cloud services (Google Cloud, Amazon, etc.) or container technologies (Docker) to set up the environment. Ingest the dataset into the database. Execute at least four meaningful queries that best represent the data. Compare and discuss performance in terms of ease of use, query creation, and data processing speed.

Required Deliverables:
• Platform chosen for implementation
• Installation process and data ingestion
• At least five meaningful queries or operations
• Performance comparison and discussion
• Recommendations & lessons learned

Report Guidelines:
i. Abstract
ii. Introduction
iii. Project Content
  1. Brief dataset description
  2. Implementation platform selection
  3. Installation, system construction, and data ingestion process
  4. At least 4 meaningful operations
  5. Comparison, discussion, and recommendations
  6. Closing statement
iv. Lessons learned from the project
v. Clear division of group member roles
vi. Conclusion
vii. References (Minimum 8 references including 4 journal articles)
viii. Appendix (If any)

Assessment Scheme: refer to the rubric uploaded on e-learn.

For in-class presentations, each group has approximately 15 minutes including Q&A:
• Each member is expected to present their task component.

Submit the following along with a well-formatted report (one submission per group):
• IEEE format (see template example in e-learn)
• Soft copy - (Report + source code and slides): e-learning
`

    return stripHorizontalRules(courseFallback)
  }
}
