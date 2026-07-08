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
import { Card } from "@/components/ui/card";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { useApprovalWorkflow } from "@/hooks/useApprovalWorkflow";

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
  const { acting, execute } = useApprovalWorkflow();
  const [flow, setFlow] = useState<DdsApprovalFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | "reopen" | null>(null);

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
    await execute('approve', async () => {
      const next = await ddsService.initializeApprovalFlow(ddsId);
      setFlow(next);
      void refreshDds();
      toast.success("Fluxo de aprovação DDS iniciado.");
    }, 'Inicialização do fluxo');
  };

  const approve = async () => {
    if (!ddsId || !flow?.currentStep?.pending_record_id) return;
    if (!/^\d{4,6}$/.test(pin.trim())) {
      toast.error("Informe o PIN com 4 a 6 dígitos para assinar a decisão.");
      return;
    }
    // Solicitar confirmação antes de executar a aprovação
    setPendingAction("approve");
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
    // Solicitar confirmação antes de reprovar
    setPendingAction("reject");
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
    setPendingAction("reopen");
  };

  /** Executa a ação após confirmação do modal de segurança. */
  const confirmAction = async () => {
    if (!pendingAction || !ddsId) {
      setPendingAction(null);
      return;
    }
    const action = pendingAction;
    setPendingAction(null);

    if (action === "approve" && flow?.currentStep?.pending_record_id) {
      const pendingRecordId = flow.currentStep.pending_record_id;
      await execute("approve", async () => {
        const next = await ddsService.approveApprovalStep(
          ddsId,
          pendingRecordId,
          { reason: reason.trim() || undefined, pin: pin.trim() },
        );
        setFlow(next);
        setReason("");
        setPin("");
        void refreshDds();
        toast.success("Etapa aprovada com sucesso.");
      });
    } else if (action === "reject" && flow?.currentStep?.pending_record_id) {
      const pendingRecordId = flow.currentStep.pending_record_id;
      await execute("reject", async () => {
        const next = await ddsService.rejectApprovalStep(
          ddsId,
          pendingRecordId,
          { reason: reason.trim(), pin: pin.trim() },
        );
        setFlow(next);
        setReason("");
        setPin("");
        void refreshDds();
        toast.warning("DDS reprovado nesta etapa.");
      });
    } else if (action === "reopen") {
      await execute("reopen", async () => {
        const next = await ddsService.reopenApprovalFlow(ddsId, {
          reason: reason.trim(),
          pin: pin.trim(),
        });
        setFlow(next);
        setReason("");
        setPin("");
        void refreshDds();
        toast.success("Fluxo de aprovação reaberto em novo ciclo.");
      });
    }
  };

  return (
    <Card tone="default" padding="lg" className="space-y-4">
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
        <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/45 px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
          {lockMessage}
        </div>
      ) : null}

      {!loading && flow?.steps.length ? (
        <div className="space-y-3">
          {flow.steps.map((step) => (
            <div
              key={`${flow.activeCycle}-${step.level_order}`}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3"
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
                <p className="mt-2 text-xs text-[var(--ds-color-text-muted)]">
                  Hash do evento: {step.event_hash.slice(0, 16)}...
                </p>
              ) : null}
              {step.actor_signature_hash ? (
                <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                  Assinatura HMAC: {step.actor_signature_hash.slice(0, 16)}...
                </p>
              ) : null}
              {step.actor_signature_signed_at ? (
                <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                  Assinado em:{" "}
                  {new Date(step.actor_signature_signed_at).toLocaleString(
                    "pt-BR",
                  )}
                </p>
              ) : null}
              {step.actor_signature_timestamp_authority ? (
                <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
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
        <div className="rounded-[var(--ds-radius-md)] border border-dashed border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-6 text-center text-sm text-[var(--ds-color-text-muted)]">
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
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[color:var(--component-field-bg-subtle)] px-3 py-2.5 text-sm text-[var(--component-field-text)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]"
            placeholder="Motivo opcional para aprovação; obrigatório para reprovação ou reabertura."
            disabled={locked || acting !== null}
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
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[color:var(--component-field-bg-subtle)] px-3 py-2.5 text-sm text-[var(--component-field-text)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]"
            placeholder="PIN de assinatura do aprovador (4 a 6 dígitos)"
            disabled={locked || acting !== null}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              loading={acting === 'approve' && flow?.status === "not_started"}
              disabled={locked || acting !== null || flow?.status !== "not_started"}
              onClick={initialize}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
            >
              Iniciar aprovação
            </Button>
            <Button
              type="button"
              variant="success"
              loading={acting === 'approve' && flow?.status === "pending"}
              disabled={locked || acting !== null || !flow?.currentStep}
              onClick={approve}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Aprovar etapa
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={acting === 'reject'}
              disabled={locked || acting !== null || !flow?.currentStep}
              onClick={reject}
              leftIcon={<XCircle className="h-4 w-4" />}
            >
              Reprovar
            </Button>
            <Button
              type="button"
              variant="warning"
              loading={acting === 'reopen'}
              disabled={locked || acting !== null || flow?.status !== "rejected"}
              onClick={reopen}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              Reabrir ciclo
            </Button>
          </div>
        </div>
      ) : null}
      {/* Modal de confirmação de segurança para ações irreversíveis */}
      {pendingAction ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar ação de aprovação"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <div className="mx-4 w-full max-w-sm rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-base font-bold text-[var(--ds-color-text-primary)]">
                {pendingAction === "approve"
                  ? "Confirmar aprovação"
                  : pendingAction === "reject"
                    ? "Confirmar reprovação"
                    : "Confirmar reabertura de ciclo"}
              </h3>
              <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                {pendingAction === "approve"
                  ? "Você está prestes a aprovar esta etapa do fluxo DDS. Esta ação será registrada na trilha de auditoria com sua assinatura HMAC."
                  : pendingAction === "reject"
                    ? "Você está prestes a reprovar esta etapa. O fluxo será marcado como reprovado e deverá ser reaberto para nova tentativa."
                    : "Você está prestes a reabrir o ciclo de aprovação do DDS. Um novo ciclo será criado com os passos configurados."}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingAction(null)}
                disabled={acting !== null}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant={
                  pendingAction === "approve"
                    ? "success"
                    : pendingAction === "reject"
                      ? "destructive"
                      : "warning"
                }
                loading={acting !== null}
                onClick={() => void confirmAction()}
              >
                {pendingAction === "approve"
                  ? "Confirmar aprovação"
                  : pendingAction === "reject"
                    ? "Confirmar reprovação"
                    : "Confirmar reabertura"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}



