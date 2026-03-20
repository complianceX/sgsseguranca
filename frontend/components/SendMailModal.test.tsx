import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendMailModal } from './SendMailModal';

const sendStoredDocumentMock = jest.fn();
const sendUploadedDocumentMock = jest.fn();

jest.mock('@/services/mailService', () => ({
  mailService: {
    sendStoredDocument: (...args: unknown[]) => sendStoredDocumentMock(...args),
    sendUploadedDocument: (...args: unknown[]) =>
      sendUploadedDocumentMock(...args),
  },
}));

describe('SendMailModal', () => {
  beforeEach(() => {
    sendStoredDocumentMock.mockReset();
    sendUploadedDocumentMock.mockReset();
  });

  it('usa o fluxo de documento armazenado quando o PDF final governado existe', async () => {
    sendStoredDocumentMock.mockResolvedValue({
      success: true,
      message: 'Documento final governado enviado.',
      deliveryMode: 'queued',
      artifactType: 'governed_final_pdf',
      isOfficial: true,
      fallbackUsed: false,
    });

    render(
      <SendMailModal
        isOpen
        onClose={jest.fn()}
        documentName="Checklist Final"
        filename="checklist-final.pdf"
        storedDocument={{ documentId: 'checklist-1', documentType: 'CHECKLIST' }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/e-mail.*destino/i), {
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
    expect(sendUploadedDocumentMock).not.toHaveBeenCalled();
  });

  it('mantem o fluxo legado de upload quando recebe base64', async () => {
    sendUploadedDocumentMock.mockResolvedValue({
      success: true,
      message:
        'O PDF local foi enviado por e-mail. Este envio não substitui o documento final governado.',
      deliveryMode: 'queued',
      artifactType: 'local_uploaded_pdf',
      isOfficial: false,
      fallbackUsed: true,
    });

    render(
      <SendMailModal
        isOpen
        onClose={jest.fn()}
        documentName="Checklist Preview"
        filename="checklist-preview.pdf"
        base64="JVBERi0x"
      />,
    );

    fireEvent.change(screen.getByLabelText(/e-mail.*destino/i), {
      target: { value: 'preview@empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => {
      expect(sendUploadedDocumentMock).toHaveBeenCalledWith(
        expect.any(Blob),
        'checklist-preview.pdf',
        'preview@empresa.com',
        'Checklist Preview',
      );
    });
    expect(sendStoredDocumentMock).not.toHaveBeenCalled();
  });
});
