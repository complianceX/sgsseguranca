import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import DocumentImportPage from './page';
import { isAllowedImportFile } from './importFileValidation';

const importDocument = jest.fn();
const getImportStatus = jest.fn();
const useAuth = jest.fn();
const searchParamsGet = jest.fn(() => null);

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: searchParamsGet,
  }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

jest.mock('@/services/documentImportService', () => ({
  documentImportService: {
    importDocument: (...args: unknown[]) => importDocument(...args),
    getImportStatus: (...args: unknown[]) => getImportStatus(...args),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}));

function makeFile(name: string, type: string) {
  return new File(['conteudo'], name, { type });
}

function makeQueuedResponse() {
  return {
    success: true,
    queued: true,
    documentId: '11111111-1111-4111-8111-111111111111',
    status: 'QUEUED',
    statusUrl: '/documents/import/11111111-1111-4111-8111-111111111111/status',
    reused: false,
    replayState: 'new',
    message: 'Documento recebido e enviado para processamento assíncrono.',
    job: {
      jobId: 'job-1',
      queueState: 'waiting',
      attemptsMade: 0,
      maxAttempts: 3,
      deadLettered: false,
    },
  };
}

function makeStatusResponse(status: 'COMPLETED' | 'FAILED' | 'DEAD_LETTER') {
  return {
    success: true,
    documentId: '11111111-1111-4111-8111-111111111111',
    status,
    completed: status === 'COMPLETED',
    failed: status !== 'COMPLETED',
    statusUrl: '/documents/import/11111111-1111-4111-8111-111111111111/status',
    message:
      status === 'COMPLETED'
        ? 'Documento processado com sucesso.'
        : 'A importação falhou.',
    tipoDocumentoDescricao: 'APR',
    analysis: {
      empresa: 'Empresa Demo',
      cnpj: '00.000.000/0001-00',
      data: null,
      responsavelTecnico: 'TST Demo',
      riscos: [],
      epis: [],
      nrsCitadas: [],
    },
    validation: {
      status: 'VALIDO',
      pendencias: [],
      scoreConfianca: 0.95,
    },
    job: {
      jobId: 'job-1',
      queueState: status === 'COMPLETED' ? 'completed' : 'failed',
      attemptsMade: 1,
      maxAttempts: 3,
      deadLettered: status === 'DEAD_LETTER',
    },
  };
}

async function selectAndUpload(file: File) {
  render(<DocumentImportPage />);
  const input = screen.getByLabelText('Upload de documento SST');

  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(
    await screen.findByRole('button', { name: /enviar para fila/i }),
  );
}

describe('DocumentImportPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useAuth.mockReturnValue({
      user: { company_id: 'company-1' },
      hasPermission: jest.fn(() => true),
    });
    searchParamsGet.mockReturnValue(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('aceita formatos suportados por MIME e extensão', () => {
    expect(isAllowedImportFile(makeFile('apr.pdf', 'application/pdf'))).toBe(
      true,
    );
    expect(
      isAllowedImportFile(
        makeFile(
          'procedimento.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe(true);
    expect(
      isAllowedImportFile(
        makeFile(
          'matriz.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ),
      ),
    ).toBe(true);
    expect(isAllowedImportFile(makeFile('foto.jpg', 'image/jpeg'))).toBe(true);
    expect(isAllowedImportFile(makeFile('foto.png', 'image/png'))).toBe(true);
    expect(isAllowedImportFile(makeFile('foto.webp', 'image/webp'))).toBe(true);
    expect(isAllowedImportFile(makeFile('observacao.txt', 'text/plain'))).toBe(
      true,
    );
    expect(isAllowedImportFile(makeFile('dados.csv', ''))).toBe(true);
  });

  it('bloqueia extensão não permitida', () => {
    expect(isAllowedImportFile(makeFile('payload.exe', ''))).toBe(false);
  });

  it('envia DOCX selecionado e passa AbortSignal para o polling', async () => {
    importDocument.mockResolvedValue(makeQueuedResponse());
    getImportStatus.mockResolvedValue(makeStatusResponse('COMPLETED'));

    await selectAndUpload(
      makeFile(
        'procedimento.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    );

    await waitFor(() => {
      expect(importDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ name: 'procedimento.docx' }),
          empresaId: 'company-1',
        }),
      );
    });
    await waitFor(() => {
      expect(getImportStatus).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        expect.any(AbortSignal),
      );
    });
  });

  it('aborta o polling ao desmontar para evitar setState tardio', async () => {
    let capturedSignal: AbortSignal | undefined;
    importDocument.mockResolvedValue(makeQueuedResponse());
    getImportStatus.mockImplementation(
      (_documentId: string, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => undefined);
      },
    );

    render(<DocumentImportPage />);
    fireEvent.change(screen.getByLabelText('Upload de documento SST'), {
      target: { files: [makeFile('apr.pdf', 'application/pdf')] },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: /enviar para fila/i }),
    );

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    act(() => {
      screen.getByText('Importar outro arquivo').closest('button')?.click();
    });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it.each(['COMPLETED', 'FAILED', 'DEAD_LETTER'] as const)(
    'para o polling quando status é %s',
    async (terminalStatus) => {
      importDocument.mockResolvedValue(makeQueuedResponse());
      getImportStatus.mockResolvedValue(makeStatusResponse(terminalStatus));

      await selectAndUpload(makeFile('apr.pdf', 'application/pdf'));

      await waitFor(() => {
        expect(getImportStatus).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(7500);
      });

      expect(getImportStatus).toHaveBeenCalledTimes(1);
    },
  );
});
