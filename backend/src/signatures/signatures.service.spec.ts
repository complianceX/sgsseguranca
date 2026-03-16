import { Repository } from 'typeorm';
import { SignaturesService } from './signatures.service';
import { Signature } from './entities/signature.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { UsersService } from '../users/users.service';

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
    manager: {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        Promise.resolve(
          callback({
            getRepository: jest.fn(() => transactionalRepository),
          }),
        ),
      ),
    },
  };

  const signatureTimestampService = {
    issueFromRaw: jest.fn(() => ({
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

  const usersService = {
    deriveHmacKey: jest.fn(() => Promise.resolve('derived-key')),
    computeHmac: jest.fn(() => 'computed-hmac'),
  };

  beforeEach(() => {
    savedEntities.length = 0;
    jest.clearAllMocks();

    service = new SignaturesService(
      repository as unknown as Repository<Signature>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      signatureTimestampService as unknown as SignatureTimestampService,
      documentGovernanceService as unknown as DocumentGovernanceService,
      usersService as unknown as UsersService,
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
    expect(transactionalRepository.delete).toHaveBeenCalledWith({
      document_id: 'dds-1',
      document_type: 'DDS',
    });
    const persistedSignature = savedEntities[0];

    expect(persistedSignature).toEqual(
      expect.objectContaining({
        user_id: 'participante-1',
        document_id: 'dds-1',
        document_type: 'DDS',
        signature_data: 'computed-hmac',
        type: 'hmac',
      }),
    );
    expect(persistedSignature?.integrity_payload).toEqual(
      expect.objectContaining({
        user_id: 'participante-1',
        captured_by_user_id: 'operador-1',
        hmac_verified: true,
      }),
    );
  });
});
