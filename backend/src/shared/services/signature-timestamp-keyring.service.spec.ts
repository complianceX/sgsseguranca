import type { ConfigService } from '@nestjs/config';
import { SignatureTimestampKeyringService } from './signature-timestamp-keyring.service';
import {
  SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
  SIGNATURE_TIMESTAMP_TOKEN_VERSION,
} from './signature-timestamp-keyring.contract';
import {
  SIGNATURE_TIMESTAMP_VERIFICATION_STATUS,
  SignatureTimestampService,
} from './signature-timestamp.service';

const oldSecret = 'o'.repeat(64);
const activeSecret = 'a'.repeat(64);
const otherSecret = 'x'.repeat(64);
const hash = 'a'.repeat(64);
const issuedAt = '2026-08-25T00:00:00.000Z';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('SignatureTimestampKeyringService', () => {
  it('mantém a chave legada somente para verificação quando existe uma chave ativa nova', () => {
    const keyring = new SignatureTimestampKeyringService(
      config({
        SIGNATURE_TIMESTAMP_SECRET: oldSecret,
        SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: '2026-09',
        SIGNATURE_TIMESTAMP_ACTIVE_SECRET: activeSecret,
        SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: JSON.stringify({
          '2025-legacy': otherSecret,
        }),
      }),
    );

    expect(keyring.getActiveSigningKey()).toEqual({
      keyId: '2026-09',
      secret: activeSecret,
      canSign: true,
    });
    expect(
      keyring.getVerificationKey(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID),
    ).toEqual({
      keyId: SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
      secret: oldSecret,
      canSign: false,
    });
    expect(keyring.getVerificationOnlyKeyIds()).toEqual([
      SIGNATURE_TIMESTAMP_LEGACY_KEY_ID,
      '2025-legacy',
    ]);
  });

  it('não oferece capacidade de emissão quando existe somente uma chave histórica', () => {
    const keyring = new SignatureTimestampKeyringService(
      config({
        SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: JSON.stringify({
          [SIGNATURE_TIMESTAMP_LEGACY_KEY_ID]: oldSecret,
        }),
      }),
    );

    expect(keyring.getActiveSigningKey()).toBeUndefined();
    expect(
      keyring.getVerificationKey(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID),
    ).toEqual(expect.objectContaining({ canSign: false }));
  });

  it('rejeita reutilização da chave legada como chave ativa', () => {
    expect(() =>
      new SignatureTimestampKeyringService(
        config({
          SIGNATURE_TIMESTAMP_SECRET: oldSecret,
          SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: '2026-09',
          SIGNATURE_TIMESTAMP_ACTIVE_SECRET: oldSecret,
        }),
      ).getActiveSigningKey(),
    ).toThrow('MUST_DIFFER_FROM_LEGACY_SECRET');
  });
});

