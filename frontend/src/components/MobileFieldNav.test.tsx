import { render, screen } from '@testing-library/react';
import { MobileFieldNav } from './MobileFieldNav';

const usePathname = jest.fn();
const useAuth = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => usePathname() }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }));
jest.mock('@/lib/featureFlags', () => ({ isAiEnabled: () => false }));

describe('MobileFieldNav', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ hasPermission: () => true, isAdminGeral: false });
  });

  it('deriva no máximo cinco atalhos por prioridade do catálogo', () => {
    usePathname.mockReturnValue('/dashboard');
    render(<MobileFieldNav />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Painel', 'Campo', 'APRs', 'PTs', 'Docs']);
  });

  it('respeita permissão e mantém subrota ativa', () => {
    usePathname.mockReturnValue('/dashboard/aprs/edit/123');
    useAuth.mockReturnValue({ hasPermission: () => false, isAdminGeral: false });
    render(<MobileFieldNav />);
    expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'APRs' })).toHaveAttribute('aria-current', 'page');
  });
});
