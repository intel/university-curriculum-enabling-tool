// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import type { Lang, CourseInfoLike } from '@/app/api/assessment/prompts/common'
import { langDirective } from '@/app/api/assessment/prompts/common'

export function buildProjectDescriptionSystemPrompt(
  difficultyLevel: string,
  courseInfo: CourseInfoLike,
  language: Lang,
  hasSourceMaterials: boolean,
): string {
  if (language === 'id') {
    return `${langDirective(language)}\n\nAnda adalah pengembang asesmen pendidikan ahli. ${
      hasSourceMaterials
        ? 'Buat deskripsi proyek komprehensif berdasarkan SECARA KETAT materi sumber yang diberikan. Abaikan judul mata kuliah atau informasi eksternal lainnya.'
        : `Buat deskripsi proyek komprehensif untuk mata kuliah tingkat ${difficultyLevel} "${
            courseInfo.courseName || 'Big Data Storage and Management'
          }" dengan dasar HANYA pada judul mata kuliah \"${(courseInfo.courseCode || '').trim()} ${(courseInfo.courseName || 'Big Data Storage and Management').trim()}\" (tanpa kurikulum standar atau sumber eksternal)`
    }.

INSTRUKSI PENTING:
${
  hasSourceMaterials
    ? `1. Anda HARUS mendasarkan seluruh konten SEPENUHNYA pada materi sumber yang disediakan.
2. Ambil konsep kunci, terminologi, contoh, dan penjelasan langsung dari materi sumber.
3. Jangan perkenalkan konsep atau informasi yang tidak ada dalam materi sumber.
4. Abaikan sepenuhnya judul mata kuliah, kode mata kuliah, atau pengetahuan eksternal di luar materi sumber.
5. Rancang proyek berdasarkan hanya pada apa yang dicakup dalam materi sumber.`
    : `1. Karena tidak ada materi sumber, dasarkan proyek HANYA pada judul mata kuliah \"${(
        courseInfo.courseCode || ''
      ).trim()} ${(courseInfo.courseName || 'Big Data Storage and Management').trim()}\".
2. Jangan gunakan kurikulum standar atau sumber eksternal.
3. Pastikan tingkat akademik sesuai konteks universitas.`
}
4. Buat deskripsi proyek rinci dengan deliverables dan persyaratan jelas.
5. Sertakan instruksi spesifik untuk komponen laporan dan presentasi.${
      hasSourceMaterials
        ? ''
        : `
6. Proyek dirancang untuk kelompok beranggotakan ${courseInfo.groupSize || 4} mahasiswa.
7. Durasi pengerjaan: ${courseInfo.duration || '2 minggu'}.`
    }
${hasSourceMaterials ? '6' : '8'}. Gunakan bagian-bagian berikut (judul harus dicetak tebal, gunakan **):
   - Instruksi
   - Deskripsi Proyek
   - Deliverables (Hasil)
   - Struktur Laporan
   - Persyaratan Presentasi
   - Panduan Pengumpulan
   - Informasi Tenggat
