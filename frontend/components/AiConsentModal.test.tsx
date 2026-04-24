import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiConsentModal } from './AiConsentModal';

const updateAiConsentMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock('@/services/consentsService', () => ({
  consentsService: {
    accept: (...args: unknown[]) => updateAiConsentMock(...args),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe('AiConsentModal', () => {
  beforeEach(() => {
    updateAiConsentMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('renderiza como diálogo acessível e exige confirmação explícita', () => {
    const onAccept = jest.fn();
    const onDismiss = jest.fn();

    render(<AiConsentModal onAccept={onAccept} onDismiss={onDismiss} />);

    expect(screen.getByRole('dialog', { name: /consentimento para uso da ia/i })).toBeInTheDocument();

    const acceptButton = screen.getByRole('button', { name: /aceitar e continuar/i });
    expect(acceptButton).toBeDisabled();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(acceptButton).toBeEnabled();
  });

  it('salva consentimento ao aceitar e chama callback de sucesso', async () => {
    updateAiConsentMock.mockResolvedValueOnce(undefined);

    const onAccept = jest.fn();
    const onDismiss = jest.fn();

    render(<AiConsentModal onAccept={onAccept} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /aceitar e continuar/i }));

    await waitFor(() => {
      expect(updateAiConsentMock).toHaveBeenCalledWith('ai_processing');
      expect(onAccept).toHaveBeenCalledTimes(1);
      expect(toastErrorMock).not.toHaveBeenCalled();
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('mostra erro quando falha ao salvar consentimento', async () => {
    updateAiConsentMock.mockRejectedValueOnce(new Error('falha de rede'));

    const onAccept = jest.fn();

    render(<AiConsentModal onAccept={onAccept} onDismiss={jest.fn()} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /aceitar e continuar/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Não foi possível salvar o consentimento. Tente novamente.');
    });

    expect(onAccept).not.toHaveBeenCalled();
  });
});
