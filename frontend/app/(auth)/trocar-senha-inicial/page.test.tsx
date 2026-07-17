import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TrocarSenhaInicialPage from './page';
import api from '@/lib/api';
import { toast } from 'sonner';
import { tokenStore } from '@/lib/tokenStore';
import { forcePasswordChangeStore } from '@/lib/forcePasswordChangeStore';

const pushMock = jest.fn();
const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function fillAndSubmit(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Senha temporária recebida por e-mail'), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText('Nova senha'), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: /Trocar senha e continuar/i }));
}

describe('TrocarSenhaInicialPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockClear();
    replaceMock.mockClear();
    tokenStore.clear();
    forcePasswordChangeStore.clear();
  });

  it('redireciona para /login quando não há troca pendente (sem sessão/refresh)', async () => {
    render(<TrocarSenhaInicialPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('mostra a saudação e não redireciona quando há troca pendente', async () => {
    forcePasswordChangeStore.set({ nome: 'Novo Usuário' });

    render(<TrocarSenhaInicialPage />);

    expect(await screen.findByText(/Olá, Novo Usuário/i)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('bloqueia quando a confirmação não bate, sem chamar a API', async () => {
    forcePasswordChangeStore.set({ nome: 'Novo Usuário' });
    render(<TrocarSenhaInicialPage />);
    await screen.findByText(/Olá, Novo Usuário/i);

    fillAndSubmit('SenhaTemp@1', 'NovaSenha@123', 'NovaSenhaDiferente@123');

    await waitFor(() => {
      expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('troca a senha, limpa o token limitado e redireciona para /login', async () => {
    forcePasswordChangeStore.set({ nome: 'Novo Usuário' });
    tokenStore.set('token-temporario');
    (api.post as jest.Mock).mockResolvedValue({ data: {} });

    render(<TrocarSenhaInicialPage />);
    await screen.findByText(/Olá, Novo Usuário/i);

    fillAndSubmit('SenhaTemp@1', 'NovaSenha@123', 'NovaSenha@123');

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'SenhaTemp@1',
        newPassword: 'NovaSenha@123',
      });
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login');
    });
    expect(toast.success).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(forcePasswordChangeStore.get()).toBeNull();
  });

  it('mostra a mensagem de erro do backend quando a senha atual é inválida', async () => {
    forcePasswordChangeStore.set({ nome: 'Novo Usuário' });
    (api.post as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { message: 'Senha atual inválida' } },
    });

    render(<TrocarSenhaInicialPage />);
    await screen.findByText(/Olá, Novo Usuário/i);

    fillAndSubmit('senha-errada', 'NovaSenha@123', 'NovaSenha@123');

    await waitFor(() => {
      expect(screen.getByText('Senha atual inválida')).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalledWith('/login');
  });
});
