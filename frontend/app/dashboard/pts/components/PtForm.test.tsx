import { render, screen } from '@testing-library/react';
import { PtForm } from './PtForm';
import { initialChecklists } from './pt-schema-and-data';

const searchParamsGet = jest.fn();
const push = jest.fn();
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsGet }),
  useRouter: () => ({ push, refresh }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      nome: 'Tecnico',
      company_id: 'company-1',
      profile: { nome: 'Técnico de Segurança' },
    },
    hasPermission: () => true,
  }),
}));

jest.mock('@/components/AuditSection', () => ({
  AuditSection: () => <div>Audit Section</div>,
}));

jest.mock('@/components/DocumentEmailModal', () => ({
  DocumentEmailModal: () => null,
}));

jest.mock('../../checklists/components/SignatureModal', () => ({
  SignatureModal: () => null,
}));

jest.mock('@/components/layout', () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock('./BasicInfoSection', () => ({
  BasicInfoSection: () => {
    const { useFormContext } = jest.requireActual('react-hook-form');
    const { watch } = useFormContext();
    return <div>Status atual: {watch('status')}</div>;
  },
}));

jest.mock('./RiskTypesSection', () => ({
  RiskTypesSection: () => <div>Risk Types Section</div>,
}));

jest.mock('./RapidRiskAnalysisSection', () => ({
  RapidRiskAnalysisSection: () => <div>Rapid Risk Section</div>,
}));

jest.mock('./ResponsibleExecutorsSection', () => ({
  ResponsibleExecutorsSection: () => <div>Responsible Executors Section</div>,
}));

jest.mock('./ChecklistSection', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

jest.mock('./PtPreApprovalHistoryPanel', () => ({
  PtPreApprovalHistoryPanel: () => <div>Pre Approval History</div>,
}));

jest.mock('./PtReadinessPanel', () => ({
  PtReadinessPanel: ({
    readyForRelease,
  }: {
    readyForRelease: boolean;
  }) => <div>{readyForRelease ? 'Readiness OK' : 'Readiness Blocked'}</div>,
}));

const createPt = jest.fn();
const updatePt = jest.fn();
const attachPtFile = jest.fn();
const findPt = jest.fn();
const getPreApprovalHistory = jest.fn();
const findCompaniesPaginated = jest.fn();
const findCompany = jest.fn();
const findAprsPaginated = jest.fn();
const findApr = jest.fn();
const findSitesPaginated = jest.fn();
const findSite = jest.fn();
const findUsersPaginated = jest.fn();
const findUser = jest.fn();
const findSignatures = jest.fn();
const createSignature = jest.fn();

jest.mock('@/services/ptsService', () => ({
  ptsService: {
    create: (...args: unknown[]) => createPt(...args),
    update: (...args: unknown[]) => updatePt(...args),
    attachFile: (...args: unknown[]) => attachPtFile(...args),
    findOne: (...args: unknown[]) => findPt(...args),
    getPreApprovalHistory: (...args: unknown[]) => getPreApprovalHistory(...args),
  },
}));

jest.mock('@/services/companiesService', () => ({
  companiesService: {
    findPaginated: (...args: unknown[]) => findCompaniesPaginated(...args),
    findOne: (...args: unknown[]) => findCompany(...args),
  },
}));

jest.mock('@/services/aprsService', () => ({
  aprsService: {
    findPaginated: (...args: unknown[]) => findAprsPaginated(...args),
    findOne: (...args: unknown[]) => findApr(...args),
  },
}));

jest.mock('@/services/sitesService', () => ({
  sitesService: {
    findPaginated: (...args: unknown[]) => findSitesPaginated(...args),
    findOne: (...args: unknown[]) => findSite(...args),
  },
}));

jest.mock('@/services/usersService', () => ({
  usersService: {
    findPaginated: (...args: unknown[]) => findUsersPaginated(...args),
    findOne: (...args: unknown[]) => findUser(...args),
  },
}));

jest.mock('@/services/signaturesService', () => ({
  signaturesService: {
    findByDocument: (...args: unknown[]) => findSignatures(...args),
    create: (...args: unknown[]) => createSignature(...args),
  },
}));

jest.mock('@/services/mailService', () => ({
  mailService: {
    sendStoredDocument: jest.fn(),
  },
}));

jest.mock('@/services/aiService', () => ({
  aiService: {
    analyzePt: jest.fn(),
  },
}));

describe('PtForm', () => {
  beforeEach(() => {
    localStorage.clear();
    searchParamsGet.mockImplementation(() => null);

    createPt.mockResolvedValue({ id: 'pt-1' });
    updatePt.mockResolvedValue({ id: 'pt-1' });
    attachPtFile.mockResolvedValue(undefined);
    findPt.mockResolvedValue(null);
    getPreApprovalHistory.mockResolvedValue([]);
    findCompaniesPaginated.mockResolvedValue({ data: [] });
    findCompany.mockResolvedValue({
      id: 'company-1',
      razao_social: 'Empresa Teste',
    });
    findAprsPaginated.mockResolvedValue({ data: [] });
    findApr.mockResolvedValue(null);
    findSitesPaginated.mockResolvedValue({
      data: [{ id: 'site-1', nome: 'Obra Norte', company_id: 'company-1' }],
    });
    findSite.mockResolvedValue({ id: 'site-1', nome: 'Obra Norte', company_id: 'company-1' });
    findUsersPaginated.mockResolvedValue({
      data: [{ id: 'user-1', nome: 'Responsável', company_id: 'company-1' }],
    });
    findUser.mockResolvedValue({ id: 'user-1', nome: 'Responsável', company_id: 'company-1' });
    findSignatures.mockResolvedValue([]);
    createSignature.mockResolvedValue(undefined);
  });

  it('switches sidebar context when a restored draft opens directly in step 2', async () => {
    localStorage.setItem(
      'gst.pt.wizard.draft.company-1',
      JSON.stringify({
        step: 2,
        values: {
          company_id: 'company-1',
          site_id: 'site-1',
          responsavel_id: 'user-1',
          titulo: 'PT de manutenção',
          trabalho_altura: true,
          executantes: ['user-1'],
        },
        metadata: {},
      }),
    );

    render(<PtForm />);

    expect(await screen.findByText('Etapa 2 de 3')).toBeInTheDocument();
    expect(screen.getAllByText('Pendências').length).toBeGreaterThan(0);
    expect(screen.getByText('Respostas críticas')).toBeInTheDocument();
    expect(screen.queryByText('APR vinculada')).not.toBeInTheDocument();
    expect(screen.queryByText('Readiness OK')).not.toBeInTheDocument();
    expect(screen.queryByText('Readiness Blocked')).not.toBeInTheDocument();
  });

  it('normalizes legacy draft status before the PT generic flow is restored', async () => {
    localStorage.setItem(
      'gst.pt.wizard.draft.company-1',
      JSON.stringify({
        step: 1,
        values: {
          company_id: 'company-1',
          site_id: 'site-1',
          responsavel_id: 'user-1',
          titulo: 'PT herdada',
          numero: 'PT-900',
          status: 'Aprovada',
          executantes: ['user-1'],
        },
        metadata: {},
      }),
    );

    render(<PtForm />);

    expect(await screen.findByText('Etapa 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Status atual: Pendente')).toBeInTheDocument();
  });

  it('hides the SOPHIE helper block when the restored draft opens in the final step', async () => {
    localStorage.setItem(
      'gst.pt.wizard.draft.company-1',
      JSON.stringify({
        step: 3,
        values: {
          company_id: 'company-1',
          site_id: 'site-1',
          responsavel_id: 'user-1',
          titulo: 'PT final',
          executantes: ['user-1'],
        },
        metadata: {
          suggestedRisks: [{ label: 'Altura' }],
          mandatoryChecklists: [{ id: 'check-1', label: 'Checklist crítico', reason: 'Obrigatório', source: 'pt-group' }],
          riskLevel: 'Alto',
        },
      }),
    );

    render(<PtForm />);

    expect(await screen.findByText('Etapa 3 de 3')).toBeInTheDocument();
    expect(screen.getAllByText('Fechamento da liberação').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sugestões da SOPHIE')).not.toBeInTheDocument();
    expect(screen.getByText('Situação')).toBeInTheDocument();
    expect(screen.getByText('Readiness Blocked')).toBeInTheDocument();
  });

  it('does not count unanswered optional excavation items as pending blockers', async () => {
    localStorage.setItem(
      'gst.pt.wizard.draft.company-1',
      JSON.stringify({
        step: 2,
        values: {
          company_id: 'company-1',
          site_id: 'site-1',
          responsavel_id: 'user-1',
          titulo: 'Escavação segura',
          escavacao: true,
          executantes: ['user-1'],
          analise_risco_rapida_checklist: initialChecklists.analise_risco_rapida_checklist.map((item) => ({
            ...item,
            resposta: 'Sim',
          })),
          recomendacoes_gerais_checklist: initialChecklists.recomendacoes_gerais_checklist.map((item) => ({
            ...item,
            resposta: 'Ciente',
          })),
          trabalho_escavacao_checklist: initialChecklists.trabalho_escavacao_checklist.map((item) =>
            item.id === 'estruturas_reforcadas_engenheiro'
              ? item
              : { ...item, resposta: 'Sim' },
          ),
        },
        metadata: {},
      }),
    );

    render(<PtForm />);

    expect(await screen.findByText('Etapa 2 de 3')).toBeInTheDocument();
    expect(screen.getAllByText(/0 resposta/i).length).toBeGreaterThan(0);
  });
});
