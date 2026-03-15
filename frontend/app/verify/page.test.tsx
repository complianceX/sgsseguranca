import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PublicHashVerifyPage from './page';

jest.mock('@/lib/api', () => ({
  buildApiUrl: jest.fn((path: string) => `https://api.example.test${path}`),
}));

describe('PublicHashVerifyPage', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.history.pushState({}, '', '/verify');
  });

  it('uses the public evidence route when validating APR evidence', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ verified: true, matchedIn: 'original', evidence: { apr_numero: 'APR-1' } }),
    });

    render(<PublicHashVerifyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Evidência APR' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'a'.repeat(64) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/public/evidence/verify?hash='.concat('a'.repeat(64)),
        expect.objectContaining({ method: 'GET', cache: 'no-store' }),
      );
    });

    expect(await screen.findByText('Registro validado com sucesso.')).toBeInTheDocument();
  });

  it('uses the public signature route when validating a signature hash', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        valid: true,
        signature: { hash: 'b'.repeat(64), document_type: 'PT' },
      }),
    });

    render(<PublicHashVerifyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Assinatura PDF' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'b'.repeat(64) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/public/signature/verify?hash='.concat('b'.repeat(64)),
        expect.objectContaining({ method: 'GET', cache: 'no-store' }),
      );
    });

    expect(await screen.findByText('Registro validado com sucesso.')).toBeInTheDocument();
  });

  it('uses the public inspection route when validating a document code', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        valid: true,
        code: 'INS-2026-22D77ACC',
        inspection: { id: 'insp-1', tipo_inspecao: 'Rotina' },
      }),
    });

    render(<PublicHashVerifyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Código do documento' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'INS-2026-22D77ACC' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/public/inspections/validate?code=INS-2026-22D77ACC',
        expect.objectContaining({ method: 'GET', cache: 'no-store' }),
      );
    });

    expect(await screen.findByText('Registro validado com sucesso.')).toBeInTheDocument();
  });
});
