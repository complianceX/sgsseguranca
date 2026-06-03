export const ValidationMessages = {
  IS_NOT_EMPTY: (field: string) => `${field} é obrigatório`,
  IS_STRING: (field: string) => `${field} deve ser um texto`,
  IS_EMAIL: (field: string) => `${field} deve ser um email válido`,
  IS_UUID: (field: string) => `${field} deve ser um ID válido`,
  MIN_LENGTH: (field: string, min: number) =>
    `${field} deve ter no mínimo ${min} caracteres`,
  MAX_LENGTH: (field: string, max: number) =>
    `${field} deve ter no máximo ${max} caracteres`,
  IS_BOOLEAN: (field: string) => `${field} deve ser verdadeiro ou falso`,
  IS_DATE: (field: string) => `${field} deve ser uma data válida`,
  IS_OPTIONAL: (field: string) => `${field} é opcional`,
};
