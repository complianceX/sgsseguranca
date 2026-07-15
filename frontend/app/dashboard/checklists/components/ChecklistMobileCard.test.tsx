import { fireEvent, render, screen } from '@testing-library/react';
import { ChecklistMobileCard } from './ChecklistMobileCard';
import type { Checklist } from '@/services/checklistsService';

const checklist = {
  id: 'check-1',
  titulo: 'Inspeção da empilhadeira',
  data: '2026-07-15',
  status: 'Conforme',
  is_modelo: true,
  site_id: 'site-1',
  equipamento: 'Empilhadeira 01',
  inspetor: { nome: 'Maria' },
  company: { razao_social: 'Empresa Segura' },
} as Checklist;

const defaultCallbacks = {
  onToggleSelect: jest.fn(),
  onAiAnalysis: jest.fn(),
  onPrint: jest.fn(),
  onDownloadPdf: jest.fn(),
  onSendEmail: jest.fn(),
  onDelete: jest.fn(),
};

describe('ChecklistMobileCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('oferece no mobile as ações equivalentes de modelo e NC', () => {
    render(<ChecklistMobileCard checklist={checklist} selected={false} canManage canManageNc analyzing={false} printing={false} {...defaultCallbacks} />);

    expect(screen.getByRole('heading', { name: checklist.titulo })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Preencher checklist ${checklist.titulo}` })).toHaveAttribute('href', '/dashboard/checklists/new?source=model&templateId=check-1');
    expect(screen.getByRole('link', { name: /Abrir não conformidade com SOPHIE/ })).toHaveAttribute('href', expect.stringContaining('source_reference=check-1'));
    expect(screen.getByRole('link', { name: /Criar não conformidade manual/ })).toHaveAttribute('href', expect.stringContaining('checklist_id=check-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    fireEvent.click(screen.getByRole('button', { name: `Excluir checklist ${checklist.titulo}` }));
    expect(defaultCallbacks.onPrint).toHaveBeenCalledWith(checklist);
    expect(defaultCallbacks.onDelete).toHaveBeenCalledWith('check-1');
  });

  it('oculta ações administrativas e de NC sem as permissões correspondentes', () => {
    render(<ChecklistMobileCard checklist={checklist} selected canManage={false} canManageNc={false} analyzing={false} printing={false} {...defaultCallbacks} />);
    expect(screen.queryByRole('button', { name: /Excluir checklist/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /não conformidade/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Preencher checklist/ })).toBeInTheDocument();
  });
});
