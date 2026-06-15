# State Machines — SGS Segurança

> Máquinas de estado de todas as entidades do sistema.
> Status, transições, guardas, permissões e endpoints.

---

## APR — Análise Preliminar de Risco

```
                    ┌─────────┐
                    │PENDENTE │
                    └────┬────┘
                  ┌──────┼──────┐
                  ▼      ▼      ▼
             ┌────────┐ ┌──────────┐
             │APROVADA│ │CANCELADA │ (terminal)
             └───┬────┘ └──────────┘
           ┌─────┼─────┐
           ▼     ▼     ▼
      ┌────────┐ ┌──────────┐
      │ENCERRADA│ │CANCELADA │ (terminal)
      └─────────┘ └──────────┘
```

| Transição | Endpoint | Permissão | Condições |
|-----------|----------|-----------|-----------|
| Pendente → Aprovada | `PATCH :id/approve` | `can_approve_apr` | ≥1 participante, ≥1 risk item com atividade/agente/medidas; workflow steps aprovados sequencialmente |
| Pendente → Cancelada | `PATCH :id/reject` | `can_reject_apr` | Motivo ≥10 caracteres |
| Aprovada → Encerrada | `PATCH :id/finalize` | `can_finalize_apr` | Status deve ser Aprovada |
| Aprovada → Cancelada | `PATCH :id/reject` | `can_reject_apr` | Mesmas regras de rejeição |
| Qualquer → edição | `PATCH :id` | — | Só permitido em Pendente e sem workflow iniciado |

### Sub-status: AprApprovalStep
```
PENDING → [APPROVED, REJECTED, SKIPPED]
```
3 níveis default: TST → Supervisor → Admin Empresa. Sequencial: se um rejeita, próximos são SKIPPED.

---

## DDS — Diálogo Diário de Segurança

```
                    ┌─────────┐
                    │RASCUNHO │
                    └────┬────┘
                  ┌──────┼──────┐
                  ▼      ▼      ▼
             ┌────────┐ ┌──────────┐
             │PUBLICADO│ │ARQUIVADO│ (terminal)
             └───┬────┘ └──────────┘
                 │
                 ▼
             ┌────────┐
             │AUDITADO│
             └───┬────┘
                 ▼
             ┌──────────┐
             │ARQUIVADO │ (terminal)
             └──────────┘
```

| Transição | Endpoint | Condições |
|-----------|----------|-----------|
| Rascunho → Publicado | `PATCH :id/status` | Modelos não podem ser publicados |
| Rascunho → Arquivado | `PATCH :id/status` | — |
| Publicado → Arquivado | `PATCH :id/status` | — |
| Publicado → Auditado | `PATCH :id/audit` | Aprovação concluída + auditado_por + resultado preenchidos |
| Auditado → Arquivado | `PATCH :id/status` | — |

### Sub-status: DDS Approval Record
```
PENDING → [APPROVED, REJECTED, CANCELED, REOPENED]
```
Multi-ciclo com hash chain (`event_hash` + `previous_event_hash`).

---

## PT — Permissão de Trabalho

```
                    ┌─────────┐
                    │PENDENTE │
                    └────┬────┘
                  ┌──────┼──────┐
                  ▼      ▼      ▼
             ┌────────┐ ┌──────────┐
             │APROVADA│ │CANCELADA │ (terminal)
             └───┬────┘ └──────────┘
           ┌─────┼─────┐
           ▼     ▼     ▼
      ┌────────┐ ┌──────────┐
      │ENCERRADA│ │CANCELADA │ (terminal)
      └─────────┘ └──────────┘
           ▲
           │
      ┌────────┐
      │EXPIRADA│
      └────────┘
```

| Transição | Endpoint | Condições |
|-----------|----------|-----------|
| Pendente → Aprovada | `POST :id/approve` | Risco residual crítico exige evidência; ≥1 executante; assinaturas dos executantes; sem treinamentos vencidos bloqueantes; exames OK |
| Pendente → Cancelada | `POST :id/reject` | Motivo obrigatório |
| Aprovada → Encerrada | `POST :id/finalize` | — |
| Aprovada → Cancelada | `POST :id/reject` | — |
| Expirada → Encerrada | Job automático | Sistema |

---

## ARR — Análise de Risco de Rotina

```
RASCUNHO → ANALISADA → TRATADA → ARQUIVADA
    │          │          │
    └──────────┴──────────┘
              (qualquer → ARQUIVADA)
```

---

## DID — Diálogo Inicial de Desenvolvimento

```
RASCUNHO → ALINHADO → EXECUTADO → ARQUIVADO
    │         │           │
    └─────────┴───────────┘
```

---

## RDO — Relatório Diário de Obras

```
RASCUNHO → ENVIADO → APROVADO
    │        │
    └────────┴──────→ CANCELADO
```

Cancelável de qualquer estado (rascunho, enviado, aprovado → cancelado).

---

## NonConformities

```
ABERTA ←─────────────┐
   │                  │
   ▼                  │
EM_ANDAMENTO          │
   │                  │
   ▼                  │
AGUARDANDO_VALIDACAO  │
   │                  │
   ▼                  │
ENCERRADA ────────────┘
(ENCERRADA pode reabrir para ABERTA)
```

---

## CAT — Comunicação de Acidente de Trabalho

```
ABERTA → INVESTIGACAO → FECHADA
   │                    ▲
   └────────────────────┘
```

---

## Corrective Actions

```
OPEN → IN_PROGRESS → DONE
  │        │
  ▼        ▼
OVERDUE (automático se due_date passou)
  │
  ▼
CANCELLED
```

Escalação automática: `escalation_level` incrementa quando overdue.

---

## Service Orders

```
ATIVO → CONCLUIDO
   │
   ▼
CANCELADO
```

---

## Photographic Reports

```
RASCUNHO → AGUARDANDO_FOTOS → AGUARDANDO_ANALISE → ANALISADO → FINALIZADO → EXPORTADO
   │           │                  │                   │
   └───────────┴──────────────────┴───────────────────┘
CANCELADO (qualquer estado)
EM_EDICAO (retorna do ANALISADO para edição)
```

---

## EPI Assignments

```
ENTREGUE → DEVOLVIDO
   │
   ▼
SUBSTITUIDO
```

---

## Document Import Pipeline

```
UPLOADED → QUEUED → PROCESSING → INTERPRETING → VALIDATING → COMPLETED
                                                             → FAILED
                                                             → DEAD_LETTER
```

---

## Privacy Requests (LGPD)

```
OPEN → IN_REVIEW → WAITING_CONTROLLER → FULFILLED
  │                                    → REJECTED
  └──→ CANCELLED
```

---

## Company Account

```
TRIALING → ACTIVE → SUSPENDED → CANCELLED
   │         │         │
   ▼         ▼         ▼
TRIAL_EXPIRED
```

---

## Checklist

Status computado dos itens:
- `Pendente` — nenhum item respondido
- `Conforme` — todos itens conformes
- `Não Conforme` — qualquer item não conforme

Barriers por tópico: `integra` → `degradada` → `rompida`
