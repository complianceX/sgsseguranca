import { render, screen, within } from '@testing-library/react';
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

  it('shows contextual quick access for TST users', () => {
    useAuth.mockReturnValue({
      logout: jest.fn(),
      user: {
        nome: 'Tecnico',
        profile: { nome: 'Técnico de Segurança' },
      },
      roles: ['Técnico de Segurança'],
      hasPermission: () => true,
    });

    render(<Sidebar />);

    const quickAccessSection = screen.getByText('Acesso rápido').closest('section');
    expect(quickAccessSection).toBeTruthy();
    expect(within(quickAccessSection as HTMLElement).getByRole('link', { name: /Campo/i })).toBeInTheDocument();
    expect(within(quickAccessSection as HTMLElement).getByRole('link', { name: /PTs/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Empresas/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Leitura e gestão')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Indicadores/i })).not.toBeInTheDocument();
  });

  it('shows executive quick access for admin users', () => {
    usePathname.mockReturnValue('/dashboard/companies');
    useAuth.mockReturnValue({
      logout: jest.fn(),
      user: {
        nome: 'Admin',
        profile: { nome: 'Administrador Geral' },
      },
      roles: ['Administrador Geral'],
      hasPermission: () => true,
    });

    render(<Sidebar />);

    const quickAccessSection = screen.getByText('Acesso rápido').closest('section');
    expect(quickAccessSection).toBeTruthy();
    expect(within(quickAccessSection as HTMLElement).getByRole('link', { name: /^Empresas$/i })).toBeInTheDocument();
    expect(within(quickAccessSection as HTMLElement).getByRole('link', { name: /^Usuários$/i })).toBeInTheDocument();
  });
});
