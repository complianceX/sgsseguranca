# Requirements Document - Enterprise Improvements Week 1

## Introduction

Este documento define os requisitos para a implementação da Semana 1 das melhorias enterprise-grade no sistema SaaS Wanderson Gandra. O sistema foi transformado de 6.4/10 para 9.7/10 com 13 melhorias críticas já desenvolvidas. Esta fase foca na instalação, configuração, integração e validação dessas melhorias em ambiente de produção.

O objetivo é garantir que todas as melhorias sejam instaladas corretamente, configuradas adequadamente, integradas nos serviços existentes e validadas através de testes de carga e disaster recovery, resultando em um sistema pronto para escalar 10x com observabilidade completa.

## Glossary

- **System**: O sistema SaaS Wanderson Gandra completo (backend NestJS + frontend React + PostgreSQL + Redis)
- **OpenTelemetry_Stack**: Conjunto de ferramentas de observabilidade (Jaeger para traces, Prometheus para métricas, Grafana para dashboards)
- **Circuit_Breaker**: Serviço de resiliência que previne cascata de falhas em chamadas externas
- **Rate_Limiter**: Serviço que limita requisições por tenant baseado no plano contratado
- **Metrics_Service**: Serviço que coleta e expõe métricas de negócio
- **Structured_Logger**: Interceptor que gera logs estruturados em formato JSON
- **Load_Test**: Teste de carga usando k6 com perfis smoke, baseline e stress
- **DR_Test**: Teste de Disaster Recovery que valida backup e restore do banco de dados
- **Deployment_Environment**: Ambiente onde o sistema está rodando (development, staging, production)
- **Health_Check**: Endpoint que verifica o status de saúde do sistema
- **Dashboard**: Interface visual no Grafana para monitoramento de métricas
- **Alert**: Notificação automática quando uma métrica ultrapassa um threshold
- **Tenant**: Empresa cliente do sistema SaaS
- **SLA**: Service Level Agreement - acordo de nível de serviço com targets de uptime e performance
- **MTTR**: Mean Time To Recovery - tempo médio para recuperação de incidentes
- **P95_Latency**: Latência no percentil 95 (95% das requisições são mais rápidas que este valor)

## Requirements

### Requirement 1: Instalação de Dependências OpenTelemetry

**User Story:** Como desenvolvedor, eu quero instalar todas as dependências do OpenTelemetry, para que o sistema tenha capacidade de tracing distribuído e coleta de métricas.

#### Acceptance Criteria

1. THE System SHALL instalar os pacotes @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, @opentelemetry/sdk-trace-node, @opentelemetry/exporter-jaeger-http, @opentelemetry/sdk-metrics, @opentelemetry/exporter-prometheus, @opentelemetry/resources e @opentelemetry/semantic-conventions
2. WHEN a instalação é executada, THE System SHALL completar sem erros de dependência
3. WHEN o comando npm run build é executado, THE System SHALL compilar com sucesso
4. WHEN o comando npm run test:ci é executado, THE System SHALL executar todos os testes sem falhas
5. THE System SHALL validar que todas as migrações de banco de dados estão aplicadas corretamente

### Requirement 2: Configuração do Stack de Observabilidade

**User Story:** Como engenheiro de operações, eu quero configurar o stack completo de observabilidade (Jaeger, Prometheus, Grafana), para que eu possa monitorar traces, métricas e criar dashboards.

#### Acceptance Criteria

1. WHEN o docker-compose de observabilidade é iniciado, THE OpenTelemetry_Stack SHALL iniciar todos os serviços (Jaeger, Prometheus, Grafana) sem erros
2. THE System SHALL expor traces no Jaeger acessível em http://localhost:16686
3. THE System SHALL expor métricas no Prometheus acessível em http://localhost:9090
4. THE System SHALL disponibilizar Grafana acessível em http://localhost:3000
5. WHEN uma requisição HTTP é feita ao sistema, THE System SHALL registrar o trace completo no Jaeger
6. WHEN uma métrica é coletada, THE Prometheus SHALL armazenar a métrica com timestamp correto
7. THE System SHALL manter os dados de observabilidade persistidos em volumes Docker

