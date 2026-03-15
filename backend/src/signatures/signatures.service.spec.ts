import { Repository } from 'typeorm';
import { SignaturesService } from './signatures.service';
import { Signature } from './entities/signature.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';

describe('SignaturesService', () => {
  let service: SignaturesService;
  let repository: {
    create: jest.Mock<Signature, [Partial<Signature>]>;
    save: jest.Mock<Promise<Signature>, [Signature]>;
  };
  let tenantService: Pick<TenantService, 'getTenantId'>;
  let signatureTimestampService: Pick<
    SignatureTimestampService,
    'issueFromRaw'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'findRegistryContextForSignature'
  >;

  beforeEach(() => {
    repository = {
      create: jest.fn((input: Partial<Signature>) => input as Signature),
      save: jest.fn((input: Signature) => Promise.resolve(input)),
    };
    tenantService = {
      getTenantId: jest.fn(() => 'company-1'),
    };
    signatureTimestampService = {
      issueFromRaw: jest.fn(() => ({
        signature_hash: 'signature-hash',
        timestamp_token: 'timestamp-token',
        timestamp_authority: 'tsa',
        timestamp_issued_at: '2026-03-14T18:00:00.000Z',
      })),
    };
    documentGovernanceService = {
      findRegistryContextForSignature: jest.fn(),
    };

    service = new SignaturesService(
      repository as unknown as Repository<Signature>,
      tenantService as TenantService,
      signatureTimestampService as SignatureTimestampService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  it('enriquece o payload de integridade com contexto do documento governado', async () => {
    const registryContext = {
      registryEntryId: 'registry-1',
      documentCode: 'CHECKLIST-2026-11-ABCD1234',
      fileHash: 'known-file-hash',
      fileKey: 'documents/company-1/checklists/doc.pdf',
      module: 'checklist',
    } as const;
    (
      documentGovernanceService.findRegistryContextForSignature as jest.Mock
    ).mockResolvedValue(registryContext);

    await service.create(
      {
        document_id: 'checklist-1',
        document_type: 'CHECKLIST',
        signature_data: 'base64-signature',
        type: 'digital',
      },
      'user-1',
    );

    const [createdInput] = repository.create.mock.calls[0];

    expect(createdInput.company_id).toBe('company-1');
    expect(createdInput.integrity_payload?.document_id).toBe('checklist-1');
    expect(createdInput.integrity_payload?.document_registry).toEqual({
      entry_id: 'registry-1',
      module: 'checklist',
      document_code: 'CHECKLIST-2026-11-ABCD1234',
      file_hash: 'known-file-hash',
      file_key: 'documents/company-1/checklists/doc.pdf',
    });
  });

  it('mantem o enrichment de assinatura para módulos adicionais migrados pela esteira', async () => {
    (
      documentGovernanceService.findRegistryContextForSignature as jest.Mock
    ).mockResolvedValue({
      registryEntryId: 'registry-audit',
      documentCode: 'AUDIT-2026-11-XYZ98765',
      fileHash: 'audit-file-hash',
      fileKey: 'documents/company-1/audits/doc.pdf',
      module: 'audit',
    });

    await service.create(
      {
        document_id: 'audit-1',
        document_type: 'AUDITORIA',
        signature_data: 'base64-signature',
        type: 'digital',
      },
      'user-1',
    );

    const [createdInput] = repository.create.mock.calls[0];

    expect(createdInput.integrity_payload?.document_registry).toEqual({
      entry_id: 'registry-audit',
      module: 'audit',
      document_code: 'AUDIT-2026-11-XYZ98765',
      file_hash: 'audit-file-hash',
      file_key: 'documents/company-1/audits/doc.pdf',
    });
  });

  it('enriquece assinatura com contexto de APR governada', async () => {
    (
      documentGovernanceService.findRegistryContextForSignature as jest.Mock
    ).mockResolvedValue({
      registryEntryId: 'registry-apr',
      documentCode: 'APR-2026-11-APR12345',
      fileHash: 'apr-file-hash',
      fileKey: 'documents/company-1/aprs/doc.pdf',
      module: 'apr',
    });

    await service.create(
      {
        document_id: 'apr-1',
        document_type: 'APR',
        signature_data: 'base64-signature',
        type: 'digital',
      },
      'user-1',
    );

    const [createdInput] = repository.create.mock.calls[0];

    expect(createdInput.integrity_payload?.document_registry).toEqual({
      entry_id: 'registry-apr',
      module: 'apr',
      document_code: 'APR-2026-11-APR12345',
      file_hash: 'apr-file-hash',
      file_key: 'documents/company-1/aprs/doc.pdf',
    });
  });

  it('enriquece assinatura com contexto de DDS governado', async () => {
    (
      documentGovernanceService.findRegistryContextForSignature as jest.Mock
    ).mockResolvedValue({
      registryEntryId: 'registry-dds',
      documentCode: 'DDS-2026-11-DDS12345',
      fileHash: 'dds-file-hash',
      fileKey: 'documents/company-1/dds/doc.pdf',
      module: 'dds',
    });

    await service.create(
      {
        document_id: 'dds-1',
        document_type: 'DDS',
        signature_data: 'base64-signature',
        type: 'digital',
      },
      'user-1',
    );

    const [createdInput] = repository.create.mock.calls[0];

    expect(createdInput.integrity_payload?.document_registry).toEqual({
      entry_id: 'registry-dds',
      module: 'dds',
      document_code: 'DDS-2026-11-DDS12345',
      file_hash: 'dds-file-hash',
      file_key: 'documents/company-1/dds/doc.pdf',
    });
  });

  it('enriquece assinatura com contexto de PT governada', async () => {
    (
      documentGovernanceService.findRegistryContextForSignature as jest.Mock
    ).mockResolvedValue({
      registryEntryId: 'registry-pt',
      documentCode: 'PT-2026-11-PT12345',
      fileHash: 'pt-file-hash',
      fileKey: 'documents/company-1/pts/doc.pdf',
      module: 'pt',
    });

    await service.create(
      {
        document_id: 'pt-1',
        document_type: 'PT',
        signature_data: 'base64-signature',
        type: 'digital',
      },
      'user-1',
    );

    const [createdInput] = repository.create.mock.calls[0];

    expect(createdInput.integrity_payload?.document_registry).toEqual({
      entry_id: 'registry-pt',
      module: 'pt',
      document_code: 'PT-2026-11-PT12345',
      file_hash: 'pt-file-hash',
      file_key: 'documents/company-1/pts/doc.pdf',
    });
  });
});
