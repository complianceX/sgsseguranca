import type { Did, DidStatus } from '@/services/didsService';

export const DID_TURNO_LABEL: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  integral: 'Integral',
};

export function getDidTurnoLabel(turno?: string | null) {
  if (!turno) {
    return 'Não informado';
  }

  return DID_TURNO_LABEL[turno] || turno;
}

export function getDidStatusLabel(status: DidStatus) {
  switch (status) {
    case 'rascunho':
      return 'Rascunho';
    case 'alinhado':
      return 'Alinhado';
    case 'executado':
      return 'Executado';
    case 'arquivado':
      return 'Arquivado';
    default:
      return status;
  }
}

export function getDidReadOnlyReason(
  did?: Pick<Did, 'pdf_file_key' | 'status'> | null,
) {
  if (!did) {
    return null;
  }

  if (did.pdf_file_key) {
    return 'Este Diálogo do Início do Dia já possui PDF final governado e não aceita edição.';
  }

  if (did.status === 'arquivado') {
    return 'Este Diálogo do Início do Dia está arquivado e não aceita edição.';
  }

  return null;
}

