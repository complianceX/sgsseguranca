export type DrReplicaStorageConfig = {
  configured: boolean;
  bucketName: string | null;
  endpoint: string | null;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

type ReadConfig = (key: string) => string | undefined;

function normalize(value: string | undefined): string {
  return value?.trim() || '';
}

function fail(message: string): never {
  throw new Error(`DR_REPLICA_STORAGE_CONFIG_INVALID: ${message}`);
}

export function resolveDrReplicaStorageConfig(
  read: ReadConfig,
): DrReplicaStorageConfig {
  const bucketName = normalize(read('DR_STORAGE_REPLICA_BUCKET'));
  const endpoint = normalize(read('DR_STORAGE_REPLICA_ENDPOINT'));
  const region = normalize(read('DR_STORAGE_REPLICA_REGION')) || 'auto';
  const accessKeyId = normalize(read('DR_STORAGE_REPLICA_ACCESS_KEY_ID'));
  const secretAccessKey = normalize(
    read('DR_STORAGE_REPLICA_SECRET_ACCESS_KEY'),
  );
  const forcePathStyle = /^true$/i.test(
    normalize(read('DR_STORAGE_REPLICA_FORCE_PATH_STYLE')),
  );

  const hasReplicaConfiguration = [
    bucketName,
    endpoint,
    accessKeyId,
    secretAccessKey,
    normalize(read('DR_STORAGE_REPLICA_REGION')),
    normalize(read('DR_STORAGE_REPLICA_FORCE_PATH_STYLE')),
  ].some((value) => value.length > 0);

  if (!hasReplicaConfiguration) {
    return {
      configured: false,
      bucketName: null,
      endpoint: null,
      region,
      forcePathStyle: false,
      accessKeyId: '',
      secretAccessKey: '',
    };
  }

  const missing = [
    ['DR_STORAGE_REPLICA_BUCKET', bucketName],
    ['DR_STORAGE_REPLICA_ENDPOINT', endpoint],
    ['DR_STORAGE_REPLICA_ACCESS_KEY_ID', accessKeyId],
    ['DR_STORAGE_REPLICA_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    fail(`missing required replica setting(s): ${missing.join(', ')}`);
  }

  const primaryBucket =
    normalize(read('AWS_BUCKET_NAME')) || normalize(read('AWS_S3_BUCKET'));
  const primaryAccessKeyId = normalize(read('AWS_ACCESS_KEY_ID'));
  const primarySecretAccessKey = normalize(read('AWS_SECRET_ACCESS_KEY'));

  if (primaryBucket && primaryBucket === bucketName) {
    fail('replica bucket must be independent from the primary storage bucket');
  }
  if (primaryAccessKeyId && primaryAccessKeyId === accessKeyId) {
    fail('replica access key must be independent from the primary storage key');
  }
  if (primarySecretAccessKey && primarySecretAccessKey === secretAccessKey) {
    fail('replica secret must be independent from the primary storage secret');
  }

  return {
    configured: true,
    bucketName,
    endpoint,
    region,
    forcePathStyle: forcePathStyle || Boolean(endpoint),
    accessKeyId,
    secretAccessKey,
  };
}
