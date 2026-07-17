import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserForm } from './UserForm';
import { companiesService } from '@/services/companiesService';
import { profilesService } from '@/services/profilesService';
import { sitesService } from '@/services/sitesService';
import { usersService } from '@/services/usersService';
import { handleApiError } from '@/lib/error-handler';

const pushMock = jest.fn();

const sessionCompany = {
  id: 'company-tst-1',
  razao_social: 'Empresa TST',
  cnpj: '00000000000100',
  endereco: 'Rua Teste',
  responsavel: 'Responsavel',
  status: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAdminGeral: false,
    user: {
      id: 'tst-user-1',
      nome: 'Tecnico TST',
      company_id: 'company-tst-1',
      profile: {
        nome: 'TST',
      },
    },
  }),
}));

jest.mock('@/services/companiesService', () => ({
  companiesService: {
    findOne: jest.fn(),
  },
}));

jest.mock('@/services/profilesService', () => ({
  profilesService: {
    findAll: jest.fn(),
  },
}));

jest.mock('@/services/sitesService', () => ({
  sitesService: {
    findPaginated: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@/services/usersService', () => ({
  UserIdentityType: {
    SYSTEM_USER: 'system_user',
    EMPLOYEE_SIGNER: 'employee_signer',
  },
  usersService: {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/error-handler', () => ({
  handleApiError: jest.fn(),
}));

describe('UserForm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    jest.mocked(companiesService.findOne).mockResolvedValue(sessionCompany);
    jest.mocked(profilesService.findAll).mockResolvedValue([
      {
        id: 'profile-tst',
        nome: 'TST',
        permissoes: ['can_view_sites', 'can_manage_users'],
      },
    ]);
    jest.mocked(sitesService.findPaginated).mockResolvedValue({
      data: [
        {
          id: 'site-obra-1',
          nome: 'Obra Central',
          company_id: 'company-tst-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      lastPage: 1,
    });
  });

  it('permite TST selecionar obra usando a empresa da sessao', async () => {
    render(<UserForm />);

    const siteCheckbox = await screen.findByRole('checkbox', {
      name: /Obra Central/i,
    });

    await waitFor(() => {
      expect(sitesService.findPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
        companyId: 'company-tst-1',
      });
    });

    expect(screen.queryByRole('combobox', { name: /Empresa/i })).not.toBeInTheDocument();
    expect(siteCheckbox).toBeEnabled();
    expect(await screen.findByText('Obra Central')).toBeInTheDocument();

    fireEvent.click(siteCheckbox);

    expect(siteCheckbox).toBeChecked();
  });

  it('mostra erro CPF inválido para dígitos iguais', async () => {
    render(<UserForm />);

    // aguarda carregamento dos dados assíncronos
    await screen.findByRole('checkbox', { name: /Obra Central/i });

    fireEvent.change(screen.getByLabelText('Nome Completo'), {
      target: { value: 'Funcionário Teste' },
    });
    fireEvent.change(screen.getByLabelText('Função'), {
      target: { value: 'Técnico' },
    });
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '111.111.111-11' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar usuário/i }));

    await waitFor(() => {
      expect(screen.getByText('CPF inválido')).toBeInTheDocument();
    });
  });

  it('mostra erro Email inválido para formato incorreto', async () => {
    render(<UserForm />);

    await screen.findByRole('checkbox', { name: /Obra Central/i });

    fireEvent.change(screen.getByLabelText('Nome Completo'), {
      target: { value: 'Funcionário Teste' },
    });
    fireEvent.change(screen.getByLabelText('Função'), {
      target: { value: 'Técnico' },
    });
    // CPF válido para que apenas o email falhe
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '098.780.584-33' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'email-sem-arroba' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar usuário/i }));

    await waitFor(() => {
      expect(screen.getByText('Email inválido')).toBeInTheDocument();
    });
  });

  it('bloqueia envio sem senha e sem e-mail (nenhum jeito de entregar credenciais)', async () => {
    render(<UserForm />);

    await screen.findByRole('checkbox', { name: /Obra Central/i });

    fireEvent.change(screen.getByLabelText('Nome Completo'), {
      target: { value: 'Funcionário Teste' },
    });
    fireEvent.change(screen.getByLabelText('Função'), {
      target: { value: 'Técnico' },
    });
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '098.780.584-33' },
    });
    fireEvent.change(screen.getByLabelText(/Perfil de Acesso/i), {
      target: { value: 'profile-tst' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar usuário/i }));

    await waitFor(() => {
      expect(handleApiError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Informe um e-mail (para enviar as credenciais) ou defina uma senha.',
        }),
        expect.any(String),
      );
    });
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('permite criar usuário sem senha quando há e-mail (credenciais vão por e-mail)', async () => {
    jest.mocked(usersService.create).mockResolvedValue({
      id: 'user-novo',
      must_change_password: true,
    } as never);

    render(<UserForm />);

    await screen.findByRole('checkbox', { name: /Obra Central/i });

    fireEvent.change(screen.getByLabelText('Nome Completo'), {
      target: { value: 'Funcionário Teste' },
    });
    fireEvent.change(screen.getByLabelText('Função'), {
      target: { value: 'Técnico' },
    });
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '098.780.584-33' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo.usuario@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Perfil de Acesso/i), {
      target: { value: 'profile-tst' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar usuário/i }));

    await waitFor(() => {
      expect(usersService.create).toHaveBeenCalledTimes(1);
    });
    const payload = jest.mocked(usersService.create).mock.calls[0][0];
    expect(payload.password).toBeUndefined();
    expect(payload.email).toBe('novo.usuario@example.com');
  });
});
