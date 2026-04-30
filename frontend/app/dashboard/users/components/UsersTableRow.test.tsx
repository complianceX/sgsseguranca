import { render, screen } from '@testing-library/react';
import { UsersTableRow } from './UsersTableRow';
import { User } from '@/services/usersService';

const baseUser: User = {
  id: 'user-1',
  nome: 'Maria Teste',
  email: 'maria@example.com',
  cpf: '12345678900',
  role: 'TST',
  company_id: 'company-1',
  profile_id: 'profile-1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function renderRow(user: User) {
  render(
    <table>
      <tbody>
        <UsersTableRow user={user} onDelete={jest.fn()} />
      </tbody>
    </table>,
  );
}

describe('UsersTableRow', () => {
  it('exibe credencial pendente para usuario sem credencial esperada', () => {
    renderRow({
      ...baseUser,
      access_status: 'missing_credentials',
    });

    expect(screen.getByText('Credencial pendente')).toBeInTheDocument();
  });

  it('nao chama no_login de com acesso', () => {
    renderRow({
      ...baseUser,
      access_status: 'no_login',
    });

    expect(screen.getByText('Sem login')).toBeInTheDocument();
    expect(screen.queryByText('Com acesso')).not.toBeInTheDocument();
  });
});
