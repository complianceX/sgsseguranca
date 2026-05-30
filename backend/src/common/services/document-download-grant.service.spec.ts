import { ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { DocumentDownloadGrantService } from './document-download-grant.service';
import { DocumentDownloadGrant } from '../entities/document-download-grant.entity';

type GrantStore = Map<string, DocumentDownloadGrant>;

type ServiceHarness = {
  service: DocumentDownloadGrantService;
  store: GrantStore;
  tenantServiceRunMock: jest.Mock;
  transactionMock: jest.Mock;
};

function buildGrant(
  overrides: Partial<DocumentDownloadGrant> = {},
): DocumentDownloadGrant {
  const grant = new DocumentDownloadGrant();
  grant.id = overrides.id || 'grant-1';
  grant.company_id = overrides.company_id || 'company-1';
  grant.file_key = overrides.file_key || 'documents/company-1/module/doc.pdf';
  grant.original_name = overrides.original_name || 'doc.pdf';
  grant.content_type = overrides.content_type || 'application/pdf';
  grant.issued_for_user_id = overrides.issued_for_user_id || 'user-1';
  grant.expires_at =
    overrides.expires_at || new Date(Date.now() + 5 * 60 * 1000);
  grant.consumed_at = overrides.consumed_at || null;
  grant.created_at = overrides.created_at || new Date();
  return grant;
}

function signDownloadToken(params: {
  secret: string;
  gid: string;
  companyId: string;
  key: string;
  uid?: string;
}) {
  return jwt.sign(
    {
      typ: 'document_download',
      gid: params.gid,
      companyId: params.companyId,
      key: params.key,
      ...(params.uid ? { uid: params.uid } : {}),
    },
    params.secret,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
}

function createHarness(grants: DocumentDownloadGrant[]): ServiceHarness {
  const store: GrantStore = new Map(grants.map((grant) => [grant.id, grant]));

  const queryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(function (this: { where: jest.Mock }) {
      const firstCall = this.where.mock.calls[0] as
        | [string, { id?: string }]
        | undefined;
      const id = firstCall?.[1]?.id || '';
      return Promise.resolve(store.get(id) || null);
    }),
  };

  const repository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    save: jest.fn((grant: DocumentDownloadGrant) => {
      store.set(grant.id, grant);
      return Promise.resolve(grant);
    }),
  };

  const manager = {
    getRepository: jest.fn(() => repository),
  };

  const transactionMock = jest.fn((callback: (tx: unknown) => unknown) =>
    Promise.resolve(callback(manager)),
  );

  const dataSource = {
    transaction: transactionMock,
  } as unknown as DataSource;

  const tenantServiceRunMock = jest.fn(
    (_ctx: unknown, callback: () => unknown) => callback(),
  );
  const tenantService = {
    run: tenantServiceRunMock,
    getTenantId: jest.fn(),
  } as unknown as TenantService;

  const configService = {
    get: jest.fn((key: string) =>
      key === 'DOCUMENT_DOWNLOAD_TOKEN_SECRET' ? 'test-download-secret' : null,
    ),
  } as unknown as ConfigService;

  const service = new DocumentDownloadGrantService(
    {} as never,
    dataSource,
    configService,
    tenantService,
  );

  return {
    service,
    store,
    tenantServiceRunMock,
    transactionMock,
  };
}

describe('DocumentDownloadGrantService', () => {
  it('consome token válido apenas uma vez (single-use)', async () => {
    const grant = buildGrant({
      id: 'grant-single-use',
      company_id: 'company-1',
      file_key: 'documents/company-1/checklists/doc.pdf',
      issued_for_user_id: 'user-1',
    });
    const harness = createHarness([grant]);
    const token = signDownloadToken({
      secret: 'test-download-secret',
      gid: grant.id,
      companyId: grant.company_id,
      key: grant.file_key,
      uid: 'user-1',
    });

    const firstConsume = await harness.service.consumeToken(token, {
      consumerUserId: 'user-1',
    });
    expect(firstConsume.id).toBe(grant.id);
    expect(firstConsume.consumed_at).toBeInstanceOf(Date);

    await expect(
      harness.service.consumeToken(token, {
        consumerUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita token expirado com 403', async () => {
    const grant = buildGrant({
      id: 'grant-expired',
      expires_at: new Date(Date.now() - 1_000),
      company_id: 'company-1',
      file_key: 'documents/company-1/checklists/expired.pdf',
      issued_for_user_id: 'user-1',
    });
    const harness = createHarness([grant]);
    const token = signDownloadToken({
      secret: 'test-download-secret',
      gid: grant.id,
      companyId: grant.company_id,
      key: grant.file_key,
      uid: 'user-1',
    });

    await expect(
      harness.service.consumeToken(token, {
        consumerUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita consumo por usuário diferente do emitido', async () => {
    const grant = buildGrant({
      id: 'grant-user-bound',
      company_id: 'company-1',
      file_key: 'documents/company-1/checklists/user-bound.pdf',
      issued_for_user_id: 'user-allowed',
    });
    const harness = createHarness([grant]);
    const token = signDownloadToken({
      secret: 'test-download-secret',
      gid: grant.id,
      companyId: grant.company_id,
      key: grant.file_key,
      uid: 'user-allowed',
    });

    await expect(
      harness.service.consumeToken(token, {
        consumerUserId: 'user-blocked',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('executa consumo dentro do contexto de tenant restrito', async () => {
    const grant = buildGrant({
      id: 'grant-tenant-context',
      company_id: 'company-99',
      file_key: 'documents/company-99/checklists/doc.pdf',
      issued_for_user_id: 'user-99',
    });
    const harness = createHarness([grant]);
    const token = signDownloadToken({
      secret: 'test-download-secret',
      gid: grant.id,
      companyId: grant.company_id,
      key: grant.file_key,
      uid: 'user-99',
    });

    await harness.service.consumeToken(token, {
      consumerUserId: 'user-99',
    });

    expect(harness.tenantServiceRunMock).toHaveBeenCalledWith(
      { companyId: 'company-99', isSuperAdmin: false, siteScope: 'all' },
      expect.any(Function),
    );
    expect(harness.transactionMock).toHaveBeenCalledTimes(1);
  });
});
