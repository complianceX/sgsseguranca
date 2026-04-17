import { Repository } from 'typeorm';
import { SignaturesService } from './signatures.service';
import { Signature } from './entities/signature.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { UsersService } from '../users/users.service';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import type { AppendForensicTrailEventInput } from '../forensic-trail/forensic-trail.service';
import type { DataSource } from 'typeorm';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import {
  SIGNATURE_PROOF_SCOPES,
  SIGNATURE_VERIFICATION_MODES,
} from './signature-proof.util';

describe('SignaturesService', () => {
  let service: SignaturesService;
  const savedEntities: Signature[] = [];

  const transactionalRepository = {
    create: jest.fn((input: Signature) => input),
    save: jest.fn((input: Signature) => {
      savedEntities.push(input);
      return Promise.resolve(input);
    }),
    delete: jest.fn(() => Promise.resolve(undefined)),
  };

  const repository = {
    create: jest.fn((input: Signature) => input),
    save: jest.fn((input: Signature) => Promise.resolve(input)),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    manager: {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        Promise.resolve(
          callback({
            query: jest.fn(() => Promise.resolve()),
            getRepository: jest.fn(() => transactionalRepository),
          }),
        ),
      ),
    },
  };

  const signatureTimestampService = {
    issueFromHash: jest.fn(() => ({
      signature_hash: 'hash-1',
      timestamp_token: 'token-1',
      timestamp_authority: 'authority-1',
      timestamp_issued_at: '2026-03-16T12:00:00.000Z',
    })),
    verify: jest.fn(),
  };

  const documentGovernanceService = {
    findRegistryContextForSignature: jest.fn(() => Promise.resolve(null)),
  };

  const forensicTrailService = {
    append: jest.fn(() =>
      Promise.resolve({ id: 'trail-1' } as unknown as Awaited<
        ReturnType<ForensicTrailService['append']>
      >),
    ),
  };

  const usersService = {
    deriveHmacKey: jest.fn(() => Promise.resolve('derived-key')),
    computeHmac: jest.fn(() => 'computed-hmac'),
  };

  const aprRepository = {
    findOne: jest.fn().mockResolvedValue(null as Partial<Apr> | null),
  };
  const catRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(null as Record<string, unknown> | null),
  };
  const inspectionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(null as Record<string, unknown> | null),
  };

  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Apr) {
        return aprRepository;
      }

      if (entity === Dds) {
        return {
          findOne: jest.fn(() =>
            Promise.resolve({
              id: 'dds-1',
              company_id: 'company-1',
              tema: 'DDS diário',
              status: 'publicado',
              updated_at: new Date('2026-03-16T11:55:00.000Z'),
            }),
          ),
        };
      }

      if (entity === Cat) {
        return catRepository;
      }

      if (entity === Inspection) {
        return inspectionRepository;
      }

      return {
        findOne: jest.fn(() => Promise.resolve(null)),
      };
    }),
  };

  beforeEach(() => {
    savedEntities.length = 0;
    jest.clearAllMocks();
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      numero: 'APR-001',
      versao: 1,
      status: AprStatus.PENDENTE,
      pdf_file_key: null,
      updated_at: new Date('2026-03-16T11:55:00.000Z'),
    } as unknown as Partial<Apr>);
    catRepository.findOne.mockResolvedValue({
      id: 'cat-1',
      company_id: 'company-1',
      numero: 'CAT-001',
      status: 'aberta',
      pdf_file_key: null,
      updated_at: new Date('2026-03-16T11:55:00.000Z'),
    });
    inspectionRepository.findOne.mockResolvedValue({
      id: 'inspection-1',
      company_id: 'company-1',
      tipo_inspecao: 'Rotina',
      setor_area: 'Caldeiraria',
      updated_at: new Date('2026-03-16T11:55:00.000Z'),
    });

    const storageService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      downloadFileBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    service = new SignaturesService(
      repository as unknown as Repository<Signature>,
      dataSource as unknown as DataSource,
      { getTenantId: jest.fn(() => 'company-1') } as unknown as TenantService,
      signatureTimestampService as unknown as SignatureTimestampService,
      documentGovernanceService as unknown as DocumentGovernanceService,
      usersService as unknown as UsersService,
      forensicTrailService as unknown as ForensicTrailService,
      storageService as never,
    );
  });

  it('usa o participante como signatario efetivo ao substituir assinaturas do DDS', async () => {
    await service.replaceDocumentSignatures({
      document_id: 'dds-1',
      document_type: 'DDS',
      company_id: 'company-1',
      authenticated_user_id: 'operador-1',
      signatures: [
        {
          document_id: 'dds-1',
          document_type: 'DDS',
          user_id: 'participante-1',
          signer_user_id: 'participante-1',
          type: 'hmac',
          signature_data: 'HMAC_PENDING',
          pin: '1234',
        },
      ],
    });

    expect(usersService.deriveHmacKey).toHaveBeenCalledWith(
      'participante-1',
      '1234',
    );
    expect(usersService.computeHmac).toHaveBeenCalledWith(
      'derived-key',
      expect.stringContaining('participante-1'),
    );
    expect(transactionalRepository.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: 'dds-1',
        document_type: 'DDS',
      }),
    );
    const persistedSignature = savedEntities[0];

    expect(persistedSignature).toEqual(
      expect.objectContaining({
        user_id: 'participante-1',
        document_id: 'dds-1',
        document_type: 'DDS',
        signature_data: 'computed-hmac',
        type: 'hmac',
        signature_hash: 'hash-1',
        timestamp_token: 'token-1',
      }),
    );
    const integrityPayload = persistedSignature?.integrity_payload;
    if (!integrityPayload) {
      throw new Error('Expected persisted integrity payload');
    }
    const documentBinding = integrityPayload.document_binding as
      | Record<string, unknown>
      | undefined;
    if (!documentBinding) {
      throw new Error('Expected persisted document binding');
    }
    expect(integrityPayload.verification_mode).toBe(
      SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE,
    );
    expect(integrityPayload.proof_scope).toBe(
      SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
    );
    expect(integrityPayload.user_id).toBe('participante-1');
    expect(integrityPayload.captured_by_user_id).toBe('operador-1');
    expect(integrityPayload.hmac_verified).toBe(true);
    expect(integrityPayload.canonical_payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(integrityPayload.signature_evidence_hash).toEqual(
      expect.any(String),
    );
    expect(documentBinding.proof_scope).toBe(
      SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
    );
    expect(documentBinding.reference).toBe('DDS diário');
    expect(documentBinding.status).toBe('publicado');
    expect(signatureTimestampService.issueFromHash).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(String),
    );
    const appendCalls = (forensicTrailService.append as jest.Mock).mock
      .calls as Array<[AppendForensicTrailEventInput, { manager?: unknown }]>;
    const firstAppendCall = appendCalls[0];
    if (!firstAppendCall) {
      throw new Error('Expected forensic append call');
    }
    const [appendInput, appendOptions] = firstAppendCall;
    const appendMetadata = appendInput.metadata as Record<string, unknown>;
    expect(appendInput.eventType).toBe(FORENSIC_EVENT_TYPES.SIGNATURE_RECORDED);
    expect(appendInput.module).toBe('dds');
    expect(appendInput.entityId).toBe('dds-1');
    expect(appendInput.companyId).toBe('company-1');
    expect(appendInput.userId).toBe('participante-1');
    expect(appendMetadata.signatureType).toBe('hmac');
    expect(appendMetadata.documentType).toBe('DDS');
    expect(appendMetadata.signatureHash).toBe('hash-1');
    expect(appendMetadata.verificationMode).toBe(
      SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE,
    );
    expect(appendMetadata.proofScope).toBe(
      SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
    );
    expect(appendOptions.manager).toBeDefined();
  });

  it('vincula assinatura de inspeção ao contexto canônico server-side', async () => {
    await service.create(
      {
        document_id: 'inspection-1',
        document_type: 'Inspeção',
        user_id: 'user-1',
        signature_data: 'data:image/png;base64,BBBB',
        type: 'digital',
      },
      'user-1',
    );

    const createdSignature = savedEntities[savedEntities.length - 1];
    if (!createdSignature?.integrity_payload) {
      throw new Error('Expected inspection integrity payload');
    }

    const integrityPayload = createdSignature.integrity_payload;
    const documentBinding = integrityPayload.document_binding as Record<
      string,
      unknown
    >;

    expect(integrityPayload.verification_mode).toBe(
      SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE,
    );
    expect(integrityPayload.proof_scope).toBe(
      SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
    );
    expect(documentBinding.reference).toBe('Rotina - Caldeiraria');
    expect(documentBinding.status).toBeNull();
    expect(documentBinding.binding_hash).toEqual(expect.any(String));
  });

  it('ignora hashes e tokens enviados pelo cliente e valida o envelope server-side', async () => {
    await service.create(
      {
        document_id: 'apr-1',
        document_type: 'APR',
        user_id: 'user-1',
        signature_data: 'data:image/png;base64,AAAA',
        type: 'digital',
        signature_hash: 'client-hash',
        timestamp_token: 'client-token',
        timestamp_authority: 'client-authority',
      },
      'user-1',
    );

    const createdSignature = savedEntities[savedEntities.length - 1];
    if (!createdSignature) {
      throw new Error('Expected created signature');
    }
    expect(createdSignature.signature_hash).toBe('hash-1');
    expect(createdSignature.timestamp_token).toBe('token-1');
    expect(createdSignature.timestamp_authority).toBe('authority-1');

    repository.findOne.mockResolvedValue({
      id: 'sig-1',
      signature_hash: 'hash-1',
      timestamp_token: 'token-1',
      timestamp_authority: 'authority-1',
      signed_at: new Date('2026-03-16T12:00:00.000Z'),
      document_id: 'apr-1',
      document_type: 'APR',
      type: 'digital',
      integrity_payload: {
        verification_mode: SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE,
        legal_assurance: 'not_legal_strong',
        proof_scope: SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
        signature_evidence_hash: 'evidence-hash',
        document_binding: {
          binding_hash: 'binding-hash',
        },
      },
    });
    signatureTimestampService.verify.mockReturnValue(true);

    const result = await service.verifyById('sig-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'sig-1',
        valid: true,
        verification_mode: SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE,
        proof_scope: SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION,
        document_binding_hash: 'binding-hash',
        signature_evidence_hash: 'evidence-hash',
      }),
    );
  });

  it('bloqueia criacao de assinatura quando a APR nao esta mais pendente', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.APROVADA,
      pdf_file_key: null,
    } as unknown as Partial<Apr>);

    await expect(
      service.create(
        {
          document_id: 'apr-1',
          document_type: 'APR',
          user_id: 'user-1',
          signature_data: 'data:image/png;base64,AAAA',
          type: 'digital',
        },
        'user-1',
      ),
    ).rejects.toThrow(
      /Somente APRs pendentes podem ter assinaturas alteradas diretamente\./,
    );
  });

  it('bloqueia remocao de assinaturas quando a APR ja possui PDF final emitido', async () => {
    repository.find.mockResolvedValue([
      {
        id: 'sig-1',
        document_id: 'apr-1',
        document_type: 'APR',
        company_id: 'company-1',
        user_id: 'user-1',
      },
    ]);
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.APROVADA,
      pdf_file_key: 'documents/company-1/aprs/apr-1/apr-final.pdf',
    } as unknown as Partial<Apr>);

    await expect(
      service.removeByDocument('apr-1', 'APR', 'user-1'),
    ).rejects.toThrow(
      /APR com PDF final emitido está bloqueada para alterações de assinatura\./,
    );

    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('bloqueia criacao de assinatura quando a CAT ja possui PDF final emitido', async () => {
    catRepository.findOne.mockResolvedValue({
      id: 'cat-1',
      company_id: 'company-1',
      numero: 'CAT-001',
      status: 'fechada',
      pdf_file_key: 'documents/company-1/cats/cat-1/final.pdf',
    });

    await expect(
      service.create(
        {
          document_id: 'cat-1',
          document_type: 'CAT',
          user_id: 'user-1',
          signature_data: 'data:image/png;base64,CCCC',
          type: 'digital',
        },
        'user-1',
      ),
    ).rejects.toThrow(
      /CAT com PDF final emitido está bloqueado para alterações de assinatura\./,
    );
  });
});
