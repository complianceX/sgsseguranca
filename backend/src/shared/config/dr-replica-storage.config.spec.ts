import { resolveDrReplicaStorageConfig } from './dr-replica-storage.config';

function reader(values: Record<string, string | undefined>) {
  return (key: string) => values[key];
}

describe('resolveDrReplicaStorageConfig', () => {
  it('mantém DR desabilitado quando nenhuma configuração de réplica existe', () => {
    expect(
      resolveDrReplicaStorageConfig(
        reader({
          AWS_BUCKET_NAME: 'primary-bucket',
          AWS_ACCESS_KEY_ID: 'primary-access',
          AWS_SECRET_ACCESS_KEY: 'primary-secret',
        }),
      ),
    ).toEqual({
      configured: false,
      bucketName: null,
      endpoint: null,
      region: 'auto',
      forcePathStyle: false,
      accessKeyId: '',
      secretAccessKey: '',
    });
  });

  it('tolera somente defaults não materiais sem considerar DR configurado', () => {
    expect(
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_REGION: 'auto',
          DR_STORAGE_REPLICA_FORCE_PATH_STYLE: 'true',
        }),
      ),
    ).toEqual({
      configured: false,
      bucketName: null,
      endpoint: null,
      region: 'auto',
      forcePathStyle: false,
      accessKeyId: '',
      secretAccessKey: '',
    });
  });

  it('aceita somente uma réplica completa e independente', () => {
    expect(
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
          DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
          DR_STORAGE_REPLICA_REGION: 'auto',
          DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'dr-access',
          DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: 'dr-secret',
          AWS_BUCKET_NAME: 'primary-bucket',
          AWS_ACCESS_KEY_ID: 'primary-access',
          AWS_SECRET_ACCESS_KEY: 'primary-secret',
        }),
      ),
    ).toEqual({
      configured: true,
      bucketName: 'dr-bucket',
      endpoint: 'https://dr.example.invalid',
      region: 'auto',
      forcePathStyle: true,
      accessKeyId: 'dr-access',
      secretAccessKey: 'dr-secret',
    });
  });

  it('não usa credenciais primárias como fallback para réplica parcial', () => {
    expect(() =>
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
          DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
          AWS_ACCESS_KEY_ID: 'primary-access',
          AWS_SECRET_ACCESS_KEY: 'primary-secret',
        }),
      ),
    ).toThrow('DR_STORAGE_REPLICA_ACCESS_KEY_ID');
  });

  it('falha quando o bucket de DR reutiliza o bucket primário', () => {
    expect(() =>
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_BUCKET: 'same-bucket',
          DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
          DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'dr-access',
          DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: 'dr-secret',
          AWS_BUCKET_NAME: 'same-bucket',
        }),
      ),
    ).toThrow('replica bucket must be independent');
  });

  it('falha quando a chave de acesso de DR reutiliza a primária', () => {
    expect(() =>
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
          DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
          DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'same-access',
          DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: 'dr-secret',
          AWS_ACCESS_KEY_ID: 'same-access',
        }),
      ),
    ).toThrow('replica access key must be independent');
  });

  it('falha quando o segredo de DR reutiliza o segredo primário', () => {
    expect(() =>
      resolveDrReplicaStorageConfig(
        reader({
          DR_STORAGE_REPLICA_BUCKET: 'dr-bucket',
          DR_STORAGE_REPLICA_ENDPOINT: 'https://dr.example.invalid',
          DR_STORAGE_REPLICA_ACCESS_KEY_ID: 'dr-access',
          DR_STORAGE_REPLICA_SECRET_ACCESS_KEY: 'same-secret',
          AWS_SECRET_ACCESS_KEY: 'same-secret',
        }),
      ),
    ).toThrow('replica secret must be independent');
  });
});
