import type { Checklist } from '@/services/checklistsService';

export function getChecklistSophieNcHref(checklist: Checklist): string {
  const params = new URLSearchParams();
  params.set('documentType', 'nc');
  params.set('source_type', 'checklist');
  params.set('source_reference', checklist.id);
  params.set('title', checklist.titulo || 'Não conformidade oriunda de checklist');
  if (checklist.descricao) params.set('description', checklist.descricao);
  if (checklist.site_id) params.set('site_id', checklist.site_id);
  params.set(
    'source_context',
    `Checklist ${checklist.titulo} com status ${checklist.status}.`,
  );
  return `/dashboard/sst-agent?${params.toString()}`;
}

export function getChecklistManualNcHref(checklist: Checklist): string {
  const params = new URLSearchParams();
  params.set('checklist_id', checklist.id);
  params.set(
    'title',
    checklist.titulo || 'Não conformidade oriunda de checklist',
  );
  if (checklist.site_id) params.set('site_id', checklist.site_id);
  return `/dashboard/nonconformities/new?${params.toString()}`;
}
