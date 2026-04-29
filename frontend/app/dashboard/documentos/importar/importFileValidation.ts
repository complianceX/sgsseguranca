export const ALLOWED_IMPORT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
];

export const ALLOWED_IMPORT_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
  '.csv',
];

export const ACCEPTED_IMPORT_FILE_TYPES = [
  ...ALLOWED_IMPORT_EXTENSIONS,
  ...ALLOWED_IMPORT_MIME_TYPES,
].join(',');

export function isAllowedImportFile(file: File): boolean {
  if (!file) return false;
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  const isAllowedMime = ALLOWED_IMPORT_MIME_TYPES.includes(mimeType);
  const isAllowedExt = ALLOWED_IMPORT_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext),
  );

  // Alguns navegadores podem retornar file.type vazio ou inconsistente.
  return isAllowedMime || isAllowedExt;
}
