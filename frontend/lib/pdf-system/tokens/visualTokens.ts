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
  pageBg: [255, 255, 255],
  surface: [255, 255, 255],
  surfaceMuted: [246, 249, 252],
  border: [210, 219, 230],
  borderStrong: [164, 178, 197],
  textPrimary: [15, 23, 42],
  textSecondary: [51, 65, 85],
  textMuted: [100, 116, 139],
  brand: [28, 62, 96],
  brandStrong: [14, 36, 60],
  brandOn: [255, 255, 255],
  success: [22, 101, 52],
  warning: [180, 83, 9],
  danger: [185, 28, 28],
  info: [2, 132, 199],
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
  headingLg: 15,
  headingMd: 11,
  headingSm: 9,
  body: 9.5,
  bodySm: 8.3,
  caption: 7.2,
};

export type PdfSpacing = {
  pageMargin: number;
  blockGap: number;
  sectionGap: number;
  inset: number;
  radius: number;
};

export const spacing: PdfSpacing = {
  pageMargin: 14,
  blockGap: 4,
  sectionGap: 7,
  inset: 4,
  radius: 2,
};

