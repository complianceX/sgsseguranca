"use client";

import dynamic from "next/dynamic";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const InspectionForm = dynamic(
  () =>
    import("@/components/InspectionForm").then(
      (module) => module.InspectionForm,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando formulário de inspeção...
      </div>
    ),
  },
);

export default function NewInspectionPage() {
  const searchParams = useSearchParams();
  const isFieldMode = searchParams.get("field") === "1";
  const isPhotographicReport = searchParams.get("kind") === "photographic";

  return (
    <div className="ds-form-page space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-[1.2rem]">
                {isPhotographicReport
                  ? "Novo Relatório Fotográfico"
                  : "Novo Relatório de Inspeção"}
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                {isFieldMode
                  ? "Fluxo reduzido para celular, com evidência primeiro, fila offline e ações grandes para uso em obra."
                  : "Preencha contexto, riscos, plano de ação e evidências em um fluxo mais direto para operação em campo."}
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/inspections"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "inline-flex items-center",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para inspeções
          </Link>
        </CardHeader>
      </Card>

      <InspectionForm />
    </div>
  );
}
