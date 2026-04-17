"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from "@/components/ui/modal-frame";

type AprActionModalSummary = {
  numero?: string | null;
  titulo?: string | null;
  status?: string | null;
};

interface AprActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  loading?: boolean;
  title: string;
  description: string;
  impact: string;
  confirmLabel: string;
  cancelLabel?: string;
  aprSummary?: AprActionModalSummary | null;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
}

export function AprActionModal({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
  title,
  description,
  impact,
  confirmLabel,
  cancelLabel = "Cancelar",
  aprSummary,
  requireReason = false,
  reasonLabel = "Motivo",
  reasonPlaceholder = "Informe o motivo da reprovação",
  minReasonLength = 10,
}: AprActionModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setReason("");
    }
  }, [isOpen]);

  const normalizedReason = reason.trim();
  const reasonTooShort =
    requireReason && normalizedReason.length > 0 && normalizedReason.length < minReasonLength;
  const canConfirm =
    !loading &&
    (!requireReason || normalizedReason.length >= minReasonLength);

  const summaryLine = useMemo(() => {
    if (!aprSummary) return null;
    const parts = [
      aprSummary.numero ? `Nº ${aprSummary.numero}` : null,
      aprSummary.titulo || null,
      aprSummary.status ? `Status: ${aprSummary.status}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" • ") : null;
  }, [aprSummary]);

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose} shellClassName="max-w-lg">
      <ModalHeader
        title={title}
        description={description}
        icon={<AlertTriangle className="h-5 w-5" />}
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        {summaryLine ? (
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-2 text-sm text-[var(--ds-color-text-secondary)]">
            {summaryLine}
          </div>
        ) : null}

        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-sm text-[var(--color-warning)]">
          {impact}
        </div>

        {requireReason ? (
          <div className="space-y-1.5">
            <label
              htmlFor="apr-action-reason"
              className="text-sm font-semibold text-[var(--ds-color-text-primary)]"
            >
              {reasonLabel}
            </label>
            <textarea
              id="apr-action-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            />
            <p className="text-xs text-[var(--ds-color-text-secondary)]">
              Mínimo de {minReasonLength} caracteres.
            </p>
            {reasonTooShort ? (
              <p className="text-xs text-[var(--color-danger)]">
                O motivo precisa ter ao menos {minReasonLength} caracteres.
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          onClick={() => void onConfirm(requireReason ? normalizedReason : undefined)}
          disabled={!canConfirm}
        >
          {loading ? "Processando..." : confirmLabel}
        </Button>
      </ModalFooter>
    </ModalFrame>
  );
}
