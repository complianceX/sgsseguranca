"use client";

import { InspectionForm } from "@/components/InspectionForm";
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

export default function NewInspectionPage() {
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
                Novo Relatório de Inspeção
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Preencha contexto, riscos, plano de ação e evidências em um
                fluxo mais direto para operação em campo.
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
