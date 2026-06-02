export enum DocumentImportStatus {
  UPLOADED = 'UPLOADED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  INTERPRETING = 'INTERPRETING',
  VALIDATING = 'VALIDATING', // aguardando conferência humana
  COMPLETED = 'COMPLETED', // validado e persistido
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}
