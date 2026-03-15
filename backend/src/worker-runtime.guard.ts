export function assertWorkerRedisContract(env: NodeJS.ProcessEnv): void {
  if (/^true$/i.test(env.REDIS_DISABLED || '')) {
    throw new Error(
      'REDIS_DISABLED=true não é suportado no runtime worker. ' +
        'Inicie apenas a API em modo degradado ou habilite Redis para processar filas.',
    );
  }
}
