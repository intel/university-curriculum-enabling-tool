// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

// System prompts for different content generation steps
import { type Lang } from '@/lib/utils/lang'

// Metadata system prompt
export function getMetadataSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  contentTypePrompt: string,
  contentStylePrompt: string,
  difficultyLevelPrompt: string,
  specializedPrompt = '',
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten secara ketat pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan yang DIAMBIL dari sumber, namun TERJEMAHKAN ke Bahasa Indonesia bila sumber bukan Bahasa Indonesia. Jangan menyalin teks non-Bahasa Indonesia.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan konten pada topik mata kuliah dan praktik terbaik kurikulum.
2. Fokus pada konsep inti, istilah kunci, dan alur pengajaran yang jelas.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content strictly on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations from the sources, but TRANSLATE them into English when the sources are not in English. Do NOT copy non-English text.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base the content on the course topic and curriculum best practices.
2. Focus on core concepts, key terminology, and a clear instructional flow.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Buat ${contentType} tingkat ${difficultyLevel} untuk sebuah sesi.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}

${specializedPrompt} 

PETUNJUK PENTING:
${idInstructions}
4. Sertakan minimal 5-10 istilah kunci dengan definisi terperinci (semua dalam Bahasa Indonesia).

PERSYARATAN BAHASA:
- Semua NILAI string dalam JSON (title, learningOutcomes, keyTerms.term, keyTerms.definition) HARUS dalam Bahasa Indonesia saja. Jangan mencampur bahasa.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan FIELDS berikut (gunakan kunci persis seperti di bawah):
{
  "title": "Main title for the ${contentType}",
  "contentType": "${contentType}",
  "difficultyLevel": "${difficultyLevel}",
  "learningOutcomes": ["Include several clear and measurable learning outcomes"],
  "keyTerms": [
    {"term": "Term 1", "definition": "Definition 1"},
    {"term": "Term 2", "definition": "Definition 2"},
    {"term": "Term 3", "definition": "Definition 3"},
    {"term": "Term 4", "definition": "Definition 4"},
    {"term": "Term 5", "definition": "Definition 5"}
  ]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.`
  }

  return `You are an expert educational content developer. Create a ${difficultyLevel} level ${contentType} for a session.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}

${specializedPrompt} 

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Include at least 5-10 key terms with detailed definitions (all in English).

LANGUAGE REQUIREMENTS:
- All JSON string values (title, learningOutcomes, keyTerms.term, keyTerms.definition) MUST be in English only. Do not mix languages.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with the following FIELDS:
{
  "title": "Main title for the ${contentType}",
  "contentType": "${contentType}",
  "difficultyLevel": "${difficultyLevel}",
  "learningOutcomes": ["Include several clear and measurable learning outcomes"],
  "keyTerms": [
    {"term": "Term 1", "definition": "Definition 1"},
    {"term": "Term 2", "definition": "Definition 2"},
    {"term": "Term 3", "definition": "Definition 3"},
    {"term": "Term 4", "definition": "Definition 4"},
    {"term": "Term 5", "definition": "Definition 5"}
  ]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.`
}

// Content system prompt
export function getContentSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  contentTypePrompt: string,
  contentStylePrompt: string,
  difficultyLevelPrompt: string,
  recommendedSlides = 5,
  specializedPrompt = '',
  language: Lang = 'en',
) {
  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Lanjutkan membuat ${contentType} tingkat ${difficultyLevel} untuk sebuah sesi.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}

${specializedPrompt}

PETUNJUK PENTING:
1. Anda HARUS mendasarkan semua konten secara ketat pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan yang DIAMBIL dari sumber, namun TERJEMAHKAN ke Bahasa Indonesia bila sumber bukan Bahasa Indonesia. Jangan menyalin teks non-Bahasa Indonesia.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.
4. Gunakan contoh, terminologi, dan penjelasan spesifik dari sumber.
5. Buat TEPAT ${recommendedSlides} slide rinci untuk mencakup topik secara komprehensif.
6. Setiap slide HARUS memiliki konten UNIK tanpa pengulangan antar slide.
7. Pastikan alur yang terpadu dan progresi yang logis sepanjang presentasi.
8. Sebarkan konten secara merata di seluruh slide untuk kedalaman dan detail yang konsisten.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan FIELDS berikut:
{
 "introduction": "An engaging introductory paragraph that provides context and importance of the topic",
 "slides": [
   {
     "title": "Slide Title",
     "content": [
       "Include several detailed points with examples and context"
     ],
     "notes": "Comprehensive speaker notes with additional details, examples, and teaching tips"
   }
 ]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.

PERSYARATAN BAHASA:
- Semua nilai string (introduction, slides[].title, slides[].content[], slides[].notes) HARUS dalam Bahasa Indonesia saja. Jangan mencampur bahasa.`
  }

  return `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} for a session.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}

${specializedPrompt}

IMPORTANT INSTRUCTIONS:
1. You MUST base all content strictly on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations from the sources, but TRANSLATE them into English when the sources are not in English. Do NOT copy non-English text.
3. Do not introduce concepts or information not present in the sources.
4. Use examples, terminology, and explanations specific to the sources.
5. Create EXACTLY ${recommendedSlides} detailed slides to cover the topic comprehensively.
6. Each slide MUST have UNIQUE content without repetition across slides.
7. Ensure cohesive flow and logical progression throughout the presentation.
8. Distribute content evenly across slides for consistent depth and detail.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with the following FIELDS:
{
 "introduction": "An engaging introductory paragraph that provides context and importance of the topic",
 "slides": [
   {
     "title": "Slide Title",
     "content": [
       "Include several detailed points with examples and context"
     ],
     "notes": "Comprehensive speaker notes with additional details, examples, and teaching tips"
   }
 ]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.

LANGUAGE REQUIREMENTS:
- All string values (introduction, slides[].title, slides[].content[], slides[].notes) MUST be in English only. No mixing of languages.`
}

