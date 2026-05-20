import type { ObjectSchema, ValidationResult } from 'joi';

describe('AppModule production environment validation', () => {
  const productionEnv = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://sgs_app:secret@ep-example.sa-east-1.aws.neon.tech/neondb',
    DATABASE_SSL: true,
    DATABASE_POOLER_ALLOW_SESSION_RLS: true,
    REDIS_DISABLED: 'true',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    MFA_TOTP_ENCRYPTION_KEY: 'c'.repeat(32),
    AWS_BUCKET_NAME: 'sgs-01',
    AWS_ENDPOINT:
      'https://6c64d54915231ae358b11475b268ae9b.r2.cloudflarestorage.com',
    AWS_ACCESS_KEY_ID: 'access-key',
    AWS_SECRET_ACCESS_KEY: 'secret-key',
    S3_FORCE_PATH_STYLE: true,
    DR_STORAGE_REPLICA_BUCKET: 'sgs-02',
    DR_STORAGE_REPLICA_ENDPOINT:
      'https://6c64d54915231ae358b11475b268ae9b.r2.cloudflarestorage.com',
    DR_STORAGE_REPLICA_FORCE_PATH_STYLE: true,
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ...Object.fromEntries(
        Object.entries(productionEnv).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  async function loadValidationSchema(): Promise<ObjectSchema> {
    // AppModule monta ConfigModule no import; carregamos depois de preparar env
    // para que a validação global do módulo também receba valores válidos.
    const appModule = (await import('./app.module')) as {
      validationSchema: ObjectSchema;
    };
    return appModule.validationSchema;
  }

  async function validate(values: Record<string, unknown>) {
    const schema = await loadValidationSchema();
    return schema.validate(values, {
      abortEarly: false,
      allowUnknown: true,
    });
  }

  function getCustomMessage(result: ValidationResult): string {
    const context = result.error?.details[0]?.context as
      | { message?: string }
      | undefined;
    return context?.message || result.error?.message || '';
  }

  it('aceita configuração R2 governada com réplica DR usando as credenciais primárias', async () => {
    const result = await validate(productionEnv);

    expect(result.error).toBeUndefined();
  });

  it('bloqueia produção sem bucket ou credenciais do storage documental', async () => {
    const result = await validate({
      ...productionEnv,
      AWS_BUCKET_NAME: '',
      AWS_ACCESS_KEY_ID: '',
    });

    expect(result.error).toBeDefined();
    expect(getCustomMessage(result)).toContain(
      'Produção exige storage documental governado',
    );
  });

  it('bloqueia Cloudflare R2 em produção sem path-style habilitado', async () => {
    const result = await validate({
      ...productionEnv,
      S3_FORCE_PATH_STYLE: false,
    });

    expect(result.error).toBeDefined();
    expect(getCustomMessage(result)).toContain(
      'Cloudflare R2 exige S3_FORCE_PATH_STYLE=true',
    );
  });

  it('bloqueia tentativa de TLS inseguro no Postgres', async () => {
    const result = await validate({
      ...productionEnv,
      DATABASE_SSL: false,
      DATABASE_SSL_ALLOW_INSECURE: true,
      DATABASE_SSL_ALLOW_INSECURE_FORCE: true,
    });

    expect(result.error).toBeDefined();
    expect(getCustomMessage(result)).toContain('DATABASE_SSL_ALLOW_INSECURE');
  });

  it('bloqueia bucket DR sem endpoint de réplica', async () => {
    const result = await validate({
      ...productionEnv,
      DR_STORAGE_REPLICA_ENDPOINT: '',
    });

    expect(result.error).toBeDefined();
    expect(getCustomMessage(result)).toContain(
      'DR_STORAGE_REPLICA_BUCKET foi configurado',
    );
  });
});
