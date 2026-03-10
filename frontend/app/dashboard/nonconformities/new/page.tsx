"use client";

import { NonConformityForm } from "@/components/NonConformityForm";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewNonConformityPage() {
  return (
    <div className="ds-form-page space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-[1.2rem]">
                Nova Não Conformidade
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Registre o desvio, a análise de risco, o plano de correção e a
                validação final em um fluxo único.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/nonconformities"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "inline-flex items-center",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para NCs
          </Link>
        </CardHeader>
      </Card>
      <NonConformityForm />
    </div>
  );
}