// Activities system prompt
export function getActivitiesSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  contentTypePrompt: string,
  contentStylePrompt: string,
  difficultyLevelPrompt: string,
  recommendedActivities = 2,
  specializedPrompt = '',
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten secara ketat pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan langsung dari sumber.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan aktivitas pada topik mata kuliah dan capaian pembelajaran.
2. Gunakan praktik terbaik desain aktivitas yang relevan.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content strictly on the provided source materials.
2. Use key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base activities on the course topic and learning outcomes.
2. Use relevant activity design best practices.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Lanjutkan membuat ${contentType} tingkat ${difficultyLevel} untuk sebuah sesi.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}
${
  contentType === 'tutorial'
    ? `
Untuk tutorial, pastikan aktivitas:
- Membangun keterampilan secara progresif dari dasar hingga lanjutan
- Menyertakan kriteria keberhasilan yang jelas untuk setiap langkah
- Menyediakan kesempatan latihan dengan umpan balik
- Menyertakan panduan pemecahan masalah untuk isu umum
- Diakhiri dengan pertanyaan refleksi untuk memperkuat pembelajaran`
    : contentType === 'workshop'
      ? `
Untuk workshop, pastikan aktivitas:
- Mendorong partisipasi aktif dan kolaborasi
- Menyertakan peran yang jelas bagi anggota kelompok
- Memberikan tips fasilitasi untuk instruktur
- Menyertakan pemicu diskusi untuk memperdalam pemahaman
- Diakhiri dengan sesi berbagi atau presentasi`
      : ''
}

${specializedPrompt}

PETUNJUK PENTING:
${idInstructions}
4. Buat TEPAT ${recommendedActivities} aktivitas yang sesuai untuk durasi sesi.
5. Setiap aktivitas harus unik dan fokus pada aspek berbeda dari konten.
6. Sertakan estimasi waktu yang realistis untuk setiap aktivitas.
7. Pastikan aktivitas saling membangun secara logis.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan FIELDS berikut:
{
 "activities": [
   {
     "title": "Activity Title",
     "type": "Discussion/Exercise/Group work",
     "description": "Detailed activity description with clear learning objectives",
     "duration": "15 minutes",
     "instructions": ["Include several steps with clear guidance"],
     "materials": ["List all required materials"]
   }
 ]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.`
  }

  return `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} for a session.

${contentTypePrompt}

${contentStylePrompt}

${difficultyLevelPrompt}
${
  contentType === 'tutorial'
    ? `
For a tutorial, ensure activities:
- Build skills progressively from basic to advanced
- Include clear success criteria for each step
- Provide practice opportunities with feedback
- Include troubleshooting guidance for common issues
- End with reflection questions to reinforce learning`
    : contentType === 'workshop'
      ? `
For a workshop, ensure activities:
- Encourage active participation and collaboration
- Include clear roles for group members
- Provide facilitation tips for instructors
- Include discussion prompts to deepen understanding
- End with a sharing or presentation session`
      : ''
}

