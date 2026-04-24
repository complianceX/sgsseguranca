"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  ddsService,
  type Dds,
  type DdsApprovalFlow,
  type DdsApprovalStep,
} from "@/services/ddsService";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";

type DdsApprovalPanelProps = {
  dds: Dds | null;
  canManage: boolean;
  onDdsChanged?: (dds: Dds) => void;
};

const FLOW_LABEL: Record<DdsApprovalFlow["status"], string> = {
  not_started: "Não iniciado",
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
  canceled: "Cancelado",
};

const FLOW_TONE: Record<DdsApprovalFlow["status"], StatusTone> = {
  not_started: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  canceled: "neutral",
};

const STEP_LABEL: Record<DdsApprovalStep["status"], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
  canceled: "Cancelado",
  reopened: "Reaberto",
};

const STEP_TONE: Record<DdsApprovalStep["status"], StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  canceled: "neutral",
  reopened: "info",
};

export function DdsApprovalPanel({
  dds,
  canManage,
  onDdsChanged,
}: DdsApprovalPanelProps) {
  const [flow, setFlow] = useState<DdsApprovalFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");

  const ddsId = dds?.id;
  const locked = Boolean(
    !ddsId ||
    dds?.is_modelo ||
    dds?.pdf_file_key ||
    dds?.status === "rascunho" ||
    dds?.status === "auditado" ||
    dds?.status === "arquivado",
  );

  const lockMessage = useMemo(() => {
    if (!ddsId) return "Salve o DDS antes de iniciar aprovações.";
    if (dds?.is_modelo) return "Modelos não possuem aprovação operacional.";
    if (dds?.pdf_file_key) return "PDF final emitido: fluxo travado.";
    if (dds?.status === "rascunho") return "Publique o DDS antes da aprovação.";
    if (dds?.status === "auditado") return "DDS auditado: aprovação concluída.";
    if (dds?.status === "arquivado") return "DDS arquivado: fluxo encerrado.";
    return null;
  }, [dds, ddsId]);

  const loadFlow = useCallback(async () => {
    if (!ddsId) return;
    try {
      setLoading(true);
      setFlow(await ddsService.getApprovalFlow(ddsId));
    } catch (error) {
      console.error("Erro ao carregar aprovações DDS:", error);
      toast.error("Não foi possível carregar o fluxo de aprovação do DDS.");
    } finally {
      setLoading(false);
    }
  }, [ddsId]);

  useEffect(() => {
    void loadFlow();
  }, [loadFlow]);

  const refreshDds = useCallback(async () => {
    if (!ddsId || !onDdsChanged) return;
    try {
      onDdsChanged(await ddsService.findOne(ddsId));
    } catch {
      // O painel já foi atualizado; falha de refresh do cabeçalho não bloqueia.
    }
  }, [ddsId, onDdsChanged]);

  const initialize = async () => {
    if (!ddsId) return;
    try {
      setDeciding(true);
      const next = await ddsService.initializeApprovalFlow(ddsId);
      setFlow(next);
      toast.success("Fluxo de aprovação DDS iniciado.");
    } catch (error) {
      console.error("Erro ao iniciar aprovação DDS:", error);
      toast.error("Não foi possível iniciar a aprovação do DDS.");
    } finally {
      setDeciding(false);
    }
  };

  const approve = async () => {
    if (!ddsId || !flow?.currentStep?.pending_record_id) return;
    if (!/^\d{4,6}$/.test(pin.trim())) {
      toast.error("Informe o PIN com 4 a 6 dígitos para assinar a decisão.");
      return;
    }
    try {
      setDeciding(true);
      const next = await ddsService.approveApprovalStep(
        ddsId,
        flow.currentStep.pending_record_id,
        { reason: reason.trim() || undefined, pin: pin.trim() },
      );
      setFlow(next);
      setReason("");
      setPin("");
      await refreshDds();
      toast.success("Etapa aprovada.");
    } catch (error) {
      console.error("Erro ao aprovar DDS:", error);
      toast.error("Não foi possível aprovar a etapa atual.");
    } finally {
      setDeciding(false);
    }
  };

  const reject = async () => {
    if (!ddsId || !flow?.currentStep?.pending_record_id) return;
    if (reason.trim().length < 10) {
      toast.error("Informe um motivo com pelo menos 10 caracteres.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin.trim())) {
      toast.error("Informe o PIN com 4 a 6 dígitos para assinar a decisão.");
      return;
    }
    try {
      setDeciding(true);
      const next = await ddsService.rejectApprovalStep(
        ddsId,
        flow.currentStep.pending_record_id,
        { reason: reason.trim(), pin: pin.trim() },
      );
      setFlow(next);
      setReason("");
      setPin("");
      toast.warning("DDS reprovado nesta etapa.");
    } catch (error) {
      console.error("Erro ao reprovar DDS:", error);
      toast.error("Não foi possível reprovar a etapa atual.");
    } finally {
      setDeciding(false);
    }
  };

  const reopen = async () => {
    if (!ddsId) return;
    if (reason.trim().length < 10) {
      toast.error(
        "Informe um motivo de reabertura com pelo menos 10 caracteres.",
      );
      return;
    }
    if (!/^\d{4,6}$/.test(pin.trim())) {
      toast.error("Informe o PIN com 4 a 6 dígitos para assinar a decisão.");
      return;
    }
    try {
      setDeciding(true);
      const next = await ddsService.reopenApprovalFlow(ddsId, {
        reason: reason.trim(),
        pin: pin.trim(),
      });
      setFlow(next);
      setReason("");
      setPin("");
      toast.success("Fluxo de aprovação reaberto em novo ciclo.");
    } catch (error) {
      console.error("Erro ao reabrir aprovação DDS:", error);
      toast.error("Não foi possível reabrir o fluxo de aprovação.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <section className="sst-card space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
            Aprovação e Governança
          </h2>
          <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
            Fluxo técnico → liderança → administração, com eventos encadeados
            por hash.
          </p>
        </div>
        <StatusPill tone={flow ? FLOW_TONE[flow.status] : "neutral"}>
          {loading
            ? "Carregando"
            : flow
              ? FLOW_LABEL[flow.status]
              : "Sem fluxo"}
        </StatusPill>
      </div>

      {lockMessage ? (
        <div className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/45 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
          {lockMessage}
        </div>
      ) : null}

      {!loading && flow?.steps.length ? (
        <div className="space-y-3">
          {flow.steps.map((step) => (
            <div
              key={`${flow.activeCycle}-${step.level_order}`}
              className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {step.level_order}. {step.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                    Papel esperado: {step.approver_role}
                  </p>
                </div>
                <StatusPill tone={STEP_TONE[step.status]}>
                  {STEP_LABEL[step.status]}
                </StatusPill>
              </div>
              {step.event_hash ? (
                <p className="mt-2 text-[11px] text-[var(--ds-color-text-muted)]">
                  Hash do evento: {step.event_hash.slice(0, 16)}...
                </p>
              ) : null}
              {step.actor_signature_hash ? (
                <p className="mt-1 text-[11px] text-[var(--ds-color-text-muted)]">
                  Assinatura HMAC: {step.actor_signature_hash.slice(0, 16)}...
                </p>
              ) : null}
              {step.actor_signature_signed_at ? (
                <p className="mt-1 text-[11px] text-[var(--ds-color-text-muted)]">
                  Assinado em:{" "}
                  {new Date(step.actor_signature_signed_at).toLocaleString(
                    "pt-BR",
                  )}
                </p>
              ) : null}
              {step.actor_signature_timestamp_authority ? (
                <p className="mt-1 text-[11px] text-[var(--ds-color-text-muted)]">
                  Autoridade temporal:{" "}
                  {step.actor_signature_timestamp_authority}
                </p>
              ) : null}
              {step.decision_reason ? (
                <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                  Motivo: {step.decision_reason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!flow?.steps.length && !loading ? (
        <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-6 text-center text-sm text-[var(--ds-color-text-muted)]">
          Nenhum fluxo de aprovação iniciado para este DDS.
        </div>
      ) : null}

      {canManage ? (
        <div className="space-y-3">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            aria-label="Motivo da decisão do fluxo de aprovação do DDS"
            className="w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-action-primary)] focus:outline-none"
            placeholder="Motivo opcional para aprovação; obrigatório para reprovação ou reabertura."
            disabled={locked || deciding}
          />
          <input
            type="password"
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            maxLength={6}
            aria-label="PIN para assinatura da decisão DDS"
            className="w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-action-primary)] focus:outline-none"
            placeholder="PIN de assinatura do aprovador (4 a 6 dígitos)"
            disabled={locked || deciding}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              loading={deciding && flow?.status === "not_started"}
              disabled={locked || deciding || flow?.status !== "not_started"}
              onClick={initialize}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
            >
              Iniciar aprovação
            </Button>
            <Button
              type="button"
              variant="success"
              loading={deciding && flow?.status === "pending"}
              disabled={locked || deciding || !flow?.currentStep}
              onClick={approve}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Aprovar etapa
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={locked || deciding || !flow?.currentStep}
              onClick={reject}
              leftIcon={<XCircle className="h-4 w-4" />}
            >
              Reprovar
            </Button>
            <Button
              type="button"
              variant="warning"
              disabled={locked || deciding || flow?.status !== "rejected"}
              onClick={reopen}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              Reabrir ciclo
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