${hasSourceMaterials ? '7' : '9'}. Format dalam Markdown (hanya gunakan bold, tanpa heading #).
${hasSourceMaterials ? '8' : '10'}. Respons BUKAN JSON. Tulis dokumen lengkap yang terstruktur rapi.
Catatan: Jangan menyalin atau mengutip teks dari materi sumber yang bukan dalam bahasa target.`
  }

  return `${langDirective(language)}\n\nYou are an expert assessment designer. ${
    hasSourceMaterials
      ? 'Create a comprehensive project description STRICTLY based on the provided source materials. Ignore any course title or external information.'
      : `Create a comprehensive project description for a ${difficultyLevel}-level course "${
          courseInfo.courseName || 'Big Data Storage and Management'
        }" based ONLY on the course title \"${(courseInfo.courseCode || '').trim()} ${(courseInfo.courseName || 'Big Data Storage and Management').trim()}\" (do not use standard curriculum or external sources)`
  }.

CRITICAL INSTRUCTIONS:
${
  hasSourceMaterials
    ? `1. You MUST base ALL content ENTIRELY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.
4. Completely ignore any course title, course code, or external knowledge beyond the source materials.
5. Design the project based solely on what is covered in the source materials.`
    : `1. Since there are no source materials, base the project ONLY on the course title \"${(
        courseInfo.courseCode || ''
      ).trim()} ${(courseInfo.courseName || 'Big Data Storage and Management').trim()}\".
2. Do not use standard curriculum or external sources.
3. Ensure the academic level fits a university context.`
}
4. Provide a detailed project description with clear deliverables and requirements.
5. Include specific instructions for the report and presentation components.${
    hasSourceMaterials
      ? ''
      : `
6. The project is designed for groups of ${courseInfo.groupSize || 4} students.
7. Work duration: ${courseInfo.duration || '2 weeks'}.`
  }
${hasSourceMaterials ? '6' : '8'}. Use the following sections (titles should be bold using **):
   - Instructions
   - Project Description
   - Deliverables
   - Report Structure
   - Presentation Requirements
   - Submission Guidelines
   - Deadline Information
${hasSourceMaterials ? '7' : '9'}. Format in Markdown (use bold only, no # headings).
${hasSourceMaterials ? '8' : '10'}. The response is NOT JSON. Write a well-structured, complete document.
Note: Do not copy or quote any text from the source materials that is not in the target language.`
}

export function buildProjectDescriptionUserPrompt(
  courseInfo: CourseInfoLike,
  language: Lang,
): string {
  if (language === 'id') {
    return `Hasilkan deskripsi proyek komprehensif untuk ${courseInfo.courseCode || 'CDS502'} ${
      courseInfo.courseName || 'Big Data Storage and Management'
    } pada ${courseInfo.semester || 'Semester 1'} ${
      courseInfo.academicYear || '2023/2024'
    } dengan tenggat ${courseInfo.deadline || '10 Januari 2024, pukul 18:15'}.`
  }

  return `Generate a comprehensive project description for ${courseInfo.courseCode || 'CDS502'} ${
    courseInfo.courseName || 'Big Data Storage and Management'
  } in ${courseInfo.semester || 'Semester 1'} ${
    courseInfo.academicYear || '2023/2024'
  } with a deadline of ${courseInfo.deadline || 'January 10, 2024, 6:15 pm'}.`
}

// New: Project model answer/guidelines prompts
export function buildProjectModelAnswerSystemPrompt(
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
): string {
  if (language === 'id') {
    return `${langDirective(language)}\n\nAnda adalah dosen yang memberikan tugas proyek. Buat JAWABAN CONTOH/PANDUAN untuk proyek berikut. ${
      hasSourceMaterials
        ? 'ANDA HARUS mendasarkan seluruh konten SEPENUHNYA pada materi sumber yang disediakan; ambil konsep, contoh, dan ekspektasi langsung dari sumber tersebut. Jangan perkenalkan informasi di luar materi sumber.'
        : 'Karena tidak ada materi sumber, sesuaikan panduan berdasarkan judul mata kuliah dan konteks universitas.'
    }\n\nFokus pada:\n- Rencana kerja langkah demi langkah\n- Struktur dan konten laporan yang diharapkan\n- Ekspektasi presentasi/demo\n- Ekspektasi kualitas dan penilaian tingkat tinggi\n\nTulis sebagai pedoman praktis untuk mahasiswa (bukan pengulangan soal).`
  }
  return `${langDirective(language)}\n\nYou are an instructor assigning a project. Create the MODEL ANSWER/GUIDELINES for the project below. ${
    hasSourceMaterials
      ? 'You MUST base ALL content ENTIRELY on the provided source materials; derive concepts, examples, and expectations directly from them. Do not introduce information beyond the sources.'
      : 'Since there are no source materials, tailor the guidance based on the course title and a university context.'
  }\n\nFocus on:\n- Step-by-step work plan\n- Expected report structure and content\n- Presentation/demo expectations\n- High-level quality and marking expectations\n\nWrite practical guidance for students (not a restatement of the prompt).`
}

export function buildProjectModelAnswerUserPrompt(
  question: string,
  courseInfo: CourseInfoLike | undefined,
  language: Lang,
  hasSourceMaterials: boolean,
): string {
  if (language === 'id') {
    return `PROYEK:\n${question}\n\n${
      hasSourceMaterials
        ? 'GUNAKAN HANYA materi sumber terlampir untuk menyusun panduan.'
        : 'Tidak ada materi sumber; gunakan konteks mata kuliah.'
    }\n\nTULISKAN JAWABAN CONTOH/PANDUAN yang berfokus pada langkah kerja, struktur laporan, ekspektasi presentasi, dan kualitas yang diharapkan.`
  }
  return `PROJECT:\n${question}\n\n${
    hasSourceMaterials
      ? 'USE ONLY the attached source materials to craft the guidance.'
      : 'No source materials; use course context.'
  }\n\nWRITE THE MODEL ANSWER/GUIDELINES focusing on work plan, report structure, presentation expectations, and expected quality.`
}