${specializedPrompt}

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Create EXACTLY ${recommendedActivities} activities appropriate for the session duration.
5. Each activity must be unique and focus on different aspects of the content.
6. Include realistic time estimates for each activity.
7. Ensure activities build on each other logically.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with the following FIELDS:
{
 "activities": [
   {
     "title": "Activity Title",
     "type": "Discussion/Exercise/Group work",
     "description": "Detailed activity description with clear learning objectives",
     "duration": "15 minutes",
     "instructions": ["Include several steps with clear guidance"],
     "materials": ["List all required materials"]
   }
 ]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.`
}

// Assessment system prompt
export function getAssessmentSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  topicName: string,
  sessionLength: number,
  specializedPrompt = '',
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten secara ketat pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan langsung dari sumber.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan ide penilaian pada topik mata kuliah dan capaian pembelajaran.
2. Gunakan praktik terbaik asesmen yang relevan.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content strictly on the provided source materials.
2. Use key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base assessment ideas on the course topic and learning outcomes.
2. Use relevant assessment best practices.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Buat ide penilaian untuk ${contentType} tingkat ${difficultyLevel} tentang "${topicName}" untuk sesi berdurasi ${sessionLength} menit.

${specializedPrompt}

PETUNJUK PENTING:
${idInstructions}
4. Buat ide penilaian beserta contoh pertanyaan.
5. Anda HARUS menyertakan tipe Kuis dan Diskusi.
6. Untuk pertanyaan Kuis, sertakan opsi, jawaban yang benar, dan penjelasan.
7. Untuk pertanyaan Diskusi, sertakan jawaban model yang rinci dan kriteria penilaian dengan alokasi poin.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan FIELDS berikut:
{
  "assessmentIdeas": [
    {
      "type": "Quiz",
      "duration": "Time required to complete",
      "description": "Detailed assessment description",
      "exampleQuestions": [
        {
          "question": "Full question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "The correct option text",
          "explanation": "Explanation for why this answer is correct"
        }
      ]
    },
    {
      "type": "Discussion",
      "duration": "Time required to complete",
      "description": "Detailed assessment description",
      "exampleQuestions": [
        {
          "question": "Discussion question",
          "correctAnswer": "Detailed guidance on points to be discussed",
          "explanation": {
            "criteria": [
              {"name": "Quality of contribution", "weight": 30},
              {"name": "Conceptual understanding", "weight": 25},
              {"name": "Critical thinking", "weight": 25},
              {"name": "Peer interaction", "weight": 20}
            ],
            "pointAllocation": "Detailed point allocation for different discussion aspects"
          }
        }
      ]
    }
  ]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.`
  }

  return `You are an expert educational content developer. Create assessment ideas for a ${difficultyLevel} level ${contentType} on "${topicName}" for a ${sessionLength}-minute session.

${specializedPrompt}

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Create assessment ideas WITH example questions.
5. You MUST include both Quiz and Discussion types.
6. For Quiz questions, include options, the correct answer, and an explanation.
7. For Discussion questions, include a detailed model answer and marking criteria with point allocation.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with the following FIELDS:
{
  "assessmentIdeas": [
    {
      "type": "Quiz",
      "duration": "Time required to complete",
      "description": "Detailed assessment description",
      "exampleQuestions": [
        {
          "question": "Full question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "The correct option text",
          "explanation": "Explanation for why this answer is correct"
        }
      ]
    },
    {
      "type": "Discussion",
      "duration": "Time required to complete",
      "description": "Detailed assessment description",
      "exampleQuestions": [
        {
          "question": "Discussion question",
          "correctAnswer": "Detailed guidance on points to be discussed",
          "explanation": {
            "criteria": [
              {"name": "Quality of contribution", "weight": 30},
              {"name": "Conceptual understanding", "weight": 25},
              {"name": "Critical thinking", "weight": 25},
              {"name": "Peer interaction", "weight": 20}
            ],
            "pointAllocation": "Detailed point allocation for different discussion aspects"
          }
        }
      ]
    }
  ]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.`
}

// Readings system prompt
export function getReadingsSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  topicName: string,
  sessionLength: number,
  specializedPrompt = '',
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten secara ketat pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan langsung dari sumber.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan rekomendasi bacaan pada topik mata kuliah.
2. Pilih bacaan yang relevan dan berkualitas.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content strictly on the provided source materials.
2. Use key concepts, terminology, examples, and explanations directly from the sources.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base reading recommendations on the course topic.
2. Choose relevant, high-quality readings.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Buat rekomendasi bacaan lanjutan untuk ${contentType} tingkat ${difficultyLevel} tentang "${topicName}" untuk sesi berdurasi ${sessionLength} menit.

