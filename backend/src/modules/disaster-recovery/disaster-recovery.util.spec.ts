import {
  assertSafeSeparateEnvironmentRecovery,
  assertSafeRestoreExecution,
  buildBackupArtifactName,
  buildDisasterRecoveryTimestamp,
  resolveDisasterRecoveryEnvironment,
  resolveRuntimeNodeEnvironment,
  resolveRetentionDays,
  sanitizeBackupLabel,
} from './disaster-recovery.util';

describe('disaster-recovery.util', () => {
  it('resolve ambiente efetivo de DR', () => {
    expect(resolveDisasterRecoveryEnvironment('staging', 'production')).toBe(
      'staging',
    );
    expect(resolveDisasterRecoveryEnvironment('', 'production')).toBe(
      'production',
    );
    expect(resolveDisasterRecoveryEnvironment('', '')).toBe('development');
  });

  it('resolve NODE_ENV de runtime compatível para recovery', () => {
    expect(resolveRuntimeNodeEnvironment('recovery', 'production')).toBe(
      'staging',
    );
    expect(resolveRuntimeNodeEnvironment('sandbox', 'development')).toBe(
      'staging',
    );
    expect(resolveRuntimeNodeEnvironment('production', 'development')).toBe(
      'production',
    );
  });

  it('sanitiza label de backup', () => {
    expect(sanitizeBackupLabel('  Backup Diário #1  ')).toBe('backup-di-rio-1');
    expect(sanitizeBackupLabel('')).toBeNull();
  });

  it('gera nome padronizado do artefato', () => {
    expect(
      buildBackupArtifactName({
        environment: 'production',
        label: 'nightly',
        timestamp: '2026-03-23T12-00-00-000Z',
      }),
    ).toBe('db-backup__production__nightly__2026-03-23T12-00-00-000Z');
  });

  it('gera timestamp estável para nomes', () => {
    expect(
      buildDisasterRecoveryTimestamp(new Date('2026-03-23T12:34:56.789Z')),
    ).toBe('2026-03-23T12-34-56-789Z');
  });

  it('resolve retenção segura', () => {
    expect(resolveRetentionDays('15')).toBe(15);
    expect(resolveRetentionDays('abc')).toBe(30);
    expect(resolveRetentionDays(0)).toBe(30);
  });

  it('bloqueia restore em produção sem confirmação explícita', () => {
    expect(() =>
      assertSafeRestoreExecution({
        execute: true,
        targetEnvironment: 'production',
        allowProductionRestore: false,
      }),
    ).toThrow('Restore em produção bloqueado');
  });

  it('permite restore em produção somente com dupla confirmação', () => {
    expect(() =>
      assertSafeRestoreExecution({
        execute: true,
        targetEnvironment: 'production',
        allowProductionRestore: true,
        confirmationToken: 'RESTORE_PRODUCTION',
      }),
    ).not.toThrow();
  });

  it('bloqueia recovery real no mesmo ambiente por padrão', () => {
    expect(() =>
      assertSafeSeparateEnvironmentRecovery({
        execute: true,
        sourceEnvironment: 'production',
        targetEnvironment: 'production',
      }),
    ).toThrow('Recovery validation real exige ambiente alvo separado');
  });

  it('permite recovery real em ambiente separado', () => {
    expect(() =>
      assertSafeSeparateEnvironmentRecovery({
        execute: true,
        sourceEnvironment: 'production',
        targetEnvironment: 'recovery',
      }),
    ).not.toThrow();
  });
});
