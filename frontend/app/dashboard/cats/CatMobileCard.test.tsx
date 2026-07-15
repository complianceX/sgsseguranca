import { fireEvent, render, screen } from '@testing-library/react';
import { CatMobileCard } from './CatMobileCard';
import type { CatRecord } from '@/services/catsService';

const cat = {
  id: 'cat-1',
  numero: 'CAT-2026-1',
  status: 'aberta',
  data_ocorrencia: '2026-07-15T10:00:00Z',
  attachments: [{ id: 'attachment-1', file_name: 'evidencia.pdf' }],
} as CatRecord;

const callbacks = {
  onOpenAttachment: jest.fn(),
  onUploadAttachment: jest.fn(),
  onLocalPdf: jest.fn(),
  onGovernedPdf: jest.fn(),
  onEmail: jest.fn(),
  onEdit: jest.fn(),
  onInvestigate: jest.fn(),
  onClose: jest.fn(),
};

describe('CatMobileCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('permite visualizar e enviar anexos e emitir o PDF governado no mobile', () => {
    render(<CatMobileCard cat={cat} location="Obra A" canManage {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'evidencia.pdf' }));
    expect(callbacks.onOpenAttachment).toHaveBeenCalledWith('cat-1', 'attachment-1');

    const file = new File(['pdf'], 'novo.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Selecionar anexo da CAT CAT-2026-1'), { target: { files: [file] } });
    expect(callbacks.onUploadAttachment).toHaveBeenCalledWith('cat-1', file);

    fireEvent.click(screen.getByRole('button', { name: 'Emitir final' }));
    expect(callbacks.onGovernedPdf).toHaveBeenCalledWith(cat);
  });

  it('mantém o PDF final existente acessível em modo somente leitura', () => {
    render(<CatMobileCard cat={{ ...cat, pdf_file_key: 'governed-key' }} location="Obra A" canManage={false} {...callbacks} />);
    expect(screen.queryByRole('button', { name: 'Anexar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF final' }));
    expect(callbacks.onGovernedPdf).toHaveBeenCalled();
  });
});
