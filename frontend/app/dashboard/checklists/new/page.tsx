"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";

const ChecklistForm = dynamic(
  () =>
    import("../components/ChecklistForm").then(
      (module) => module.ChecklistForm,
    ),
  {
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando formulário de checklist...
      </div>
    ),
  },
);

export default function NewChecklistPage() {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const requestedSource = searchParams.get("source");
  const selectedModelId =
    searchParams.get("modelId") || searchParams.get("templateId");

  const resolvedSource = useMemo<"blank" | "model">(() => {
    if (requestedSource === "model") {
      return "model";
    }
    if (requestedMode === "template") {
      return "model";
    }
    if (selectedModelId) {
      return "model";
    }
    return "blank";
  }, [requestedMode, requestedSource, selectedModelId]);

  const [source, setSource] = useState<"blank" | "model">(resolvedSource);

  useEffect(() => {
    setSource(resolvedSource);
  }, [resolvedSource]);

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-1 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] p-1 w-fit">
        <button
          type="button"
          onClick={() => setSource("blank")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold motion-safe:transition-all",
            source === "blank"
              ? "bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-sm"
              : "text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-secondary)]",
          )}
        >
          <ClipboardCheck className="h-4 w-4" />
          Criar do zero
        </button>
        <button
          type="button"
          onClick={() => setSource("model")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold motion-safe:transition-all",
            source === "model"
              ? "bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-sm"
              : "text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-secondary)]",
          )}
        >
          <LayoutTemplate className="h-4 w-4" />
          Usar modelo padrão
        </button>
      </div>

      {source === "model" ? (
        selectedModelId ? (
          <>
            <p className="text-xs text-[var(--ds-color-text-muted)]">
              Este checklist será iniciado a partir de um modelo padrão e salvo
              como checklist operacional preenchível.
            </p>
            <ChecklistForm mode="checklist" />
          </>
        ) : (
          <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
            <div className="flex items-start gap-3">
              <LayoutTemplate className="mt-0.5 h-5 w-5 text-[var(--ds-color-action-primary)]" />
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-[var(--ds-color-text-primary)]">
                    Escolha um modelo padrão antes de iniciar.
                  </p>
                  <p>
                    O módulo de checklist trabalha com dois caminhos: usar um
                    modelo padrão do sistema ou criar o checklist do zero.
                  </p>
                </div>
                <Link
                  href="/dashboard/checklist-models"
                  className="inline-flex items-center rounded-lg border border-[var(--ds-color-border-subtle)] px-4 py-2 font-semibold text-[var(--ds-color-text-primary)] motion-safe:transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                >
                  Abrir modelos padrão
                </Link>
              </div>
            </div>
          </div>
        )
      ) : (
        <ChecklistForm mode="checklist" />
      )}
    </div>
  );
}
