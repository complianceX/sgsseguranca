"use client";

import { useState, useEffect, useCallback } from "react";
import { aprsService } from "@/services/aprsService";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Circle, AlertCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { AprReopenModal } from "./AprReopenModal";

type WorkflowHistory = {
  id: string;
  aprId: string;
  stepOrder: number;
  roleName: string;
  approverId: string;
  action: "APROVADO" | "REPROVADO" | "REABERTO" | "DELEGADO";
  reason: string | null;
  occurredAt: string;
};

type WorkflowStatus = {
  currentStep: { stepOrder: number; roleName: string; isRequired: boolean } | null;
  nextStep: { stepOrder: number; roleName: string } | null;
  history: WorkflowHistory[];
  canEdit: boolean;
  canApprove: boolean;
};

const ACTION_LABEL: Record<WorkflowHistory["action"], string> = {
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  REABERTO: "Reaberto",
  DELEGADO: "Delegado",
};

const ACTION_COLOR: Record<
  WorkflowHistory["action"],
  { border: string; bg: string; text: string }
> = {
  APROVADO: {
    border: "border-[var(--ds-color-success-border)]",
    bg: "bg-[color:var(--ds-color-success-subtle)]",
    text: "text-[var(--color-success)]",
  },
  REPROVADO: {
    border: "border-[var(--ds-color-danger-border)]",
    bg: "bg-[color:var(--ds-color-danger-subtle)]",
    text: "text-[var(--color-danger)]",
  },
  REABERTO: {
    border: "border-[var(--ds-color-warning-border)]",
    bg: "bg-[color:var(--ds-color-warning-subtle)]",
    text: "text-[var(--color-warning)]",
  },
  DELEGADO: {
    border: "border-[var(--ds-color-border-subtle)]",
    bg: "bg-[color:var(--ds-color-surface-muted)]",
    text: "text-[var(--ds-color-text-secondary)]",
  },
};

interface AprApprovalPanelProps {
  aprId: string;
  onStatusChange?: () => void;
}

export function AprApprovalPanel({ aprId, onStatusChange }: AprApprovalPanelProps) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await aprsService.getWorkflowStatus(aprId);
      setStatus(data);
    } catch {
      // Flag may be disabled — panel is hidden by caller in that case
    } finally {
      setLoading(false);
    }
  }, [aprId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleApprove = async () => {
    if (acting) return;
    setActing(true);
    try {
      await aprsService.workflowApprove(aprId);
      toast.success("Passo de aprovação registrado.");
      await loadStatus();
      onStatusChange?.();
    } catch (error) {
      handleApiError(error, "Aprovação");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 10) {
      toast.error("Motivo de reprovação deve ter pelo menos 10 caracteres.");
      return;
    }
    if (acting) return;
    setActing(true);
    try {
      await aprsService.workflowReject(aprId, rejectReason.trim());
      toast.success("APR reprovada.");
      setShowRejectInput(false);
      setRejectReason("");
      await loadStatus();
      onStatusChange?.();
    } catch (error) {
      handleApiError(error, "Reprovação");
    } finally {
      setActing(false);
    }
  };

  const handleReopen = async (reason: string) => {
    await aprsService.workflowReopen(aprId, reason);
    await loadStatus();
    onStatusChange?.();
  };

  if (loading) {
    return (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-4 text-sm text-[var(--ds-color-text-secondary)]">
        Carregando fluxo de aprovação...
      </div>
    );
  }

  if (!status) return null;

  const { currentStep, nextStep, history, canApprove } = status;

  return (
    <div className="sst-card p-4 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
        Fluxo de aprovação configurável
      </h2>

      {/* Timeline */}
      <div className="space-y-3">
        {history.map((record) => {
          const colors = ACTION_COLOR[record.action];
          return (
            <div
              key={record.id}
              className={cn(
                "flex items-start gap-3 rounded-[var(--ds-radius-md)] border px-3 py-2.5",
                colors.border,
                colors.bg,
              )}
            >
              {record.action === "APROVADO" ? (
                <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", colors.text)} />
              ) : record.action === "REPROVADO" ? (
                <AlertCircle className={cn("mt-0.5 h-4 w-4 shrink-0", colors.text)} />
              ) : (
                <Clock className={cn("mt-0.5 h-4 w-4 shrink-0", colors.text)} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Passo {record.stepOrder} — {record.roleName}
                  <span
                    className={cn(
                      "ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                      colors.border,
                      colors.text,
                    )}
                  >
                    {ACTION_LABEL[record.action]}
                  </span>
                </p>
                {record.reason && (
                  <p className="mt-0.5 text-xs text-[var(--ds-color-text-secondary)]">
                    {record.reason}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-[var(--ds-color-text-tertiary)]">
                  {new Date(record.occurredAt).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          );
        })}

        {currentStep && (
          <div className="flex items-start gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Passo {currentStep.stepOrder} — Aguardando{" "}
                <span className="text-[var(--color-warning)]">{currentStep.roleName}</span>
              </p>
              {currentStep.isRequired && (
                <p className="mt-0.5 text-xs text-[var(--ds-color-text-secondary)]">
                  Aprovação obrigatória
                </p>
              )}
            </div>
          </div>
        )}

        {nextStep && (
          <div className="flex items-start gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] px-3 py-2.5 opacity-60">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-color-text-secondary)]" />
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              Passo {nextStep.stepOrder} — Aguardando {nextStep.roleName}
            </p>
          </div>
        )}

        {!currentStep && history.length > 0 && (
          <div className="flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
            <p className="text-sm font-semibold text-[var(--color-success)]">
              Todos os passos concluídos
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {canApprove && currentStep && (
        <div className="space-y-3 border-t border-[var(--ds-color-border-subtle)] pt-4">
          {!showRejectInput ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={handleApprove}
                className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-4 py-2 text-sm font-semibold text-[var(--color-success)] motion-safe:transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4" />
                {acting ? "Aprovando..." : "Aprovar"}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => setShowRejectInput(true)}
                className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] motion-safe:transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <ThumbsDown className="h-4 w-4" />
                Reprovar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Descreva o motivo da reprovação (mín. 10 caracteres)..."
                rows={3}
                className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={acting || rejectReason.trim().length < 10}
                  onClick={handleReject}
                  className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {acting ? "Reprovando..." : "Confirmar reprovação"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectReason("");
                  }}
                  className="px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {history.some((r) => r.action === "APROVADO") && (
        <div className="border-t border-[var(--ds-color-border-subtle)] pt-3">
          <button
            type="button"
            onClick={() => setReopenModalOpen(true)}
            className="text-xs text-[var(--ds-color-text-secondary)] underline underline-offset-2 hover:text-[var(--ds-color-text-primary)]"
          >
            Reabrir passo anterior
          </button>
        </div>
      )}

      <AprReopenModal
        open={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        onConfirm={handleReopen}
      />
    </div>
  );
}
