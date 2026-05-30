import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DocumentBundleService } from '../common/services/document-bundle.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentRegistryEntry } from './entities/document-registry.entity';
import { DocumentRegistryVersionEntry } from './entities/document-registry-version.entity';
import { DocumentRegistryService } from './document-registry.service';

describe('DocumentRegistryService versioning', () => {
  let service: DocumentRegistryService;
  let registryRepository: jest.Mocked<Repository<DocumentRegistryEntry>>;
  let versionRepository: jest.Mocked<Repository<DocumentRegistryVersionEntry>>;
  let registryVersionRepositoryFromManager: jest.Mocked<
    Repository<DocumentRegistryVersionEntry>
  >;
  let saveVersionFromManagerMock: jest.Mock<
    Promise<DocumentRegistryVersionEntry>,
    [unknown]
  >;
  let manager: {
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    registryRepository = {
      manager: {} as Repository<DocumentRegistryEntry>['manager'],
      findOne: jest.fn(),
      create: jest.fn((payload) => payload as DocumentRegistryEntry),
      save: jest.fn((payload) =>
        Promise.resolve(payload as DocumentRegistryEntry),
      ),
    } as unknown as jest.Mocked<Repository<DocumentRegistryEntry>>;

    saveVersionFromManagerMock = jest.fn((payload: unknown) =>
      Promise.resolve(payload as DocumentRegistryVersionEntry),
    );

    registryVersionRepositoryFromManager = {
      findOne: jest.fn(),
      create: jest.fn(
        (payload) => payload as unknown as DocumentRegistryVersionEntry,
      ),
      save: saveVersionFromManagerMock,
    } as unknown as jest.Mocked<Repository<DocumentRegistryVersionEntry>>;

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === DocumentRegistryEntry) return registryRepository;
        return registryVersionRepositoryFromManager;
      }),
    };

    versionRepository = {
      findOne: jest.fn(),
      create: jest.fn((payload) => payload as DocumentRegistryVersionEntry),
      save: jest.fn((payload) =>
        Promise.resolve(payload as DocumentRegistryVersionEntry),
      ),
    } as unknown as jest.Mocked<Repository<DocumentRegistryVersionEntry>>;

    service = new DocumentRegistryService(
      registryRepository,
      versionRepository,
      {} as DataSource,
      {
        getTenantId: jest.fn(),
        getContext: jest.fn().mockReturnValue(undefined),
      } as unknown as TenantService,
      {
        buildWeeklyPdfBundle: jest.fn(),
      } as unknown as DocumentBundleService,
      {
        getSignedUrl: jest.fn(),
      } as unknown as DocumentStorageService,
    );
  });

  it('bloqueia overwrite silencioso de documento finalizado', async () => {
    registryRepository.findOne.mockResolvedValue({
      id: 'registry-1',
      finalized_at: new Date(),
    } as DocumentRegistryEntry);

    await expect(
      service.upsertWithManager(manager as never, {
        companyId: '11111111-1111-4111-8111-111111111111',
        module: 'apr',
        entityId: '22222222-2222-4222-8222-222222222222',
        title: 'APR Final',
        fileKey: 'documents/company/apr/final.pdf',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('gera nova versão append-only ao atualizar entrada existente', async () => {
    registryRepository.findOne.mockResolvedValue({
      id: 'registry-1',
      company_id: '11111111-1111-4111-8111-111111111111',
      module: 'apr',
      entity_id: '22222222-2222-4222-8222-222222222222',
      document_type: 'pdf',
      created_by: '33333333-3333-4333-8333-333333333333',
      file_hash: 'old-hash',
      status: 'ACTIVE',
      finalized_at: null,
      signed_at: null,
      iso_year: 2026,
      iso_week: 20,
      file_key: 'documents/old.pdf',
      title: 'Old title',
      document_date: new Date('2026-05-01T00:00:00.000Z'),
      expires_at: null,
    } as unknown as DocumentRegistryEntry);

    registryVersionRepositoryFromManager.findOne.mockResolvedValue({
      id: 'ver-1',
      version: 1,
    } as DocumentRegistryVersionEntry);

    await service.upsertWithManager(manager as never, {
      companyId: '11111111-1111-4111-8111-111111111111',
      module: 'apr',
      entityId: '22222222-2222-4222-8222-222222222222',
      title: 'APR Retificada',
      fileKey: 'documents/new.pdf',
      fileHash: 'new-hash',
      documentType: 'pdf',
      createdBy: '33333333-3333-4333-8333-333333333333',
    });

    expect(saveVersionFromManagerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: '22222222-2222-4222-8222-222222222222',
        document_type: 'pdf',
        version: 2,
        supersedes_id: 'ver-1',
        hash: 'new-hash',
      }),
    );
  });
});
