# 🔄 Guia de Migração - app.module.ts

## 📋 Resumo das Mudanças

Este guia explica como migrar do `app.module.ts` antigo (inseguro) para o novo (production-ready).

## 🔒 Principais Melhorias de Segurança

### 1. SSL/TLS Configuração Correta
**ANTES** (INSEGURO):
```typescript
ssl: isProduction ? { rejectUnauthorized: false } : false
```

**DEPOIS** (SEGURO):
```typescript
ssl: this.getSSLConfig(config, isProduction, logger)

// Método getSSLConfig:
// - Produção: rejectUnauthorized: true (validação completa)
// - Desenvolvimento: false (sem SSL)
// - Suporte a CA customizado
```

### 2. Validação de Variáveis de Ambiente com Joi
**ANTES**:
```typescript
ConfigModule.forRoot({ isGlobal: true })
```

**DEPOIS**:
```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    JWT_SECRET: Joi.string().min(32).required(),
    DATABASE_SSL: Joi.boolean().default(false),
    // ... todas as variáveis validadas
  }),
})
```

### 3. Redis Cache em Produção
**ANTES**:
```typescript
CacheModule.register({
  isGlobal: true,
  ttl: 60 * 5,
  // Redis comentado
})
```

**DEPOIS**:
```typescript
CacheModule.registerAsync({
  useFactory: (config: ConfigService) => {
    if (isProduction) {
      return {
        store: redisStore,
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
        password: config.get('REDIS_PASSWORD'),
        tls: config.get('REDIS_TLS') ? {} : undefined,
      };
    }
    return { ttl: 300, max: 100 }; // Memory cache em dev
  },
})
```

### 4. BullQueue com Retry Strategy
**ANTES**:
```typescript
BullModule.forRoot({
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
})
```

**DEPOIS**:
```typescript
BullModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    redis: {
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD'),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }),
})
```

### 5. Connection Pooling Otimizado
**ANTES**:
```typescript
poolSize: 20
```

**DEPOIS**:
```typescript
extra: {
  max: 20,        // Máximo de conexões
  min: 5,         // Mínimo de conexões
  idleTimeoutMillis: 30000,  // 30s
  connectionTimeoutMillis: 2000,  // 2s
}
```

### 6. Logging com Logger NestJS
**ANTES**:
```typescript
console.log('Conectando ao banco de dados...')
```

**DEPOIS**:
```typescript
private readonly logger = new Logger('TypeORM');
this.logger.log('🔗 Conectando ao PostgreSQL...')
```

### 7. Lifecycle Hook com Validação
**NOVO**:
```typescript
export class AppModule implements OnModuleInit {
  async onModuleInit() {
    if (isProduction) {
      this.validateProductionSecurity();
    }
  }

  private validateProductionSecurity() {
    // Valida JWT_SECRET, DATABASE_SSL, REDIS_HOST, etc
  }
}
```

## 📦 Instalação de Dependências

```bash
cd backend

# Instalar Joi para validação
npm install joi

# Instalar tipos (dev)
npm install --save-dev @types/joi

# Verificar cache-manager-redis-store
npm list cache-manager-redis-store

# Se não estiver instalado:
npm install cache-manager-redis-store
npm install --save-dev @types/cache-manager-redis-store
```

## 🔄 Passo a Passo da Migração

### 1. Backup do Arquivo Atual
```bash
cp src/app.module.ts src/app.module.backup.ts
```

### 2. Substituir app.module.ts
```bash
cp src/app.module.refactored.ts src/app.module.ts
```

### 3. Atualizar .env
```bash
# Desenvolvimento
cp .env.development.example .env

# Produção
cp .env.production.example .env
```

### 4. Gerar Secrets Seguros
```bash
# Linux/Mac
bash scripts/generate-secrets.sh

# Windows
powershell scripts/generate-secrets.ps1
```

### 5. Configurar Variáveis de Ambiente

