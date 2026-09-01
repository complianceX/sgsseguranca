import { ConfigService } from '@nestjs/config';
import { DisasterRecoveryReplicaStorageService } from './disaster-recovery-replica-storage.service';
import type { IntegrationResilienceService } from '../../shared/resilience/integration-resilience.service';

const integrationStub = {} as IntegrationResilienceService;

describe('DisasterRecoveryReplicaStorageService configuration bootstrap', () => {
  it('inicializa com boolean Joi/ConfigService sem lançar TypeError', () => {
    const config = new ConfigService({
      DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
      DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
      DR_STORAGE_REPLICA_REGION: 'auto',
      DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'dr-access',
      DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: 'dr-secret',
      DR_STORAGE_REPLICA_FORCE_PATH_STYLE: false,
      AWS_BUCKET_NAME: 'primary-bucket',
      AWS_ACCESS_KEY_ID: 'primary-access',
      AWS_SECRET_ACCESS_KEY: 'primary-secret',
    });

    const service = new DisasterRecoveryReplicaStorageService(
      config,
      integrationStub,
    );

    expect(service.isConfigured()).toBe(true);
    expect(service.getConfigurationSummary()).toEqual({
      configured: true,
      bucketName: 'dr-bucket',
      endpoint: 'https://dr.example.invalid',
    });
  });

  it('inicializa desabilitado quando Joi injeta somente boolean/defaults de DR', () => {
    const config = new ConfigService({
      DR_STORAGE_REPLICA_REGION: 'auto',
      DR_STORAGE_REPLICA_FORCE_PATH_STYLE: false,
    });

    const service = new DisasterRecoveryReplicaStorageService(
      config,
      integrationStub,
    );

    expect(service.isConfigured()).toBe(false);
    expect(service.getConfigurationSummary()).toEqual({
      configured: false,
      bucketName: null,
      endpoint: null,
    });
  });

  it('falha fechado no bootstrap para réplica parcial', () => {
    const config = new ConfigService({
      DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
      DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
      DR_STORAGE_REPLICA_FORCE_PATH_STYLE: false,
      AWS_ACCESS_KEY_ID: 'primary-access',
      AWS_SECRET_ACCESS_KEY: 'primary-secret',
    });

    expect(
      () =>
        new DisasterRecoveryReplicaStorageService(config, integrationStub),
    ).toThrow('DR_STORAGE_REPLICA_ACCESS_KEY_ID');
  });

  it('falha fechado no bootstrap quando segredo primário é reutilizado e não o expõe', () => {
    const sensitive = 'same-sensitive-secret';
    const config = new ConfigService({
      DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
      DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
      DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'dr-access',
      DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: sensitive,
      DR_STORAGE_REPLICA_FORCE_PATH_STYLE: true,
      AWS_BUCKET_NAME: 'primary-bucket',
      AWS_ACCESS_KEY_ID: 'primary-access',
      AWS_SECRET_ACCESS_KEY: sensitive,
    });

    let message = '';
    try {
      new DisasterRecoveryReplicaStorageService(config, integrationStub);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('replica secret must be independent');
    expect(message).not.toContain(sensitive);
  });
});
