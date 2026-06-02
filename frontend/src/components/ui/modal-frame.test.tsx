import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import {
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from './modal-frame';

interface ModalHarnessProps {
  description?: string | null;
  withCloseButton?: boolean;
}

function ModalHarness({
  description = 'Detalhes do modal para tecnologias assistivas.',
  withCloseButton = false,
}: ModalHarnessProps) {
  const [isOpen, setIsOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Abrir modal
      </button>
      <button type="button">Botao atras do overlay</button>

      <ModalFrame
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialFocusRef={initialFocusRef}
      >
        <ModalHeader
          title="Titulo do modal"
          description={description ?? undefined}
          onClose={withCloseButton ? () => setIsOpen(false) : undefined}
        />
        <ModalBody className="space-y-2">
          <button ref={initialFocusRef} type="button">
            Primeira acao
          </button>
          <button type="button">Segunda acao</button>
        </ModalBody>
        <ModalFooter>
          <button type="button">Ultima acao</button>
        </ModalFooter>
      </ModalFrame>
    </div>
  );
}

describe('ModalFrame', () => {
  it('abre o modal com semantica acessivel e descricao ligada ao dialogo', async () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = await screen.findByRole('dialog', { name: 'Titulo do modal' });
    const labelledById = dialog.getAttribute('aria-labelledby');
    const describedById = dialog.getAttribute('aria-describedby');
    const title = labelledById ? document.getElementById(labelledById) : null;
    const description = describedById
      ? document.getElementById(describedById)
      : null;

    await waitFor(() => {
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(title).toHaveTextContent('Titulo do modal');
      expect(description).toHaveTextContent(
        'Detalhes do modal para tecnologias assistivas.',
      );
      expect(dialog).toHaveAttribute('aria-labelledby', title?.id);
      expect(dialog).toHaveAttribute('aria-describedby', description?.id);
    });
  });

  it('nao deixa Tab vazar para fora do modal', async () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const firstAction = await screen.findByRole('button', { name: 'Primeira acao' });
    const lastAction = screen.getByRole('button', { name: 'Ultima acao' });
    const outsideButton = screen.getByText('Botao atras do overlay');

    await waitFor(() => {
      expect(firstAction).toHaveFocus();
    });

    lastAction.focus();
    fireEvent.keyDown(lastAction, { key: 'Tab', bubbles: true });

    await waitFor(() => {
      expect(firstAction).toHaveFocus();
    });
    expect(outsideButton).not.toHaveFocus();
  });

  it('faz Shift+Tab no primeiro foco voltar para o ultimo foco interno', async () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const firstAction = await screen.findByRole('button', { name: 'Primeira acao' });
    const lastAction = screen.getByRole('button', { name: 'Ultima acao' });

    await waitFor(() => {
      expect(firstAction).toHaveFocus();
    });

    fireEvent.keyDown(firstAction, {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });

    await waitFor(() => {
      expect(lastAction).toHaveFocus();
    });
  });

  it('fecha com Escape e devolve o foco ao gatilho', async () => {
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Abrir modal' });
    trigger.focus();
    fireEvent.click(trigger);

    const firstAction = await screen.findByRole('button', { name: 'Primeira acao' });

    await waitFor(() => {
      expect(firstAction).toHaveFocus();
    });

    fireEvent.keyDown(firstAction, { key: 'Escape', bubbles: true });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('renderiza sem aria-describedby quando nao ha descricao', async () => {
    render(<ModalHarness description={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = await screen.findByRole('dialog', { name: 'Titulo do modal' });

    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).not.toHaveAttribute('aria-describedby');
  });

  it('continua fechando pelo botao de close quando o header e closable', async () => {
    render(<ModalHarness withCloseButton />);

    const trigger = screen.getByRole('button', { name: 'Abrir modal' });
    trigger.focus();
    fireEvent.click(trigger);

    const closeButton = await screen.findByRole('button', {
      name: 'Fechar modal',
    });

    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});