**Obrigatórias em Produção**:
```env
NODE_ENV=production
JWT_SECRET=<gerar com script acima - mínimo 32 chars>
DATABASE_SSL=true
REDIS_HOST=<seu redis host>
REDIS_PASSWORD=<gerar com script acima>
```

### 6. Testar Localmente
```bash
# Instalar dependências
npm install

# Build
npm run build

# Rodar testes
npm run test

# Iniciar em modo desenvolvimento
npm run start:dev
```

### 7. Verificar Logs
Procure por:
- ✅ "Todas as validações de segurança passaram"
- ✅ "🔒 SSL habilitado"
- ✅ "🔴 Configurando Redis Cache para PRODUÇÃO"
- ❌ Erros de validação Joi

### 8. Deploy para Produção
```bash
# Seguir checklist completo
cat PRODUCTION_DEPLOYMENT_CHECKLIST.md
```

## ⚠️  Problemas Comuns

### Erro: "JWT_SECRET deve ter no mínimo 32 caracteres"
**Solução**: Gere um novo secret:
```bash
openssl rand -base64 32
```

### Erro: "REDIS_HOST é obrigatório em produção"
**Solução**: Configure Redis:
```env
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

### Erro: "DATABASE_SSL deve estar habilitado em produção"
**Solução**: Habilite SSL:
```env
DATABASE_SSL=true
```

### Erro: "Cannot find module 'joi'"
**Solução**: Instale Joi:
```bash
npm install joi
```

### Erro: "Cannot find module 'cache-manager-redis-store'"
**Solução**: Instale o pacote:
```bash
npm install cache-manager-redis-store
```

## 🧪 Testes de Validação

### 1. Teste de Variáveis de Ambiente
```bash
# Deve falhar se JWT_SECRET < 32 chars
JWT_SECRET=short npm run start:prod

# Deve falhar se DATABASE_SSL=false em produção
NODE_ENV=production DATABASE_SSL=false npm run start:prod
```

### 2. Teste de SSL
```bash
# Verificar conexão SSL
psql "postgresql://user:pass@host:5432/db?sslmode=require"
```

### 3. Teste de Redis
```bash
# Verificar conexão Redis
redis-cli -h host -p 6379 -a password ping
```

## 📊 Comparação de Segurança

| Aspecto | ANTES | DEPOIS |
|---------|-------|--------|
| SSL Validation | ❌ Desabilitado | ✅ Habilitado |
| Env Validation | ❌ Nenhuma | ✅ Joi Schema |
| Redis Cache | ❌ Comentado | ✅ Prod: Redis, Dev: Memory |
| Connection Pool | ⚠️  Básico | ✅ Otimizado (max:20, min:5) |
| Error Handling | ❌ Console.log | ✅ Logger NestJS |
| Retry Strategy | ❌ Nenhuma | ✅ Exponential backoff |
| Security Checks | ❌ Nenhuma | ✅ OnModuleInit validation |
| Secrets | ⚠️  Hardcoded | ✅ ConfigService |

## 🎯 Checklist de Migração

- [ ] Backup do app.module.ts atual
- [ ] Instalar dependências (joi, cache-manager-redis-store)
- [ ] Substituir app.module.ts
- [ ] Gerar secrets seguros
- [ ] Configurar .env (desenvolvimento)
- [ ] Configurar .env (produção)
- [ ] Testar localmente
- [ ] Verificar logs de segurança
- [ ] Rodar testes
- [ ] Deploy para staging
- [ ] Testes de integração
- [ ] Deploy para produção
- [ ] Monitorar métricas
- [ ] Verificar alertas

## 📚 Referências

- [NestJS Security Best Practices](https://docs.nestjs.com/security/encryption-and-hashing)
- [TypeORM SSL Configuration](https://typeorm.io/data-source-options#postgres--cockroachdb-data-source-options)
- [Redis TLS Configuration](https://redis.io/docs/manual/security/encryption/)
- [Joi Validation](https://joi.dev/api/)

---

**Data**: 25/02/2026
**Versão**: 2.0.0
**Status**: Production-Ready ✅
