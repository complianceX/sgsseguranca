import { fireEvent, render, screen } from '@testing-library/react';
import { PtMobileCard } from './PtMobileCard';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', nome: 'Teste' }, hasPermission: () => true }),
}));
jest.mock('@/components/SignatureModal', () => ({
  SignatureModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Modal de assinatura</div> : null,
}));
jest.mock('@/components/SignaturesPanel', () => ({
  SignaturesPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Painel de assinaturas</div> : null,
}));

const pt = {
  id: 'pt-1',
  numero: 'PT-001',
  titulo: 'Entrada em espaço confinado',
  status: 'Pendente',
  data_hora_inicio: '2026-07-01T08:00:00.000Z',
  data_hora_fim: '2026-07-01T10:00:00.000Z',
  company_id: 'company-1',
} as never;

const checklist = {
  reviewedReadiness: false,
  reviewedWorkers: false,
  confirmedRelease: false,
};

const baseProps = {
  pt,
  onDelete: jest.fn(),
  onPrint: jest.fn(),
  onSendEmail: jest.fn(),
  onDownloadPdf: jest.fn(),
  onPrepareApproval: jest.fn(),
  onApprove: jest.fn(),
  onReject: jest.fn(),
  onFinalize: jest.fn(),
  preparing: false,
  approving: false,
  rejecting: false,
  finalizing: false,
  approvalChecklist: checklist,
  onDismissApprovalIssue: jest.fn(),
  onDismissApprovalReview: jest.fn(),
  onUpdateApprovalChecklist: jest.fn(),
};

const readyReview = {
  readyForRelease: true,
  blockers: [],
  unansweredChecklistItems: 0,
  adverseChecklistItems: 0,
  pendingSignatures: 0,
  hasRapidRiskBlocker: false,
  workerStatuses: [],
  warnings: [],
  rules: null,
};

describe('PtMobileCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exibe os dados essenciais e dispara ações autorizadas em targets mobile', () => {
    render(<PtMobileCard {...baseProps} />);

    expect(screen.getByRole('article', { name: 'PT PT-001' })).toHaveTextContent(
      'Entrada em espaço confinado',
    );
    const print = screen.getByRole('button', { name: /Imprimir/ });
    expect(print).toHaveClass('min-h-11');
    fireEvent.click(print);
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));
    expect(baseProps.onPrint).toHaveBeenCalledWith('pt-1');
    expect(baseProps.onDelete).toHaveBeenCalledWith('pt-1');
  });

  it('mantém a aprovação bloqueada até preencher todo o checklist final', () => {
    render(<PtMobileCard {...baseProps} approvalReview={readyReview} />);

    const approve = screen.getByRole('button', { name: 'Aprovar PT agora' });
    expect(approve).toBeDisabled();
    expect(screen.getByText('Checklist final do aprovador')).toBeInTheDocument();

    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    expect(baseProps.onUpdateApprovalChecklist).toHaveBeenCalledTimes(3);
  });

  it('permite aprovação quando a revisão está pronta e o checklist está preenchido', () => {
    const complete = { reviewedReadiness: true, reviewedWorkers: true, confirmedRelease: true };
    render(
      <PtMobileCard {...baseProps} approvalReview={readyReview} approvalChecklist={complete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar PT agora' }));
    expect(baseProps.onApprove).toHaveBeenCalledWith('pt-1');
  });

  it('oferece assinatura e consulta de assinaturas no card', async () => {
    render(<PtMobileCard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assinar PT' }));
    expect(await screen.findByText('Modal de assinatura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver assinaturas' }));
    expect(await screen.findByText('Painel de assinaturas')).toBeInTheDocument();
  });
});
