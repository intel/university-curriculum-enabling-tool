// Shared constants for PDF generation (dimensions in mm)
export const PAGE = {
  width: 210,
  height: 297,
  margin: 20,
}

export const COLORS = {
  purple: [94, 53, 177] as [number, number, number], // #5E35B1
  lightBlueBg: [240, 248, 255] as [number, number, number],
  grayLight: [245, 247, 250] as [number, number, number],
  gray: [200, 200, 200] as [number, number, number],
  text: [0, 0, 0] as [number, number, number],
  footer: [100, 100, 100] as [number, number, number],
}

export const FONT_SIZES = {
  sectionTitle: 16,
  title: 14,
  subtitle: 12,
  standard: 11,
  small: 10,
  footer: 10,
}

export const LINE_HEIGHT = 6 // base line height in mm for standard font size

export const SECTION_SPACING = 10
