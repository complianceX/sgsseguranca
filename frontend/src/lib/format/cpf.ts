/**
 * Utilitários de formatação e mascaramento de CPF.
 *
 * LGPD Art. 6º, III — princípio de minimização de dados:
 * Em listagens e tabelas, use `maskCpf`. O CPF completo só deve ser exibido
 * mediante ação explícita do usuário em tela de detalhe/edição individual.
 */

/**
 * Retorna "***.***.***-XX" preservando os 2 últimos dígitos para identificação mínima.
 * Entradas inválidas (não numéricas, comprimento diferente de 11) retornam '-'.
 */
export function maskCpf(value?: string | null): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return '-';
  return `***.***.***-${digits.slice(9)}`;
}

/**
 * Formata CPF com pontuação padrão: "123.456.789-00".
 * Entradas inválidas retornam o valor original ou '-' se ausente.
 * Use apenas em telas de edição/detalhe individual, nunca em listagens.
 */
export function formatCpf(value?: string | null): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return value ?? '-';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