${specializedPrompt}

PETUNJUK PENTING:
${idInstructions}
4. Jaga struktur tetap sederhana dan fokus hanya pada bacaan lanjutan.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan FIELDS berikut:
{
  "furtherReadings": [
    {
      "title": "Reading title",
      "author": "Author name",
      "readingDescription": "Short description of the reading and its relevance"
    }
  ]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.`
  }

  return `You are an expert educational content developer. Create further reading suggestions for a ${difficultyLevel} level ${contentType} on "${topicName}" for a ${sessionLength}-minute session.

${specializedPrompt}

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Keep the structure simple and focus only on further readings.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with the following FIELDS:
{
  "furtherReadings": [
    {
      "title": "Reading title",
      "author": "Author name",
      "readingDescription": "Short description of the reading and its relevance"
    }
  ]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.`
}

// Quiz question generation prompt
export function getQuizQuestionPrompt(
  topicName: string,
  description: string,
  language: Lang = 'en',
) {
  if (language === 'id') {
    return `Buat 3 pertanyaan pilihan ganda tentang "${topicName}" terkait: "${description}".

PENTING: Respon Anda harus berupa array JSON valid dari objek pertanyaan kuis dengan struktur berikut:
[
  {
    "question": "Full question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The exact text of the correct option",
    "explanation": "Explanation for why this answer is correct"
  }
]

Setiap pertanyaan harus memiliki tepat 4 opsi. Nilai correctAnswer harus persis cocok dengan salah satu opsi.
Jangan sertakan teks, markdown, atau penjelasan di luar array JSON.`
  }

  return `Generate 3 multiple-choice questions about "${topicName}" related to: "${description}".

IMPORTANT: Your response must be a valid JSON array of quiz question objects with the following structure:
[
  {
    "question": "Full question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The exact text of the correct option",
    "explanation": "Explanation for why this answer is correct"
  }
]

Each question must have exactly 4 options. The correctAnswer value must match exactly one of the options.
Do not include any text, markdown, or explanations outside the JSON array.`
}

// Discussion question generation prompt
export function getDiscussionQuestionPrompt(
  topicName: string,
  description: string,
  language: Lang = 'en',
) {
  if (language === 'id') {
    return `Buat 2 pertanyaan diskusi tentang "${topicName}" terkait: "${description}".

PENTING: Respon Anda harus berupa array JSON valid dari objek pertanyaan diskusi dengan struktur berikut:
[
  {
    "question": "Discussion question",
    "correctAnswer": "Detailed guidance on points to be discussed, including key concepts, examples, and possible arguments",
    "explanation": {
      "criteria": [
        {"name": "Quality of contribution", "weight": 30},
        {"name": "Conceptual understanding", "weight": 25},
        {"name": "Critical thinking", "weight": 25},
        {"name": "Peer interaction", "weight": 20}
      ],
      "pointAllocation": "Detailed point allocation for different discussion aspects"
    }
  }
]

Setiap pertanyaan diskusi harus menyertakan kriteria penilaian terperinci dengan alokasi poin spesifik.
Nilai correctAnswer harus memberikan panduan komprehensif tentang poin diskusi yang diharapkan.
Jangan sertakan teks, markdown, atau penjelasan di luar array JSON.`
  }

  return `Generate 2 discussion questions about "${topicName}" related to: "${description}".

IMPORTANT: Your response must be a valid JSON array of discussion question objects with the following structure:
[
  {
    "question": "Discussion question",
    "correctAnswer": "Detailed guidance on points to be discussed, including key concepts, examples, and possible arguments",
    "explanation": {
      "criteria": [
        {"name": "Quality of contribution", "weight": 30},
        {"name": "Conceptual understanding", "weight": 25},
        {"name": "Critical thinking", "weight": 25},
        {"name": "Peer interaction", "weight": 20}
      ],
      "pointAllocation": "Detailed point allocation for different discussion aspects"
    }
  }
]

Each discussion question must include detailed marking criteria with specific point allocations.
The correctAnswer must provide comprehensive guidance on the expected discussion points.
Do not include any text, markdown, or explanations outside the JSON array.`
}

// New: Intro, Special Slides, and Content Slides system prompts (bilingual)
export function getIntroSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  topicName: string,
  sessionLength: number,
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten SECARA KETAT pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan yang DIAMBIL dari sumber, namun TERJEMAHKAN ke Bahasa Indonesia bila sumber bukan Bahasa Indonesia. Jangan menyalin teks non-Bahasa Indonesia.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan pengantar pada topik mata kuliah dan konteks pembelajaran.
2. Fokus pada konsep inti dan relevansi topik dengan praktik nyata.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content STRICTLY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations from the sources, but TRANSLATE them into English when the sources are not in English. Do NOT copy non-English text.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base the introduction on the course topic and learning context.
2. Focus on core concepts and the topic's real-world relevance.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Lanjutkan membuat ${contentType} tingkat ${difficultyLevel} tentang "${topicName}" untuk sesi berdurasi ${sessionLength} menit.

PETUNJUK PENTING:
${idInstructions}
4. Buat pengantar yang menarik yang memberikan konteks dan pentingnya topik.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan TEPAT field berikut:
{
"introduction": "An engaging paragraph that provides context and importance of the topic"
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.

PERSYARATAN BAHASA:
- Nilai string "introduction" HARUS dalam Bahasa Indonesia.`
  }

  return `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} on "${topicName}" for a ${sessionLength}-minute session.

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Create an engaging introduction that provides context and the importance of the topic.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY the following field:
{
"introduction": "An engaging paragraph that provides context and importance of the topic"
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.

LANGUAGE REQUIREMENTS:
- The "introduction" string MUST be in English only.`
}

