import api from '@/lib/api';
import { authService } from '@/services/authService';
import { companiesService } from '@/services/companiesService';
import { fetchAllPages } from '@/services/pagination';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/services/authService', () => ({
  authService: {
    getCurrentSession: jest.fn(),
  },
}));

jest.mock('@/services/pagination', () => ({
  fetchAllPages: jest.fn(),
}));

const tenantCompany = {
  id: 'company-1',
  razao_social: 'SGS Cliente',
  cnpj: '12345678000190',
  endereco: 'Rua A',
  responsavel: 'Responsavel',
  status: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('companiesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna paginas quando a listagem global esta autorizada', async () => {
    (fetchAllPages as jest.Mock).mockResolvedValue([tenantCompany]);

    await expect(companiesService.findAll()).resolves.toEqual([
      expect.objectContaining(tenantCompany),
    ]);

    expect(fetchAllPages).toHaveBeenCalled();
    expect(authService.getCurrentSession).not.toHaveBeenCalled();
  });

  it('usa a empresa da sessao quando a listagem global e negada para usuario tenant-scoped', async () => {
    (fetchAllPages as jest.Mock).mockRejectedValue({
      response: { status: 403 },
    });
    (authService.getCurrentSession as jest.Mock).mockResolvedValue({
      user: {
        company_id: tenantCompany.id,
        company: tenantCompany,
      },
    });

    await expect(companiesService.findAll()).resolves.toEqual([
      expect.objectContaining(tenantCompany),
    ]);

    expect(authService.getCurrentSession).toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('busca a propria empresa quando a sessao nao traz objeto company completo', async () => {
    (fetchAllPages as jest.Mock).mockRejectedValue({
      response: { status: 403 },
    });
    (authService.getCurrentSession as jest.Mock).mockResolvedValue({
      user: {
        company_id: tenantCompany.id,
      },
    });
    (api.get as jest.Mock).mockResolvedValue({ data: tenantCompany });

    await expect(companiesService.findAll()).resolves.toEqual([tenantCompany]);

    expect(api.get).toHaveBeenCalledWith('/companies/company-1');
  });
});
