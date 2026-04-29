/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { ArrsService } from './arrs.service';
import { Arr, ArrStatus } from './entities/arr.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];

describe('ArrsService', () => {
  let service: ArrsService;
  let arrRepository: jest.Mocked<Repository<Arr>>;
  let tenantService: Partial<TenantService>;
  let documentStorageService: Partial<DocumentStorageService>;
  let documentGovernanceService: Partial<DocumentGovernanceService>;

  beforeEach(() => {
    arrRepository = {
      findOne: jest.fn(),
      save: jest.fn((input: Arr) => Promise.resolve(input)),
      create: jest.fn((input: Partial<Arr>) => input),
    } as unknown as jest.Mocked<Repository<Arr>>;

    tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    };

    documentStorageService = {
      generateDocumentKey: jest.fn(
        (companyId: string, module: string, entityId: string) =>
          `documents/${companyId}/${module}/${entityId}/arr-final.pdf`,
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://signed.example/arr.pdf'),
      ),
    };

    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new ArrsService(
      arrRepository as unknown as Repository<Arr>,
      tenantService as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  it('rejeita company_id forjado no payload ao criar ARR', async () => {
    await expect(
      service.create({
        titulo: 'ARR trabalho em altura',
        data: '2026-04-15',
        atividade_principal: 'Montagem de linha de vida',
        condicao_observada: 'Acesso em área elevada com múltiplas frentes.',
        risco_identificado: 'Queda de nível e queda de materiais.',
        nivel_risco: 'alto',
        probabilidade: 'media',
        severidade: 'grave',
        controles_imediatos: 'Ancoragem dupla, isolamento e APR diária.',
        site_id: '11111111-1111-4111-8111-111111111111',
        responsavel_id: '22222222-2222-4222-8222-222222222222',
        participants: ['33333333-3333-4333-8333-333333333333'],
        company_id: 'tenant-forjado',
      } as never),
    ).rejects.toThrow(BadRequestException);

    expect(arrRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita participante fora da obra selecionada ao criar ARR', async () => {
    const siteRepository = {
      findOne: jest.fn(() => Promise.resolve({ id: 'site-1' })),
    };
    const userRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'responsavel-1' }])
        .mockResolvedValueOnce([]),
    };
    (
      arrRepository as unknown as {
        manager: { getRepository: jest.Mock };
      }
    ).manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(siteRepository)
        .mockReturnValueOnce(userRepository)
        .mockReturnValueOnce(userRepository),
    };

    await expect(
      service.create({
        titulo: 'ARR trabalho em altura',
        data: '2026-04-15',
        atividade_principal: 'Montagem de linha de vida',
        condicao_observada: 'Acesso em área elevada com múltiplas frentes.',
        risco_identificado: 'Queda de nível e queda de materiais.',
        nivel_risco: 'alto',
        probabilidade: 'media',
        severidade: 'grave',
        controles_imediatos: 'Ancoragem dupla, isolamento e APR diária.',
        site_id: 'site-1',
        responsavel_id: 'responsavel-1',
        participants: ['participante-outra-obra'],
      }),
    ).rejects.toThrow(
      'Participantes informado(s) não pertencem à obra/setor selecionada do documento.',
    );

    expect(arrRepository.save).not.toHaveBeenCalled();
  });

  it('permite participante company-scoped ao criar ARR', async () => {
    const siteRepository = {
      findOne: jest.fn(() => Promise.resolve({ id: 'site-1' })),
    };
    const userRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'responsavel-1' }])
        .mockResolvedValueOnce([{ id: 'participante-company-scoped' }]),
    };
    (
      arrRepository as unknown as {
        manager: { getRepository: jest.Mock };
      }
    ).manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(siteRepository)
        .mockReturnValueOnce(userRepository)
        .mockReturnValueOnce(userRepository),
    };

    await expect(
      service.create({
        titulo: 'ARR trabalho em altura',
        data: '2026-04-15',
        atividade_principal: 'Montagem de linha de vida',
        condicao_observada: 'Acesso em área elevada com múltiplas frentes.',
        risco_identificado: 'Queda de nível e queda de materiais.',
        nivel_risco: 'alto',
        probabilidade: 'media',
        severidade: 'grave',
        controles_imediatos: 'Ancoragem dupla, isolamento e APR diária.',
        site_id: 'site-1',
        responsavel_id: 'responsavel-1',
        participants: ['participante-company-scoped'],
      }),
    ).resolves.toBeTruthy();

    expect(arrRepository.save).toHaveBeenCalled();
  });

  it('emite PDF final de ARR com createdBy e persiste metadados locais de governança', async () => {
    arrRepository.findOne.mockResolvedValue({
      id: 'arr-1',
      titulo: 'ARR Trabalho em Altura',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      status: ArrStatus.ANALISADA,
      data: new Date('2026-04-15'),
      created_at: new Date('2026-04-15T07:00:00.000Z'),
      participants: [{ id: 'participant-1' }],
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
      document_code: null,
      final_pdf_hash_sha256: null,
      pdf_generated_at: null,
      emitted_by_user_id: null,
    } as unknown as Arr);

    const capturedUpdates: Array<Record<string, unknown>> = [];
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      const update = jest.fn().mockImplementation((_id, payload) => {
        capturedUpdates.push(payload as Record<string, unknown>);
        return { affected: 1 };
      });
      const manager = {
        getRepository: jest.fn(() => ({ update })),
      } as unknown as EntityManager;
      await input.persistEntityMetadata?.(manager, 'hash-arr-1');
      return {
        hash: 'hash-arr-1',
        registryEntry: { id: 'registry-arr-1' },
      };
    });

    const file = {
      originalname: 'arr-1.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-arr-1'),
    } as Express.Multer.File;

    const result = await service.attachPdf('arr-1', file, {
      userId: 'emitter-1',
    });

    expect(result.degraded).toBe(false);
    expect(documentStorageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'arr',
        entityId: 'arr-1',
        createdBy: 'emitter-1',
        documentCode: 'ARR-2026-ARR1',
      }),
    );
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0]).toEqual(
      expect.objectContaining({
        pdf_file_key: 'documents/company-1/arr/arr-1/arr-final.pdf',
        pdf_folder_path: 'arr/company-1',
        pdf_original_name: 'arr-1.pdf',
        document_code: 'ARR-2026-ARR1',
        final_pdf_hash_sha256: 'hash-arr-1',
        emitted_by_user_id: 'emitter-1',
        status: ArrStatus.TRATADA,
      }),
    );
    expect(capturedUpdates[0].pdf_generated_at).toBeInstanceOf(Date);
  });

  it('bloqueia emissao final quando a ARR ainda esta em rascunho', async () => {
    arrRepository.findOne.mockResolvedValue({
      id: 'arr-rascunho',
      titulo: 'ARR rascunho',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      status: ArrStatus.RASCUNHO,
      data: new Date('2026-04-15'),
      created_at: new Date('2026-04-15T07:00:00.000Z'),
      participants: [{ id: 'participant-1' }],
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
    } as unknown as Arr);

    const file = {
      originalname: 'arr-rascunho.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-arr-rascunho'),
    } as Express.Multer.File;

    await expect(service.attachPdf('arr-rascunho', file)).rejects.toThrow(
      BadRequestException,
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
  });

  it('retorna not_emitted quando a ARR ainda nao possui PDF final', async () => {
    arrRepository.findOne.mockResolvedValue({
      id: 'arr-sem-pdf',
      titulo: 'ARR sem PDF',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      status: ArrStatus.ANALISADA,
      data: new Date('2026-04-15'),
      created_at: new Date('2026-04-15T07:00:00.000Z'),
      participants: [{ id: 'participant-1' }],
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
    } as unknown as Arr);

    await expect(service.getPdfAccess('arr-sem-pdf')).resolves.toEqual({
      entityId: 'arr-sem-pdf',
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'A Análise de Risco Rápida ainda não possui PDF final emitido.',
      degraded: false,
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
    });
  });

  it('retorna acesso degradado quando a URL assinada nao pode ser gerada', async () => {
    arrRepository.findOne.mockResolvedValue({
      id: 'arr-pdf',
      titulo: 'ARR com PDF',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      status: ArrStatus.TRATADA,
      data: new Date('2026-04-15'),
      created_at: new Date('2026-04-15T07:00:00.000Z'),
      participants: [{ id: 'participant-1' }],
      pdf_file_key: 'documents/company-1/arr/arr-pdf/arr-final.pdf',
      pdf_folder_path: 'arr/company-1',
      pdf_original_name: 'arr-final.pdf',
    } as unknown as Arr);
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValueOnce(
      new Error('signed-url-unavailable'),
    );

    await expect(service.getPdfAccess('arr-pdf')).resolves.toEqual({
      entityId: 'arr-pdf',
      hasFinalPdf: true,
      availability: 'registered_without_signed_url',
      message:
        'PDF final registrado, mas a URL segura não está disponível no momento.',
      degraded: true,
      fileKey: 'documents/company-1/arr/arr-pdf/arr-final.pdf',
      folderPath: 'arr/company-1',
      originalName: 'arr-final.pdf',
      url: null,
    });
  });
});