export function getSpecialSlidesSystemPrompt(
  difficultyLevel: string,
  contentType: string,
  topicName: string,
  sessionLength: number,
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten SECARA KETAT pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan yang DIAMBIL dari sumber, namun TERJEMAHKAN ke Bahasa Indonesia bila sumber bukan Bahasa Indonesia. Jangan menyalin teks non-Bahasa Indonesia.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan slide khusus pada konteks mata kuliah dan tujuan pembelajaran.
2. Gunakan struktur yang jelas dan relevan.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content STRICTLY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations from the sources, but TRANSLATE them into English when the sources are not in English. Do NOT copy non-English text.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base special slides on course context and learning objectives.
2. Use a clear and relevant structure.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda adalah pengembang konten pendidikan ahli. Lanjutkan membuat ${contentType} tingkat ${difficultyLevel} tentang "${topicName}" untuk sesi berdurasi ${sessionLength} menit.

PETUNJUK PENTING:
${idInstructions}
4. Buat HANYA slide khusus berikut:
 - Slide pengantar (slide pertama yang memperkenalkan topik)
 - Slide agenda/ikhtisar (menguraikan apa yang akan dibahas)
 - Slide penilaian (merangkum pendekatan penilaian)
 - Slide kesimpulan/rangkuman (merangkum presentasi)

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan TEPAT field berikut:
{
"specialSlides": [
  {
    "type": "introduction",
    "title": "Introduction to [Topic]",
    "content": ["Point 1", "Point 2", "Point 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "agenda",
    "title": "Agenda/Overview",
    "content": ["Topic 1", "Topic 2", "Topic 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "assessment",
    "title": "Assessment Approach",
    "content": ["Assessment method 1", "Assessment method 2"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "conclusion",
    "title": "Summary and Closing",
    "content": ["Key takeaway 1", "Key takeaway 2", "Next steps"],
    "notes": "Speaker notes for this slide"
  }
]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.

PERSYARATAN BAHASA:
- Semua nilai string dalam specialSlides HARUS dalam Bahasa Indonesia.`
  }

  return `You are an expert educational content developer. Continue creating a ${difficultyLevel} level ${contentType} on "${topicName}" for a ${sessionLength}-minute session.

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Create ONLY the following special slides:
 - Introduction slide (the first slide that introduces the topic)
 - Agenda/Overview slide (outlining what will be covered)
 - Assessment slide (summarizing the assessment approach)
 - Conclusion/Summary slide (summarizing the presentation)

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY the following field:
{
"specialSlides": [
  {
    "type": "introduction",
    "title": "Introduction to [Topic]",
    "content": ["Point 1", "Point 2", "Point 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "agenda",
    "title": "Agenda/Overview",
    "content": ["Topic 1", "Topic 2", "Topic 3"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "assessment",
    "title": "Assessment Approach",
    "content": ["Assessment method 1", "Assessment method 2"],
    "notes": "Speaker notes for this slide"
  },
  {
    "type": "conclusion",
    "title": "Summary and Closing",
    "content": ["Key takeaway 1", "Key takeaway 2", "Next steps"],
    "notes": "Speaker notes for this slide"
  }
]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.

LANGUAGE REQUIREMENTS:
- All string values in specialSlides MUST be in English only.`
}

export function getContentSlidesSystemPrompt(
  startSlideNum: number,
  endSlideNum: number,
  totalContentSlidesNeeded: number,
  language: Lang = 'en',
  hasSourceMaterials: boolean = true,
) {
  const idInstructions = hasSourceMaterials
    ? `1. Anda HARUS mendasarkan semua konten SECARA KETAT pada materi sumber yang diberikan.
2. Gunakan konsep kunci, terminologi, contoh, dan penjelasan yang DIAMBIL dari sumber, namun TERJEMAHKAN ke Bahasa Indonesia bila sumber bukan Bahasa Indonesia. Jangan menyalin teks non-Bahasa Indonesia.
3. Jangan memperkenalkan konsep atau informasi yang tidak ada di sumber.`
    : `1. Dasarkan slide konten pada topik mata kuliah dan struktur pengajaran yang jelas.
2. Gunakan contoh, terminologi, dan penjelasan yang relevan.
3. Jangan menambahkan informasi yang tidak relevan.`

  const enInstructions = hasSourceMaterials
    ? `1. You MUST base all content STRICTLY on the provided source materials.
2. Derive key concepts, terminology, examples, and explanations from the sources, but TRANSLATE them into English when the sources are not in English. Do NOT copy non-English text.
3. Do not introduce concepts or information not present in the sources.`
    : `1. Base content slides on the course topic and a clear instructional structure.
2. Use relevant examples, terminology, and explanations.
3. Do not add irrelevant information.`

  if (language === 'id') {
    return `Anda sedang membuat slide konten ${startSlideNum} hingga ${endSlideNum} dari total ${totalContentSlidesNeeded} slide konten. Pastikan semua slide unik.

PETUNJUK PENTING:
${idInstructions}
4. Buat slide pengajaran yang rinci dengan konten substansial pada setiap slide.
5. Fokus HANYA pada slide konten instruksional inti.
6. Setiap slide harus menyertakan catatan pembicara yang komprehensif dengan detail dan contoh tambahan.
7. Anda membuat slide konten ${startSlideNum} hingga ${endSlideNum} dari ${totalContentSlidesNeeded}.
8. JANGAN membuat slide pengantar, agenda, penilaian, atau kesimpulan — itu ditangani secara terpisah.

FORMAT RESPON:
Respon Anda HARUS berupa objek JSON valid dengan TEPAT field berikut:
{
"contentSlides": [
  {
    "title": "Slide Title",
    "content": [
      "Include several detailed points with examples and context",
      "Each array item represents a point or paragraph on the slide"
    ],
    "notes": "Comprehensive speaker notes with additional details, examples, and teaching tips"
  }
]
}

PENTING: Respon Anda HARUS berupa JSON valid saja. Jangan sertakan teks, markdown, penjelasan, atau konten di luar objek JSON. Jangan sertakan backticks atau kode blok.

PERSYARATAN BAHASA:
- Semua nilai string dalam contentSlides HARUS dalam Bahasa Indonesia.`
  }

  return `You are creating content slides ${startSlideNum} to ${endSlideNum} out of a total of ${totalContentSlidesNeeded} content slides. Ensure all slides are unique.

IMPORTANT INSTRUCTIONS:
${enInstructions}
4. Create detailed teaching slides with substantial content on each slide.
5. Focus ONLY on core instructional content slides.
6. Each slide must include comprehensive speaker notes with additional details and examples.
7. You are creating content slides ${startSlideNum} to ${endSlideNum} out of ${totalContentSlidesNeeded}.
8. DO NOT create introduction, agenda, assessment, or conclusion slides — those are handled separately.

RESPONSE FORMAT:
Your response MUST be a valid JSON object with EXACTLY the following field:
{
"contentSlides": [
  {
    "title": "Slide Title",
    "content": [
      "Include several detailed points with examples and context",
      "Each array item represents a point or paragraph on the slide"
    ],
    "notes": "Comprehensive speaker notes with additional details, examples, and teaching tips"
  }
]
}

CRITICAL: Your response MUST be valid JSON only. Do not include text, markdown, explanations, or any content outside the JSON object. Do not include backticks or code fences.

LANGUAGE REQUIREMENTS:
- All string values in contentSlides MUST be in English only.`
}