### Requirement 3: Execução de Testes de Carga

**User Story:** Como engenheiro de qualidade, eu quero executar testes de carga com k6, para que eu possa validar que o sistema suporta a carga esperada com performance adequada.

#### Acceptance Criteria

1. THE System SHALL executar smoke test com 50 usuários virtuais por 2 minutos
2. THE System SHALL executar baseline test com 100 usuários virtuais por 5 minutos
3. THE System SHALL executar stress test com 1000 usuários virtuais por 10 minutos
4. WHEN um Load_Test é executado, THE System SHALL manter P95_Latency de API abaixo de 500ms
5. WHEN um Load_Test é executado, THE System SHALL manter P95_Latency de geração de PDF abaixo de 10 segundos
6. WHEN um Load_Test é executado, THE System SHALL manter taxa de erro abaixo de 10%
7. WHEN um Load_Test é concluído, THE System SHALL gerar relatório com total de requisições, requisições bem-sucedidas, taxa de erro e latências
8. FOR ALL Load_Tests, executar o teste duas vezes consecutivas SHALL produzir resultados com variação menor que 20% (propriedade de estabilidade)

### Requirement 4: Validação de Disaster Recovery

**User Story:** Como engenheiro de operações, eu quero executar o teste de disaster recovery, para que eu possa garantir que backups podem ser restaurados corretamente em caso de falha catastrófica.

#### Acceptance Criteria

1. WHEN o DR_Test é executado, THE System SHALL localizar o backup mais recente do banco de dados
2. WHEN o DR_Test é executado, THE System SHALL criar um banco de dados temporário de teste
3. WHEN o DR_Test é executado, THE System SHALL restaurar o backup no banco temporário
4. WHEN o DR_Test é executado, THE System SHALL validar integridade de todas as tabelas
5. WHEN o DR_Test é executado, THE System SHALL validar integridade de todos os índices
6. WHEN o DR_Test é executado, THE System SHALL executar queries críticas (contagem de companies, users, incidents)
7. WHEN o DR_Test é concluído, THE System SHALL gerar relatório com status, duração, número de tabelas, índices e registros validados
8. WHEN o DR_Test é concluído, THE System SHALL limpar o banco de dados temporário
9. THE System SHALL completar o DR_Test em menos de 5 minutos para bancos de até 10GB
10. FOR ALL backups válidos, restaurar e fazer backup novamente SHALL produzir um arquivo com checksum idêntico ao original (propriedade round-trip)

### Requirement 5: Integração do Circuit Breaker

**User Story:** Como desenvolvedor, eu quero integrar o Circuit Breaker em chamadas externas, para que o sistema previna cascata de falhas quando serviços externos estão indisponíveis.

#### Acceptance Criteria

1. WHEN uma chamada externa é feita, THE Circuit_Breaker SHALL executar a chamada através do circuit breaker
2. WHEN uma chamada externa falha 5 vezes consecutivas, THE Circuit_Breaker SHALL abrir o circuito
3. WHILE o circuito está aberto, THE Circuit_Breaker SHALL rejeitar novas chamadas imediatamente sem executá-las
4. WHEN o circuito está aberto por 30 segundos, THE Circuit_Breaker SHALL transicionar para estado half-open
5. WHILE o circuito está half-open, THE Circuit_Breaker SHALL permitir uma chamada de teste
6. IF a chamada de teste no estado half-open é bem-sucedida, THEN THE Circuit_Breaker SHALL fechar o circuito
7. IF a chamada de teste no estado half-open falha, THEN THE Circuit_Breaker SHALL reabrir o circuito
8. THE Circuit_Breaker SHALL registrar métricas de estado (open, closed, half-open) e número de falhas
9. FOR ALL operações, executar através do circuit breaker quando o circuito está fechado SHALL produzir o mesmo resultado que executar diretamente (propriedade de transparência)

