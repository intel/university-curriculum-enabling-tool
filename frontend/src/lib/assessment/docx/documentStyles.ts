import * as docx from 'docx'

export const paragraphStyles: docx.IParagraphStyleOptions[] = [
  {
    id: 'footer',
    name: 'Footer',
    run: { size: 20, color: '666666' },
  },
  {
    id: 'strongText',
    name: 'Strong Text',
    run: { bold: true },
  },
  {
    id: 'criteriaDescription',
    name: 'Criteria Description',
    run: { size: 20, color: '1a56db', italics: true },
  },
  {
    id: 'weightText',
    name: 'Weight Text',
    run: { size: 18, color: '666666', italics: true },
  },
  {
    id: 'code',
    name: 'Code',
    run: { font: 'Courier New', size: 20 },
    paragraph: {
      spacing: { before: 40, after: 40 },
      indent: { left: 720 },
      shading: { type: docx.ShadingType.SOLID, color: 'F5F5F5' },
    },
  },
]

export const numberingConfig: docx.INumberingOptions['config'] = [
  {
    reference: 'projectPoints',
    levels: Array.from({ length: 5 }, (_, i) => ({
      level: i,
      format: 'decimal',
      text: '',
      alignment: 'start',
      style: { paragraph: { indent: { left: 240 * (i + 1), hanging: 120 } } },
    })),
  },
  {
    reference: 'bulletPoints',
    levels: Array.from({ length: 5 }, (_, i) => ({
      level: i,
      format: docx.LevelFormat.BULLET,
      text: '',
      alignment: 'start',
      style: { paragraph: { indent: { left: 240 * (i + 1), hanging: 120 } } },
    })),
  },
]
