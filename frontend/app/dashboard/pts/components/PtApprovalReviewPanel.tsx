'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, ShieldAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PtApprovalRules } from '@/services/ptsService';
import { PtReadinessPanel } from './PtReadinessPanel';
import { buildPtEditFocusHref } from './pt-approval-focus';

export type PtApprovalWorkerReview = {
  userId: string;
  nome: string;
  roleLabel: string;
  blocked: boolean;
  reasons: string[];
  unavailable?: boolean;
};

export type PtApprovalReview = {
  readyForRelease: boolean;
  blockers: string[];
  unansweredChecklistItems: number;
  adverseChecklistItems: number;
  pendingSignatures: number;
  hasRapidRiskBlocker: boolean;
  workerStatuses: PtApprovalWorkerReview[];
  warnings: string[];
  rules: PtApprovalRules | null;
};

export type PtApprovalChecklistState = {
  reviewedReadiness: boolean;
  reviewedWorkers: boolean;
  confirmedRelease: boolean;
};

type PtApprovalReviewPanelProps = {
  ptId: string;
  review: PtApprovalReview;
  checklist: PtApprovalChecklistState;
  confirming: boolean;
  onChecklistChange: (
    key: keyof PtApprovalChecklistState,
    checked: boolean,
  ) => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

const approvalChecklistLabels: Array<{
  key: keyof PtApprovalChecklistState;
  label: string;
}> = [
  {
    key: 'reviewedReadiness',
    label:
      'Revisei riscos, checklists críticos, respostas adversas e ações corretivas antes da liberação.',
  },
  {
    key: 'reviewedWorkers',
    label:
      'Confirmei responsável, executantes, assinaturas mínimas e prontidão ocupacional da equipe.',
  },
  {
    key: 'confirmedRelease',
    label:
      'Estou ciente de que a aprovação final ainda será validada pelas regras da empresa no backend.',
  },
];

export function PtApprovalReviewPanel({
  ptId,
  review,
  checklist,
  confirming,
  onChecklistChange,
  onConfirm,
  onDismiss,
}: PtApprovalReviewPanelProps) {
  const activeRules = review.rules
    ? Object.entries(review.rules).filter(([, enabled]) => Boolean(enabled))
    : [];
  const checklistComplete = Object.values(checklist).every(Boolean);

  return (
    <Card tone="muted" padding="md" className="border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-action-primary)]/8">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
          <CardTitle className="text-sm uppercase tracking-[0.16em] text-[var(--ds-color-action-primary)]">
            Pré-liberação da PT
          </CardTitle>
        </div>
        <CardDescription>
          Revise os bloqueios e confirme os itens mínimos antes de aprovar a permissão.
        </CardDescription>
      </CardHeader>

      <CardContent className="mt-0 space-y-4">
        <PtReadinessPanel
          readyForRelease={review.readyForRelease}
          blockers={review.blockers}
          unansweredChecklistItems={review.unansweredChecklistItems}
          adverseChecklistItems={review.adverseChecklistItems}
          pendingSignatures={review.pendingSignatures}
          hasRapidRiskBlocker={review.hasRapidRiskBlocker}
        />

        {review.blockers.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Corrigir bloqueios na PT
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {review.blockers.map((blocker) => (
                <Link
                  key={blocker}
                  href={buildPtEditFocusHref(ptId, blocker)}
                  className="rounded-[var(--ds-radius-md)] border border-white/10 bg-black/10 px-3 py-3 text-sm text-[var(--ds-color-text-primary)] transition-all hover:border-[var(--ds-color-action-primary)]/40 hover:bg-white/8"
                >
                  <span className="block font-medium">{blocker}</span>
                  <span className="mt-2 block text-xs uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                    Abrir PT focada neste ponto
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {activeRules.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Regras ativas nesta empresa
            </p>
            <div className="flex flex-wrap gap-2">
              {activeRules.map(([key]) => (
                <Badge key={key} variant="info">
                  {formatApprovalRuleLabel(key as keyof PtApprovalRules)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {review.workerStatuses.length > 0 ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              <Users className="h-4 w-4" />
              Prontidão operacional da equipe
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {review.workerStatuses.map((worker) => (
                <div
                  key={`${worker.roleLabel}-${worker.userId}`}
                  className="rounded-[var(--ds-radius-lg)] border border-white/10 bg-black/10 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                        {worker.nome}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                        {worker.roleLabel}
                      </p>
                    </div>
                    <Badge variant={worker.blocked ? 'danger' : worker.unavailable ? 'warning' : 'success'}>
                      {worker.blocked
                        ? 'Bloqueado'
                        : worker.unavailable
                          ? 'Sem leitura'
                          : 'Apto'}
                    </Badge>
                  </div>
                  {worker.reasons.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-[var(--ds-color-text-secondary)]">
                      {worker.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--ds-color-text-secondary)]">
                      Sem bloqueios operacionais identificados nesta leitura.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {review.warnings.length > 0 ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {review.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        <div className="space-y-3 rounded-[var(--ds-radius-lg)] border border-white/10 bg-black/10 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
            <ShieldAlert className="h-4 w-4" />
            Checklist final do aprovador
          </p>

          <div className="space-y-3">
            {approvalChecklistLabels.map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 rounded-[var(--ds-radius-md)] border border-white/10 bg-white/5 px-3 py-3 text-sm text-[var(--ds-color-text-primary)]"
              >
                <input
                  type="checkbox"
                  checked={checklist[item.key]}
                  onChange={(event) =>
                    onChecklistChange(item.key, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              loading={confirming}
              disabled={!review.readyForRelease || !checklistComplete}
              onClick={onConfirm}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Aprovar PT agora
            </Button>
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Fechar pré-liberação
            </Button>
          </div>

          {!review.readyForRelease ? (
            <p className="text-sm text-[var(--ds-color-warning)]">
              Corrija os bloqueios acima antes de tentar a liberação final.
            </p>
          ) : null}
          {review.readyForRelease && !checklistComplete ? (
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              Marque os três itens do checklist final para habilitar a aprovação.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatApprovalRuleLabel(key: keyof PtApprovalRules) {
  switch (key) {
    case 'blockCriticalRiskWithoutEvidence':
      return 'Risco crítico exige evidência';
    case 'blockWorkerWithoutValidMedicalExam':
      return 'ASO válido obrigatório';
    case 'blockWorkerWithExpiredBlockingTraining':
      return 'Treinamento crítico em dia';
    case 'requireAtLeastOneExecutante':
      return 'Executante obrigatório';
    default:
      return key;
  }
}