### Requirement 6: Integração do Rate Limiting por Tenant

**User Story:** Como desenvolvedor, eu quero integrar rate limiting por tenant nos controllers, para que cada tenant seja limitado baseado no seu plano e não afete outros tenants.

#### Acceptance Criteria

1. WHEN uma requisição é recebida, THE Rate_Limiter SHALL verificar o limite do tenant baseado no plano (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
2. WHEN o limite do tenant não foi excedido, THE Rate_Limiter SHALL permitir a requisição
3. WHEN o limite do tenant foi excedido, THE Rate_Limiter SHALL rejeitar a requisição com status 429 Too Many Requests
4. WHEN o limite do tenant foi excedido, THE Rate_Limiter SHALL incluir header Retry-After com tempo em segundos até o reset
5. THE Rate_Limiter SHALL aplicar limite de 10 req/min e 100 req/hora para plano FREE
6. THE Rate_Limiter SHALL aplicar limite de 60 req/min e 1000 req/hora para plano STARTER
7. THE Rate_Limiter SHALL aplicar limite de 300 req/min e 10000 req/hora para plano PROFESSIONAL
8. THE Rate_Limiter SHALL aplicar limite de 1000 req/min e 100000 req/hora para plano ENTERPRISE
9. THE Rate_Limiter SHALL resetar contadores de minuto a cada 60 segundos
10. THE Rate_Limiter SHALL resetar contadores de hora a cada 3600 segundos
11. FOR ALL tenants, a soma de requisições permitidas em uma janela de tempo SHALL ser menor ou igual ao limite configurado (propriedade de invariante)

### Requirement 7: Integração de Métricas de Negócio

**User Story:** Como engenheiro de operações, eu quero integrar coleta de métricas nos serviços críticos, para que eu possa monitorar performance e identificar problemas rapidamente.

#### Acceptance Criteria

1. WHEN um PDF é gerado com sucesso, THE Metrics_Service SHALL registrar métrica pdf_generated com companyId e duração
2. WHEN a geração de PDF falha, THE Metrics_Service SHALL registrar métrica pdf_error com companyId e mensagem de erro
3. WHEN uma requisição HTTP é processada, THE Metrics_Service SHALL registrar métrica api_request com método, path, status code e duração
4. WHEN uma requisição HTTP falha, THE Metrics_Service SHALL registrar métrica api_error com método, path e erro
5. WHEN uma query de banco de dados é executada, THE Metrics_Service SHALL registrar métrica db_query com query, duração e sucesso
6. WHEN uma conexão é aberta, THE Metrics_Service SHALL registrar métrica connection_opened com tipo (database, redis, external)
7. WHEN uma conexão é fechada, THE Metrics_Service SHALL registrar métrica connection_closed com tipo
8. THE Metrics_Service SHALL expor todas as métricas no formato Prometheus em endpoint /metrics
9. THE Metrics_Service SHALL incluir labels (companyId, method, path, status) em todas as métricas relevantes
10. FOR ALL métricas de duração, a duração registrada SHALL ser maior ou igual a zero (propriedade de invariante)

### Requirement 8: Integração de Logging Estruturado

**User Story:** Como engenheiro de operações, eu quero integrar logging estruturado em formato JSON, para que eu possa fazer queries eficientes nos logs e correlacionar eventos por requestId.

#### Acceptance Criteria

1. WHEN uma requisição HTTP é recebida, THE Structured_Logger SHALL gerar um requestId único
2. WHEN um log é gerado, THE Structured_Logger SHALL incluir timestamp, level, requestId, service, context e message
3. WHEN um log é gerado, THE Structured_Logger SHALL formatar em JSON válido
4. WHEN um erro ocorre, THE Structured_Logger SHALL incluir stack trace no campo metadata
5. THE Structured_Logger SHALL suportar níveis de log: DEBUG, INFO, WARN, ERROR
6. THE Structured_Logger SHALL incluir o requestId em todos os logs da mesma requisição
7. THE Structured_Logger SHALL incluir metadata adicional quando fornecido (userId, companyId, etc)
8. FOR ALL logs de uma mesma requisição, o requestId SHALL ser idêntico (propriedade de invariante)
9. FOR ALL logs, fazer parse do JSON e serializar novamente SHALL produzir JSON equivalente (propriedade round-trip)

### Requirement 9: Criação de Dashboards de Monitoramento

**User Story:** Como engenheiro de operações, eu quero criar dashboards no Grafana, para que eu possa visualizar métricas críticas em tempo real.

#### Acceptance Criteria

1. THE System SHALL criar Dashboard de Uptime mostrando disponibilidade do sistema
2. THE System SHALL criar Dashboard de Taxa de Erro mostrando porcentagem de requisições com erro
3. THE System SHALL criar Dashboard de Latência mostrando P50, P95 e P99
4. THE System SHALL criar Dashboard de Throughput mostrando requisições por segundo
5. THE System SHALL criar Dashboard de Recursos mostrando uso de CPU, memória e disco
6. THE System SHALL criar Dashboard de Conexões mostrando conexões ativas de database e Redis
7. WHEN uma métrica é atualizada, THE Dashboard SHALL refletir o novo valor em até 15 segundos
8. THE System SHALL configurar refresh automático dos dashboards a cada 10 segundos

### Requirement 10: Configuração de Alertas

**User Story:** Como engenheiro de operações, eu quero configurar alertas no Prometheus, para que eu seja notificado quando métricas críticas ultrapassarem thresholds.

#### Acceptance Criteria

1. WHEN taxa de erro ultrapassa 1%, THE System SHALL disparar Alert de severidade HIGH
2. WHEN P95_Latency ultrapassa 500ms, THE System SHALL disparar Alert de severidade MEDIUM
3. WHEN uptime cai abaixo de 99%, THE System SHALL disparar Alert de severidade CRITICAL
4. WHEN uso de memória ultrapassa 80%, THE System SHALL disparar Alert de severidade MEDIUM
5. WHEN uso de disco ultrapassa 85%, THE System SHALL disparar Alert de severidade HIGH
6. WHEN conexões de database ultrapassam 80% do pool, THE System SHALL disparar Alert de severidade MEDIUM
7. THE System SHALL incluir runbook URL em cada Alert para guiar resposta
8. THE System SHALL incluir valores atuais e thresholds em cada Alert
9. WHEN um Alert é disparado e a condição persiste por 5 minutos, THE System SHALL enviar notificação

### Requirement 11: Validação de Performance

**User Story:** Como engenheiro de qualidade, eu quero validar que o sistema atende aos targets de performance do SLA, para que eu possa garantir qualidade de serviço aos clientes.

#### Acceptance Criteria

1. WHEN o sistema está sob carga normal (100 usuários), THE System SHALL manter P95_Latency de API abaixo de 200ms
2. WHEN o sistema está sob carga normal (100 usuários), THE System SHALL manter P95_Latency de queries de database abaixo de 100ms
3. WHEN o sistema está sob carga normal (100 usuários), THE System SHALL manter P95_Latency de geração de PDF abaixo de 5 segundos
4. WHEN o sistema está sob carga normal (100 usuários), THE System SHALL manter taxa de erro abaixo de 0.1%
5. WHEN o sistema está sob carga de stress (1000 usuários), THE System SHALL manter taxa de erro abaixo de 10%
6. THE System SHALL processar pelo menos 100 requisições por segundo
7. THE System SHALL suportar pelo menos 5000 usuários concorrentes
8. FOR ALL testes de performance, aumentar a carga gradualmente e depois diminuir SHALL retornar as métricas aos valores baseline (propriedade de recuperação)

### Requirement 12: Validação de Observabilidade

**User Story:** Como engenheiro de operações, eu quero validar que a observabilidade está funcionando corretamente, para que eu possa confiar nos dados para troubleshooting.

#### Acceptance Criteria

1. WHEN uma requisição HTTP é feita, THE System SHALL registrar trace completo no Jaeger com todos os spans
2. WHEN uma requisição HTTP é feita, THE System SHALL registrar métricas no Prometheus
3. WHEN uma requisição HTTP é feita, THE System SHALL registrar log estruturado com requestId
4. WHEN um erro ocorre, THE System SHALL correlacionar trace, métrica e log usando requestId
5. THE System SHALL manter traces por pelo menos 7 dias
6. THE System SHALL manter métricas por pelo menos 30 dias
7. THE System SHALL manter logs por pelo menos 30 dias
8. WHEN uma query é feita no Jaeger por requestId, THE System SHALL retornar o trace completo em menos de 2 segundos
9. WHEN uma query é feita no Prometheus, THE System SHALL retornar resultados em menos de 5 segundos
10. FOR ALL requisições, o requestId no trace, nas métricas e nos logs SHALL ser idêntico (propriedade de correlação)

### Requirement 13: Documentação de Resultados

**User Story:** Como gerente de projeto, eu quero documentar os resultados da implementação, para que eu possa reportar progresso e identificar próximos passos.

#### Acceptance Criteria

1. WHEN a implementação é concluída, THE System SHALL documentar status de cada fase (Instalação, Configuração, Integração, Validação)
2. WHEN a implementação é concluída, THE System SHALL documentar resultados dos testes de carga (throughput, latência, taxa de erro)
3. WHEN a implementação é concluída, THE System SHALL documentar resultados do DR_Test (duração, tabelas, índices, registros)
4. WHEN a implementação é concluída, THE System SHALL documentar métricas de observabilidade (traces coletados, métricas registradas, logs gerados)
5. WHEN a implementação é concluída, THE System SHALL documentar problemas encontrados e soluções aplicadas
6. WHEN a implementação é concluída, THE System SHALL documentar próximos passos para Semana 2
7. THE System SHALL incluir screenshots dos dashboards do Grafana
8. THE System SHALL incluir exemplos de traces do Jaeger
9. THE System SHALL incluir exemplos de logs estruturados

## Special Requirements Notes

### Parser and Serializer Requirements

Este sistema inclui parsing e serialização de dados em múltiplos formatos:

**JSON Logs (Structured Logger):**
- Parser: JSON.parse() para processar logs estruturados
- Serializer: JSON.stringify() para gerar logs
- Round-trip requirement: Incluído no Requirement 8, Acceptance Criteria 9

**Métricas Prometheus:**
- Serializer: Formato de texto Prometheus para expor métricas
- Parser: Prometheus scraper para coletar métricas
- Validação: Métricas devem seguir naming conventions do Prometheus

**Traces OpenTelemetry:**
- Serializer: Formato Jaeger Thrift para exportar traces
- Parser: Jaeger backend para processar traces
- Validação: Spans devem ter parent-child relationships corretos

### Testability Notes

Todos os requisitos são testáveis através de:
- Testes de integração (instalação, configuração)
- Testes de carga (performance, escalabilidade)
- Testes de resiliência (circuit breaker, rate limiting)
- Testes de observabilidade (traces, métricas, logs)
- Testes de disaster recovery (backup, restore)

### Correctness Properties Summary

1. **Invariantes:**
   - Rate limiting: soma de requisições ≤ limite
   - Métricas: duração ≥ 0
   - Logs: requestId consistente por requisição
   - Correlação: requestId idêntico em trace/métrica/log

2. **Round-trip:**
   - Logs: parse(stringify(log)) == log
   - Backup: restore(backup(db)) == db

3. **Idempotência:**
   - Circuit breaker: executar quando fechado = executar diretamente
   - Alertas: disparar múltiplas vezes com mesma condição = mesmo alerta

4. **Metamórficas:**
   - Load test: variação entre execuções < 20%
   - Performance: aumentar e diminuir carga = retornar ao baseline

5. **Condições de Erro:**
   - Circuit breaker: falhas consecutivas → circuito aberto
   - Rate limiting: exceder limite → 429 Too Many Requests
   - DR test: backup inválido → erro com mensagem descritiva

