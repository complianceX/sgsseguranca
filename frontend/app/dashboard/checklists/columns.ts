import { Checklist } from '@/services/checklistsService';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';

export type ChecklistColumnKey =
  | 'data'
  | 'titulo'
  | 'equipamento'
  | 'empresa'
  | 'inspetor'
  | 'status';

export interface ChecklistColumnOption {
  key: ChecklistColumnKey;
  label: string;
}

export interface ChecklistSavedView {
  id: string;
  name: string;
  columns: ChecklistColumnKey[];
  modelFilter: 'all' | 'model' | 'regular';
  searchTerm: string;
  createdAt: number;
}

export const checklistColumnOptions: ChecklistColumnOption[] = [
  { key: 'data', label: 'Data' },
  { key: 'titulo', label: 'Título' },
  { key: 'equipamento', label: 'Ferramenta/Máquina' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'inspetor', label: 'Inspetor' },
  { key: 'status', label: 'Status' },
];

export const defaultChecklistColumns: ChecklistColumnKey[] = [
  'data',
  'titulo',
  'equipamento',
  'status',
];

export const checklistColumnLabels: Record<ChecklistColumnKey, string> = {
  data: 'Data',
  titulo: 'Título',
  equipamento: 'Ferramenta/Máquina',
  empresa: 'Empresa',
  inspetor: 'Inspetor',
  status: 'Status',
};

export function getChecklistColumnValue(
  checklist: Checklist,
  column: ChecklistColumnKey,
): string {
  switch (column) {
    case 'data':
      return safeToLocaleDateString(checklist.data, 'pt-BR', undefined, '-');
    case 'titulo':
      return checklist.titulo;
    case 'equipamento':
      return [checklist.equipamento, checklist.maquina].filter(Boolean).join(' / ') || '-';
    case 'empresa':
      return checklist.company?.razao_social || '-';
    case 'inspetor':
      return checklist.inspetor?.nome || '-';
    case 'status':
      return checklist.status;
    default:
      return '';
  }
}