describe('SignatureTimestampService versioned verification contract', () => {
  it('preserva v1 e registra somente versão e identificador não secreto', () => {
    const service = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );

    const stamp = service.issueFromHash(hash, issuedAt);

    expect(stamp.timestamp_token_version).toBe(
      SIGNATURE_TIMESTAMP_TOKEN_VERSION,
    );
    expect(stamp.signature_key_id).toBe(SIGNATURE_TIMESTAMP_LEGACY_KEY_ID);
    expect(stamp.timestamp_token).toMatch(
      /^2026-08-25T00:00:00\.000Z\.[a-f0-9]{64}$/,
    );
  });

  it('distingue token ausente, token malformado, MAC incorreto e chave histórica ausente', () => {
    const service = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );
    const stamp = service.issueFromHash(hash, issuedAt);
    const withoutKey = new SignatureTimestampService(config({}));

    expect(withoutKey.verifyDetailed(hash, null).status).toBe(
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.NOT_TOKENIZED,
    );
    expect(service.verifyDetailed(hash, `${issuedAt}.broken`).status).toBe(
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
    );
    expect(
      service.verifyDetailed(hash, `${issuedAt}.${'b'.repeat(64)}`).status,
    ).toBe(SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID);
    expect(withoutKey.verifyDetailed(hash, stamp.timestamp_token).status).toBe(
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.LEGACY_KEY_UNAVAILABLE,
    );
  });

  it.each([
    `${issuedAt}.${'a'.repeat(63)}`,
    `${issuedAt}.${'g'.repeat(64)}`,
    `2026-08-25T00:00:00Z.${'a'.repeat(64)}`,
    `${issuedAt.replace('.000Z', '+00:00')}.${'a'.repeat(64)}`,
  ])('rejeita token não canônico: %s', (token) => {
    const service = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );

    expect(service.verifyDetailed(hash, token).status).toBe(
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
    );
  });

  it('rejeita chave errada, identificador desconhecido e versão futura', () => {
    const issuer = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );
    const stamp = issuer.issueFromHash(hash, issuedAt);
    const verifier = new SignatureTimestampService(
      config({
        SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: JSON.stringify({
          [SIGNATURE_TIMESTAMP_LEGACY_KEY_ID]: otherSecret,
        }),
      }),
    );

    expect(verifier.verifyDetailed(hash, stamp.timestamp_token).status).toBe(
      SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
    );
    expect(
      issuer.verifyDetailed(hash, stamp.timestamp_token, {
        signature_key_id: 'unknown-key',
      }).status,
    ).toBe(SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID);
    expect(
      issuer.verifyDetailed(hash, stamp.timestamp_token, {
        timestamp_token_version: 'v2',
      }).status,
    ).toBe(SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID);
  });

  it('permite recuperação futura com chave somente-verificação e emite apenas com a ativa', () => {
    const historicalIssuer = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );
    const historicalStamp = historicalIssuer.issueFromHash(hash, issuedAt);
    const rotated = new SignatureTimestampService(
      config({
        SIGNATURE_TIMESTAMP_ACTIVE_KEY_ID: '2026-09',
        SIGNATURE_TIMESTAMP_ACTIVE_SECRET: activeSecret,
        SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: JSON.stringify({
          [SIGNATURE_TIMESTAMP_LEGACY_KEY_ID]: oldSecret,
        }),
      }),
    );

    const freshStamp = rotated.issueFromHash('b'.repeat(64), issuedAt);

    expect(freshStamp.signature_key_id).toBe('2026-09');
    expect(
      rotated.verifyDetailed(hash, historicalStamp.timestamp_token, {
        signature_key_id: historicalStamp.signature_key_id,
        timestamp_token_version: historicalStamp.timestamp_token_version,
      }).status,
    ).toBe(SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.VALID);
    expect(
      rotated.verifyDetailed(
        freshStamp.signature_hash,
        freshStamp.timestamp_token,
        {
          signature_key_id: freshStamp.signature_key_id,
          timestamp_token_version: freshStamp.timestamp_token_version,
        },
      ).status,
    ).toBe(SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.VALID);
    expect(() =>
      new SignatureTimestampService(
        config({
          SIGNATURE_TIMESTAMP_VERIFICATION_KEYS_JSON: JSON.stringify({
            [SIGNATURE_TIMESTAMP_LEGACY_KEY_ID]: oldSecret,
          }),
        }),
      ).issueFromHash(hash, issuedAt),
    ).toThrow('Missing SIGNATURE_TIMESTAMP_SECRET');
  });

  it('classifica exatamente 109 registros sem chave sem mutar os tokens', () => {
    const issuer = new SignatureTimestampService(
      config({ SIGNATURE_TIMESTAMP_SECRET: oldSecret }),
    );
    const records = Array.from({ length: 109 }, (_, index) => ({
      hash: index.toString(16).padStart(64, '0'),
      token: issuer.issueFromHash(
        index.toString(16).padStart(64, '0'),
        issuedAt,
      ).timestamp_token,
    }));
    const before = records.map((record) => ({ ...record }));
    const withoutKey = new SignatureTimestampService(config({}));
    const statuses = records.map(
      (record) => withoutKey.verifyDetailed(record.hash, record.token).status,
    );

    expect(statuses).toHaveLength(109);
    expect(statuses).toEqual(
      Array(109).fill(
        SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.LEGACY_KEY_UNAVAILABLE,
      ),
    );
    expect(
      statuses.filter(
        (status) => status === SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.VALID,
      ),
    ).toHaveLength(0);
    expect(
      statuses.filter(
        (status) => status === SIGNATURE_TIMESTAMP_VERIFICATION_STATUS.INVALID,
      ),
    ).toHaveLength(0);
    expect(records).toEqual(before);
  });
});
