# Checklist de Validação para Produção

Antes de fazer o deploy desta aplicação em produção, por favor, verifique cada um dos seguintes itens para garantir a segurança, estabilidade e performance do sistema.

## 1. Variáveis de Ambiente (`.env.production`)

- [ ] `NODE_ENV` está definido como `production`.
- [ ] `PORT` está configurado para a porta correta do ambiente de produção.
- [ ] `JWT_SECRET` foi gerado com um valor aleatório forte de no mínimo 32 caracteres.
- [ ] `JWT_REFRESH_SECRET` foi gerado com um valor aleatório forte (diferente do `JWT_SECRET`) de no mínimo 32 caracteres.
- [ ] `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_NAME` estão corretos para o banco de dados de produção.
- [ ] `DATABASE_PASSWORD` é uma senha forte (mínimo 16 caracteres) e está armazenada de forma segura (ex: via secrets do provedor de nuvem).
- [ ] `DB_SSL_CA` está preenchido com o conteúdo do certificado CA (codificado em Base64) se o seu provedor de banco de dados exigir. **NÃO DEIXE EM BRANCO SE SSL FOR NECESSÁRIO.**
- [ ] `REDIS_URL` ou (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) estão configurados para a instância Redis de produção.
- [ ] Todas as chaves de API (`RESEND_API_KEY`, `AWS_ACCESS_KEY_ID`, etc.) são chaves de produção e não de teste.

## 2. Infraestrutura e Build

- [ ] A aplicação está sendo iniciada com `npm run start:prod` ou comando equivalente.
- [ ] O banco de dados de produção está acessível a partir da aplicação (verificar firewalls, security groups, etc.).
- [ ] A instância Redis de produção está acessível.
- [ ] O serviço de SSL/TLS do banco de dados está corretamente configurado e funcional.
- [ ] As dependências do `package.json` foram instaladas com `npm install --omit=dev`.

## 3. Comandos de Teste para Validação Funcional

Execute estes comandos para validar que os principais componentes configurados no `app.module.ts` estão funcionando.

### a. Validar Conexão com Banco de Dados e Migrações
*Este comando assume que você tem um script para checar o status das migrações.*
```bash
# Executa um script Node.js que tenta conectar ao DB e verifica por migrações pendentes
node ./dist/scripts/check-db-connection.js
```

### b. Validar Conexão com o Cache (Redis)
*Use o `redis-cli` para verificar se a aplicação está se conectando e setando chaves.*
```bash
# Conecte-se ao seu Redis
redis-cli -u $REDIS_URL

# Monitore os comandos recebidos pelo Redis
MONITOR

# Em outra janela, inicie a aplicação e faça algumas requisições. 
# Você deverá ver comandos como `GET`, `SET`, `TTL` aparecendo no monitor.
```

### c. Validar Conexão com a Fila (BullMQ)
*Use o `redis-cli` para verificar se as filas do BullMQ foram criadas.*
```bash
# Conecte-se ao seu Redis
redis-cli -u $REDIS_URL

# Liste as chaves do BullMQ (elas são prefixadas com `bull:`)
KEYS "bull:*"

# Se a aplicação iniciou corretamente, você verá chaves como `bull:my-queue:id`, etc.
```

### d. Validar Health Check
*O endpoint de health check valida a conexão com o banco de dados e outros serviços.*
```bash
# Faça uma requisição para o endpoint de health
curl http://localhost:3001/health

# A resposta deve ser um JSON com `status: "ok"` e detalhes dos serviços saudáveis.
# Exemplo de resposta esperada:
# {
#   "status": "ok",
#   "info": { "database": { "status": "up" }, "redis": { "status": "up" } },
#   "error": {},
#   "details": { "database": { "status": "up" }, "redis": { "status": "up" } }
# }
```
