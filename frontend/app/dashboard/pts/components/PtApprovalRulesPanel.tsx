'use client';

import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { PtApprovalRules } from '@/services/ptsService';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type PtApprovalRulesPanelProps = {
  rules: PtApprovalRules | null;
  loading?: boolean;
};

const approvalRuleItems: Array<{
  key: keyof PtApprovalRules;
  label: string;
  description: string;
}> = [
  {
    key: 'blockCriticalRiskWithoutEvidence',
    label: 'Risco crítico exige evidência',
    description:
      'Bloqueia a aprovação quando o risco residual crítico não possui evidência de controle.',
  },
  {
    key: 'blockWorkerWithoutValidMedicalExam',
    label: 'ASO válido obrigatório',
    description:
      'Impede liberar a atividade quando responsável ou executantes estão com ASO inválido, ausente ou vencido.',
  },
  {
    key: 'blockWorkerWithExpiredBlockingTraining',
    label: 'Treinamento crítico em dia',
    description:
      'Bloqueia a permissão quando algum trabalhador tem treinamento bloqueante vencido.',
  },
  {
    key: 'requireAtLeastOneExecutante',
    label: 'Executante obrigatório',
    description:
      'Exige ao menos um executante vinculado antes da liberação formal da PT.',
  },
];

export function PtApprovalRulesPanel({
  rules,
  loading = false,
}: PtApprovalRulesPanelProps) {
  const enabledRules = approvalRuleItems.filter((rule) => rules?.[rule.key]);

  return (
    <Card tone="muted" padding="md" className="border-[color:var(--ds-color-info)]/20 bg-[color:var(--ds-color-info-subtle)]/25">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--ds-color-info)]" />
          <CardTitle className="text-sm uppercase tracking-[0.16em] text-[var(--ds-color-info)]">
            Política de aprovação da empresa
          </CardTitle>
        </div>
        <CardDescription>
          Estas regras são aplicadas no backend no momento da liberação final da PT.
        </CardDescription>
      </CardHeader>

      <CardContent className="mt-0 space-y-3">
        {loading ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
            Carregando regras de aprovação da empresa...
          </div>
        ) : null}

        {!loading && enabledRules.length === 0 ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
            Nenhuma regra extra de bloqueio foi identificada para esta empresa no momento.
          </div>
        ) : null}

        {!loading && enabledRules.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {enabledRules.map((rule) => (
                <Badge key={rule.key} variant="info">
                  {rule.label}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {enabledRules.map((rule) => (
                <div
                  key={rule.key}
                  className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40 px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    <ShieldAlert className="h-4 w-4 text-[var(--ds-color-warning)]" />
                    {rule.label}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--ds-color-text-secondary)]">
                    {rule.description}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
