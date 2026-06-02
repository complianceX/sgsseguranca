export type PdfRgb = [number, number, number];

export type PdfTone = {
  pageBg: PdfRgb;
  surface: PdfRgb;
  surfaceMuted: PdfRgb;
  border: PdfRgb;
  borderStrong: PdfRgb;
  textPrimary: PdfRgb;
  textSecondary: PdfRgb;
  textMuted: PdfRgb;
  brand: PdfRgb;
  brandStrong: PdfRgb;
  brandOn: PdfRgb;
  success: PdfRgb;
  warning: PdfRgb;
  danger: PdfRgb;
  info: PdfRgb;
};

export const baseTone: PdfTone = {
  pageBg: [246, 248, 251],
  surface: [255, 255, 255],
  surfaceMuted: [238, 243, 248],
  border: [211, 220, 230],
  borderStrong: [134, 148, 166],
  textPrimary: [17, 24, 39],
  textSecondary: [55, 65, 81],
  textMuted: [107, 114, 128],
  brand: [24, 81, 124],
  brandStrong: [15, 32, 54],
  brandOn: [255, 255, 255],
  success: [27, 94, 62],
  warning: [180, 95, 20],
  danger: [176, 42, 42],
  info: [24, 101, 176],
};

export type PdfTypography = {
  headingLg: number;
  headingMd: number;
  headingSm: number;
  body: number;
  bodySm: number;
  caption: number;
};

export const typography: PdfTypography = {
  headingLg: 15.2,
  headingMd: 11.6,
  headingSm: 9.5,
  body: 9.2,
  bodySm: 8.3,
  caption: 7,
};

export type PdfSpacing = {
  pageMargin: number;
  blockGap: number;
  sectionGap: number;
  inset: number;
  radius: number;
};

export const spacing: PdfSpacing = {
  pageMargin: 16,
  blockGap: 5,
  sectionGap: 9,
  inset: 4.8,
  radius: 2.8,
};
