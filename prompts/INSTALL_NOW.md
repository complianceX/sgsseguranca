# 🚀 INSTALAÇÃO MANUAL - Execute Agora

## ⚡ PASSO A PASSO (5 minutos)

### Passo 1: Abrir Terminal
Abra o PowerShell ou CMD como Administrador

### Passo 2: Navegar para o Backend
```bash
cd backend
```

### Passo 3: Instalar Dependências OpenTelemetry
```bash
npm install @opentelemetry/api@^1.9.0 @opentelemetry/auto-instrumentations-node@^0.52.1 @opentelemetry/exporter-jaeger@^1.28.0 @opentelemetry/exporter-prometheus@^0.56.0 @opentelemetry/instrumentation@^0.56.0 @opentelemetry/resources@^1.28.0 @opentelemetry/sdk-metrics@^1.28.0 @opentelemetry/sdk-node@^0.56.0 @opentelemetry/sdk-trace-node@^1.28.0 @opentelemetry/semantic-conventions@^1.28.0
```

**OU simplesmente:**
```bash
npm install
```

### Passo 4: Compilar
```bash
npm run build
```

### Passo 5: Iniciar Stack de Observabilidade
```bash
docker-compose -f docker-compose.observability.yml up -d
```

### Passo 6: Configurar .env
Adicione ao arquivo `backend/.env`:
```bash
ENABLE_TRACING=true
ENABLE_METRICS=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
PROMETHEUS_PORT=9464
```

### Passo 7: Iniciar Aplicação
```bash
npm run start:dev
```

---

## ✅ VERIFICAÇÃO

Você deve ver no console:
```
🔍 Initializing OpenTelemetry...
✅ OpenTelemetry initialized
🚀 Server running on port 3001
```

Depois acesse:
- **Jaeger:** http://localhost:16686
- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3000 (admin/admin)

---

## 🎯 ALTERNATIVA: Script Automático

Execute o script que criei:
```bash
cd backend
INSTALL_WEEK1.bat
```

Este script faz tudo automaticamente!

---

## 📊 O QUE ESTÁ PRONTO

✅ Código totalmente integrado  
✅ OpenTelemetry no main.ts  
✅ MetricsInterceptor no app.module.ts  
✅ ObservabilityModule global  
✅ Circuit Breaker pronto  
✅ Rate Limiting pronto  
✅ 3 arquivos de exemplos  
✅ 2 dashboards do Grafana  
✅ 9 alertas configurados  
✅ Documentação completa  

**Tudo está implementado! Só falta instalar as dependências e iniciar.**

---

## 🆘 PROBLEMAS?

### npm install falha
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Docker não inicia
```bash
docker-compose -f docker-compose.observability.yml down
docker-compose -f docker-compose.observability.yml up -d
```

### Porta em uso
```bash
# Verificar o que está usando a porta
netstat -ano | findstr :3001
netstat -ano | findstr :16686
netstat -ano | findstr :9090
netstat -ano | findstr :3000
```

---

## 📚 DOCUMENTAÇÃO

Depois de instalar, leia:
- **START_HERE.md** - Visão geral
- **backend/WEEK1_IMPLEMENTATION_GUIDE.md** - Guia completo
- **backend/GETTING_STARTED_IMPROVEMENTS.md** - Como usar

---

**Status:** ✅ Código 100% implementado, pronto para instalar!

