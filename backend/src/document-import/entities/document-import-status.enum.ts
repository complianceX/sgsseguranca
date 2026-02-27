export enum DocumentImportStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  INTERPRETING = 'INTERPRETING',
  VALIDATING = 'VALIDATING', // aguardando conferência humana
  COMPLETED = 'COMPLETED', // validado e persistido
  FAILED = 'FAILED',
}
