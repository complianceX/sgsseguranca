# 📋 Service Level Agreement (SLA) - Wanderson Gandra

## 1. DISPONIBILIDADE

### Targets
| Plano | Uptime | Downtime Permitido/Mês |
|---|---|---|
| **FREE** | 99.0% | ~7.2 horas |
| **STARTER** | 99.5% | ~3.6 horas |
| **PROFESSIONAL** | 99.9% | ~43 minutos |
| **ENTERPRISE** | 99.95% | ~22 minutos |

### Medição
- Medida a cada minuto
- Baseada em health checks HTTP
- Excluindo manutenção planejada
- Excluindo problemas do cliente

### Créditos por Violação
| Downtime | Crédito |
|---|---|
| 99.0% - 99.5% | 5% do mês |
| 98.5% - 99.0% | 10% do mês |
| 98.0% - 98.5% | 25% do mês |
| < 98.0% | 100% do mês |

---

## 2. PERFORMANCE

### Latência
| Métrica | Target | P95 | P99 |
|---|---|---|---|
| **API Response** | < 200ms | < 500ms | < 1000ms |
| **Database Query** | < 100ms | < 300ms | < 500ms |
| **PDF Generation** | < 5s | < 10s | < 15s |

### Taxa de Erro
| Métrica | Target |
|---|---|
| **API Errors (5xx)** | < 0.1% |
| **Database Errors** | < 0.05% |
| **Timeout Errors** | < 0.05% |

---

## 3. SUPORTE

### Tempo de Resposta
| Severidade | Resposta | Resolução |
|---|---|---|
| **P1 (Crítico)** | 15 min | 4 horas |
| **P2 (Alto)** | 1 hora | 8 horas |
| **P3 (Médio)** | 4 horas | 24 horas |
| **P4 (Baixo)** | 24 horas | 7 dias |

### Canais de Suporte
- Email: support@wanderson-gandra.com
- Slack: #support
- Phone: +55 (11) 9999-9999 (P1 only)

---

## 4. MANUTENÇÃO

### Janelas de Manutenção
- **Planejada:** Terças-feiras, 02:00-04:00 UTC
- **Duração máxima:** 2 horas
- **Frequência:** Máximo 1x por semana
- **Notificação:** 7 dias de antecedência

### Manutenção de Emergência
- Sem janela de manutenção
- Notificação imediata
- Máximo 1 hora de duração
- Máximo 2x por mês

---

## 5. SEGURANÇA

### Conformidade
- ✅ ISO 27001 (85-90% técnico)
- ✅ OWASP Top 10 mitigado
- ✅ Criptografia TLS 1.2+
- ✅ Auditoria imutável
- ✅ Backup diário

### Incidentes de Segurança
- Notificação dentro de 24 horas
- Investigação dentro de 48 horas
- Relatório dentro de 7 dias

---

## 6. BACKUP & DISASTER RECOVERY

### Backup
- **Frequência:** Diária
- **Retenção:** 30 dias
- **Teste:** Mensal
- **RTO:** 4 horas
- **RPO:** 24 horas

### Disaster Recovery
- **RTO:** 4 horas
- **RPO:** 24 horas
- **Teste:** Mensal
- **Documentação:** Atualizada

---

## 7. ESCALABILIDADE

### Capacidade Garantida
| Métrica | Capacidade |
|---|---|
| **Usuários Concorrentes** | 5.000 |
| **Requisições/segundo** | 1.000 |
| **Armazenamento** | 500GB |
| **Empresas** | 1.000 |

### Crescimento
- Notificação com 30 dias de antecedência
- Upgrade automático de recursos
- Sem downtime

---

## 8. EXCLUSÕES

O SLA não cobre:

1. **Problemas do Cliente**
   - Configuração incorreta
   - Uso indevido
   - Violação de termos

2. **Força Maior**
   - Desastres naturais
   - Ataques DDoS volumétricos
   - Problemas de ISP

3. **Manutenção Planejada**
   - Dentro da janela comunicada
   - Com notificação prévia

4. **Problemas de Terceiros**
   - Falha de provedores de cloud
   - Falha de CDN
   - Falha de DNS

---

## 9. MONITORAMENTO

### Métricas Públicas
- Status page: https://status.wanderson-gandra.com
- Atualizado a cada 5 minutos
- Histórico de 90 dias

### Relatórios
- Relatório mensal de SLA
- Relatório trimestral de performance
- Relatório anual de segurança

---

## 10. REVISÃO

Este SLA é revisado:
- Trimestralmente
- Após incidentes maiores
- Com feedback de clientes

**Última atualização:** 2026-02-24
**Próxima revisão:** 2026-05-24
