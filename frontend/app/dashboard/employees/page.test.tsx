import { render, screen, waitFor } from '@testing-library/react';
import EmployeesPage from './page';
import { usersService } from '@/services/usersService';

jest.mock('@/services/usersService', () => ({
  usersService: {
    findPaginated: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe('EmployeesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carrega funcionarios sem tornar usuario com acesso mutuamente exclusivo', async () => {
    jest.mocked(usersService.findPaginated).mockResolvedValue({
      data: [
        {
          id: 'user-1',
          nome: 'Ana Operacional',
          email: 'ana@example.com',
          cpf: '12345678900',
          role: 'TST',
          company_id: 'company-1',
          company: { id: 'company-1', razao_social: 'Empresa Teste' },
          site_id: 'site-1',
          site: { id: 'site-1', nome: 'Obra Central' },
          profile_id: 'profile-1',
          profile: { id: 'profile-1', nome: 'TST', permissoes: [] },
          identity_type: 'system_user',
          access_status: 'credentialed',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      total: 1,
      lastPage: 1,
    });

    render(<EmployeesPage />);

    await waitFor(() => {
      expect(usersService.findPaginated).toHaveBeenCalledWith({
        page: 1,
        search: undefined,
      });
    });

    expect(await screen.findByText('Ana Operacional')).toBeInTheDocument();
    expect(screen.getByText('Com acesso')).toBeInTheDocument();
  });
});
