'use client';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  PtPreApprovalHistoryEntry,
  PtPreApprovalChecklistPayload,
} from '@/services/ptsService';
import type { User } from '@/services/usersService';

type PtPreApprovalHistoryPanelProps = {
  entries: PtPreApprovalHistoryEntry[];
  users: User[];
  loading?: boolean;
};

export function PtPreApprovalHistoryPanel({
  entries,
  users,
  loading = false,
}: PtPreApprovalHistoryPanelProps) {
  const usersById = new Map(users.map((user) => [user.id, user.nome]));

  return (
    <Card tone="muted" padding="md">
      <CardHeader className="gap-2">
        <CardTitle className="text-sm uppercase tracking-[0.16em]">
          Histórico auditável da pré-liberação
        </CardTitle>
        <CardDescription>
          Revisões registradas antes da aprovação final da PT, com snapshot dos bloqueios e confirmações do aprovador.
        </CardDescription>
      </CardHeader>

      <CardContent className="mt-0 space-y-3">
        {loading ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
            Carregando histórico de pré-liberação...
          </div>
        ) : null}

        {!loading && entries.length === 0 ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
            Nenhuma pré-liberação auditável foi registrada para esta PT ainda.
          </div>
        ) : null}

        {!loading &&
          entries.map((entry) => {
            const actorName = entry.userId
              ? usersById.get(entry.userId) || `Usuário ${entry.userId.slice(0, 8)}`
              : 'Usuário não identificado';

            return (
              <div
                key={entry.id}
                className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.stage === 'approval_requested' ? 'success' : 'info'}>
                        {entry.stage === 'approval_requested'
                          ? 'Pedido de aprovação'
                          : 'Pré-liberação'}
                      </Badge>
                      <Badge variant={entry.readyForRelease ? 'success' : 'warning'}>
                        {entry.readyForRelease ? 'Pronta para liberar' : 'Com bloqueios'}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {actorName}
                    </p>
                    <p className="text-sm text-[var(--ds-color-text-secondary)]">
                      {format(new Date(entry.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Metric label="Sem resposta" value={entry.unansweredChecklistItems} />
                    <Metric label="Críticas" value={entry.adverseChecklistItems} />
                    <Metric label="Assinaturas" value={entry.pendingSignatures} />
                    <Metric
                      label="Risco rápido"
                      value={entry.hasRapidRiskBlocker ? 'Ação' : 'OK'}
                    />
                  </div>
                </div>

                {entry.blockers.length > 0 ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {entry.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[var(--ds-radius-md)] border border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success)]/10 px-3 py-2 text-sm text-[var(--ds-color-success)]">
                    Nenhum bloqueio crítico registrado nesta revisão.
                  </div>
                )}

                {entry.checklist ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                      Checklist final do aprovador
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {renderChecklistBadge(
                        'Prontidão revisada',
                        entry.checklist.reviewedReadiness,
                      )}
                      {renderChecklistBadge(
                        'Equipe revisada',
                        entry.checklist.reviewedWorkers,
                      )}
                      {renderChecklistBadge(
                        'Confirmação final',
                        entry.checklist.confirmedRelease,
                      )}
                    </div>
                  </div>
                ) : null}

                {entry.warnings.length > 0 ? (
                  <div className="mt-4 rounded-[var(--ds-radius-md)] border border-[color:var(--ds-color-warning)]/30 bg-[color:var(--ds-color-warning)]/10 px-3 py-2 text-sm text-[var(--ds-color-warning)]">
                    {entry.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2 text-[var(--ds-color-text-primary)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function renderChecklistBadge(
  label: string,
  checked: PtPreApprovalChecklistPayload[keyof PtPreApprovalChecklistPayload],
) {
  return (
    <Badge variant={checked ? 'success' : 'warning'}>
      {label}: {checked ? 'OK' : 'Pendente'}
    </Badge>
  );
}
