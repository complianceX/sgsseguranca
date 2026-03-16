import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendMailModal } from './SendMailModal';

const postMock = jest.fn();
const sendStoredDocumentMock = jest.fn();

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

jest.mock('@/services/mailService', () => ({
  mailService: {
    sendStoredDocument: (...args: unknown[]) => sendStoredDocumentMock(...args),
  },
}));

describe('SendMailModal', () => {
  beforeEach(() => {
    postMock.mockReset();
    sendStoredDocumentMock.mockReset();
  });

  it('usa o fluxo de documento armazenado quando o PDF final governado existe', async () => {
    sendStoredDocumentMock.mockResolvedValue({});

    render(
      <SendMailModal
        isOpen
        onClose={jest.fn()}
        documentName="Checklist Final"
        filename="checklist-final.pdf"
        storedDocument={{ documentId: 'checklist-1', documentType: 'CHECKLIST' }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/e-mail de destino/i), {
      target: { value: 'cliente@empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(sendStoredDocumentMock).toHaveBeenCalledWith(
        'checklist-1',
        'CHECKLIST',
        'cliente@empresa.com',
      );
    });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('mantem o fluxo legado de upload quando recebe base64', async () => {
    postMock.mockResolvedValue({});

    render(
      <SendMailModal
        isOpen
        onClose={jest.fn()}
        documentName="Checklist Preview"
        filename="checklist-preview.pdf"
        base64="JVBERi0x"
      />,
    );

    fireEvent.change(screen.getByLabelText(/e-mail de destino/i), {
      target: { value: 'preview@empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/mail/send-uploaded-document',
        expect.any(FormData),
      );
    });
    expect(sendStoredDocumentMock).not.toHaveBeenCalled();
  });
});
