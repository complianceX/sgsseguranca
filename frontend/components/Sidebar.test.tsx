import { fireEvent, render, screen, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';

const usePathname = jest.fn();
const useAuth = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    usePathname.mockReturnValue('/dashboard/tst');
  });

  it('shows operational navigation and user management for TST users without admin-only links', () => {
    useAuth.mockReturnValue({
      logout: jest.fn(),
      user: {
        nome: 'Tecnico',
        profile: { nome: 'Técnico de Segurança' },
      },
      roles: ['Técnico de Segurança'],
      isAdminGeral: false,
      hasPermission: () => true,
    });

    render(<Sidebar />);

    expect(screen.getByText('Estrutura')).toBeInTheDocument();
    expect(screen.getByText('Campo e Operação')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Funcionários/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Usuários e acesso/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DDS/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PTs/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Empresas$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Calendário/i })).toBeInTheDocument();
  });

  it('shows administrative links for admin users', () => {
    usePathname.mockReturnValue('/dashboard/companies');
    useAuth.mockReturnValue({
      logout: jest.fn(),
      user: {
        nome: 'Admin',
        profile: { nome: 'Administrador Geral' },
      },
      roles: ['Administrador Geral'],
      isAdminGeral: true,
      hasPermission: () => true,
    });

    render(<Sidebar />);

    const estruturaSection = screen.getByText('Estrutura').closest('section');
    expect(estruturaSection).toBeTruthy();
    expect(
      within(estruturaSection as HTMLElement).getByRole('link', {
        name: /^Empresas$/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(estruturaSection as HTMLElement).getByRole('link', {
        name: /Usuários e acesso/i,
      }),
    ).toBeInTheDocument();
    const leituraEGestaoToggle = screen.getByRole('button', {
      name: /Leitura e Gestão/i,
    });
    expect(leituraEGestaoToggle).toBeInTheDocument();
    fireEvent.click(leituraEGestaoToggle);
    expect(screen.getByRole('link', { name: /Indicadores/i })).toBeInTheDocument();
  });
});
