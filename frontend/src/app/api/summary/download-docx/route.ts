import { NextRequest, NextResponse } from 'next/server'
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx'

// Helper to fetch image as ArrayBuffer
async function fetchImageBuffer(url: string) {
  const urlObj = new URL(url).href
  const res = await fetch(urlObj)
  const blob = await res.blob()
  return await blob.arrayBuffer()
}

// Helper to parse inline markdown for bold, italic, code, and links
function parseInlineMarkdown(text: string) {
  const runs: TextRun[] = []
  const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          color: '000000',
          size: 22,
        }),
      )
    }
    if (match[1]) {
      // Bold
      runs.push(
        new TextRun({
          text: match[2],
          bold: true,
          color: '000000',
          size: 22,
        }),
      )
    } else if (match[3]) {
      // Italic
      runs.push(
        new TextRun({
          text: match[4],
          italics: true,
          color: '000000',
          size: 22,
        }),
      )
    } else if (match[5]) {
      // Inline code
      runs.push(
        new TextRun({
          text: match[5],
          font: 'Consolas',
          color: '888888',
          size: 22,
        }),
      )
    } else if (match[6] && match[7]) {
      // Link (render as blue underlined text)
      runs.push(
        new TextRun({
          text: match[6],
          style: 'Hyperlink',
          underline: {},
          color: '0000FF',
          size: 22,
        }),
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(lastIndex),
        color: '000000',
        size: 22,
      }),
    )
  }
  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text,
        color: '000000',
        size: 22,
      }),
    )
  }
  return runs
}

// Helper to parse markdown line and return docx children
async function parseMarkdownLine(
  line: string,
  extraOptions: Partial<{ keepLines: boolean; keepNext: boolean }> = {},
) {
  // Image markdown
  const imgMatch = line.match(/!\[.*?\]\((.*?)\)/)
  if (imgMatch) {
    const imageUrl = imgMatch[1]
    try {
      const buffer = await fetchImageBuffer(imageUrl)
      return [
        new Paragraph({
          children: [
            new ImageRun({
              data: buffer,
              transformation: { width: 320, height: 180 },
              type: 'png',
            }),
          ],
          spacing: { after: 24 },
        }),
      ]
    } catch {
      return [
        new Paragraph({
          children: [new TextRun('Image could not be loaded.')],
          spacing: { after: 24 },
        }),
      ]
    }
  }
  // Heading (##, ###, etc.)
  const headerMatch = line.match(/^(#{1,6})\s+(.*)/)
  if (headerMatch) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: headerMatch[2],
            bold: true,
            color: '1a237e',
            size: 26,
          }),
        ],
        heading: 'Heading1',
        spacing: { after: 18, line: 360 },
      }),
    ]
  }

  // Unordered list
  const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)/)
  if (ulMatch) {
    return [
      new Paragraph({
        children: parseInlineMarkdown(ulMatch[2]),
        bullet: { level: 0 },
        spacing: { after: 12, line: 360 },
      }),
    ]
  }

  // Ordered list
  const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/)
  if (olMatch) {
    return [
      new Paragraph({
        children: parseInlineMarkdown(olMatch[2]),
        numbering: { reference: 'numbered-list', level: 0 },
        spacing: { after: 12, line: 360 },
      }),
    ]
  }

  // Blockquote
  const bqMatch = line.match(/^>\s?(.*)/)
  if (bqMatch) {
    return [
      new Paragraph({
        children: parseInlineMarkdown(bqMatch[1]),
        style: 'Quote',
        spacing: { after: 18, line: 360 },
      }),
    ]
  }

  // Default: normal paragraph
  return [
    new Paragraph({
      ...extraOptions,
      children: parseInlineMarkdown(line),
      spacing: { after: 12, line: 360 },
    }),
  ]
}

export async function POST(req: NextRequest) {
  try {
    // Accept both { summary, sourceName } and { content, sourceName }
    const body = await req.json()
    const summary = body.summary || body.content || ''
    const sourceName = body.sourceName || 'source'
    // Clean up markdown heading symbols for headings (remove **, __, etc. from headings)
    const lines = summary.split(/\r?\n/)
    const children = []
    let i = 0
    while (i < lines.length) {
      let line = lines[i]
      // If heading, remove markdown bold/italic from heading text
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/)
      if (headerMatch) {
        // Remove **, __, *, _ from heading text
        const cleanHeading = headerMatch[2].replace(/(\*\*|__|\*|_)(.*?)\1/g, '$2')
        line = `${headerMatch[1]} ${cleanHeading}`
        // Start a new block with the heading
        const blockLines = [line]
        i++
        // Collect all lines until next heading or empty line
        while (i < lines.length && !lines[i].match(/^(#{1,6})\s+(.*)/) && lines[i].trim() !== '') {
          blockLines.push(lines[i])
          i++
        }
        // Parse all lines in the block
        const blockParagraphs: Paragraph[] = []
        for (const [idx, blockLine] of blockLines.entries()) {
          // All but last: keepLines + keepNext, last: keepLines only
          const isLast = idx === blockLines.length - 1
          const extraOptions = isLast ? { keepLines: true } : { keepLines: true, keepNext: true }
          const paragraphs = await parseMarkdownLine(blockLine, extraOptions)
          blockParagraphs.push(...paragraphs)
        }
        children.push(...blockParagraphs)
      } else {
        children.push(...(await parseMarkdownLine(line)))
        i++
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
      numbering: {
        config: [
          {
            reference: 'numbered-list',
            levels: [
              {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: 'left',
              },
            ],
          },
        ],
      },
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = `summary_${sourceName}.docx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate Word document' }, { status: 500 })
  }
}
