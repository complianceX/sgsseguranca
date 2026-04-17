"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileText,
  GitBranch,
  Loader2,
  Mail,
  PenLine,
  Printer,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { ActionMenu } from "@/components/ActionMenu";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  AprListingDensity,
  AprListingRecord,
  formatAprDateTime,
  getAprBlockingMeta,
  getAprDeadlineMeta,
  getAprResponsibleMeta,
  getAprStatusMeta,
  getToneClasses,
} from "./aprListingUtils";

interface AprListingRowProps {
  apr: AprListingRecord;
  density: AprListingDensity;
  onDelete: (id: string) => void;
  onPrint: (apr: AprListingRecord) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onApprove: (id: string) => void;
  onFinalize: (id: string) => void;
  onReject: (id: string) => void;
  onCreateNewVersion: (id: string) => void;
  isPending: boolean;
  onOpenSignature: (apr: AprListingRecord) => void;
  onOpenSignatures: (apr: AprListingRecord) => void;
}

export function AprListingRow({
  apr,
  density,
  onDelete,
  onPrint,
  onSendEmail,
  onDownloadPdf,
  onApprove,
  onFinalize,
  onReject,
  onCreateNewVersion,
  isPending,
  onOpenSignature,
  onOpenSignatures,
}: AprListingRowProps) {
  const { hasPermission } = useAuth();
  const router = useRouter();

  const status = getAprStatusMeta(apr);
  const deadline = getAprDeadlineMeta(apr);
  const blocking = getAprBlockingMeta(apr);
  const responsible = getAprResponsibleMeta(apr);
  const statusTone = getToneClasses(status.tone);
  const deadlineTone = getToneClasses(deadline.tone);
  const blockingTone = getToneClasses(blocking.tone);
  const isApproved = apr.status === "Aprovada";
  const hasGovernedPdf = Boolean(apr.pdf_file_key);
  const canModerate = hasPermission("can_create_apr");
  const cellPadding = density === "compact" ? "py-2.5" : "py-3.5";

  const handleOpenPdf = useCallback(() => {
    onDownloadPdf(apr.id);
  }, [apr.id, onDownloadPdf]);

  const handlePrintClick = useCallback(() => {
    onPrint(apr);
  }, [apr, onPrint]);

  const handleApproveClick = useCallback(() => {
    if (isPending) return;
    onApprove(apr.id);
  }, [apr.id, isPending, onApprove]);

  const handleRejectClick = useCallback(() => {
    if (isPending) return;
    onReject(apr.id);
  }, [apr.id, isPending, onReject]);

  const handleCreateNewVersionClick = useCallback(() => {
    if (isPending) return;
    onCreateNewVersion(apr.id);
  }, [apr.id, isPending, onCreateNewVersion]);

  const handleFinalizeClick = useCallback(() => {
    if (isPending) return;
    onFinalize(apr.id);
  }, [apr.id, isPending, onFinalize]);

  const handleSendEmailClick = useCallback(() => {
    if (isPending) return;
    onSendEmail(apr.id);
  }, [apr.id, isPending, onSendEmail]);

  const handleOpenSignatureClick = useCallback(() => {
    if (isPending) return;
    onOpenSignature(apr);
  }, [apr, isPending, onOpenSignature]);

  const handleOpenSignaturesClick = useCallback(() => {
    if (isPending) return;
    onOpenSignatures(apr);
  }, [apr, isPending, onOpenSignatures]);

  const handleEditClick = useCallback(() => {
    if (isPending) return;
    router.push(`/dashboard/aprs/edit/${apr.id}`);
  }, [apr.id, isPending, router]);

  const handleDeleteClick = useCallback(() => {
    if (isPending) return;
    onDelete(apr.id);
  }, [apr.id, isPending, onDelete]);

  const primaryAction = (() => {
    if (isApproved && !hasGovernedPdf) {
      return (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0 text-[13px]"
          onClick={handleOpenPdf}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Emitir PDF
        </Button>
      );
    }

    if (isApproved && hasGovernedPdf) {
      return (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0 text-[13px]"
          onClick={handleOpenPdf}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Abrir PDF
        </Button>
      );
    }

    return (
      <Link
        href={`/dashboard/aprs/edit/${apr.id}`}
        className={cn(
          buttonVariants({ variant: "link", size: "sm" }),
          "px-0 text-[13px]",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Abrir
      </Link>
    );
  })();

  const actionItems = useMemo(
    () => [
      ...(canModerate && apr.status === "Pendente"
        ? [
            {
              label: "Aprovar APR",
              icon: <CheckCircle2 className="h-4 w-4" />,
              onClick: handleApproveClick,
            },
            {
              label: "Reprovar APR",
              icon: <XCircle className="h-4 w-4" />,
              onClick: handleRejectClick,
              variant: "danger" as const,
            },
          ]
        : []),
      ...(isApproved
        ? [
            {
              label: "Criar nova versão",
              icon: <GitBranch className="h-4 w-4" />,
              onClick: handleCreateNewVersionClick,
            },
          ]
        : []),
      ...(isApproved && hasGovernedPdf
        ? [
            {
              label: "Encerrar APR",
              icon: <CheckCircle2 className="h-4 w-4" />,
              onClick: handleFinalizeClick,
            },
          ]
        : []),
      {
        label: hasGovernedPdf ? "Abrir PDF final" : "Gerar PDF",
        icon: <Download className="h-4 w-4" />,
        onClick: handleOpenPdf,
      },
      {
        label: hasGovernedPdf ? "Imprimir PDF final" : "Pré-visualizar APR",
        icon: <Printer className="h-4 w-4" />,
        onClick: handlePrintClick,
      },
      {
        label: hasGovernedPdf
          ? "Enviar PDF governado por e-mail"
          : "Enviar pré-visualização por e-mail",
        icon: <Mail className="h-4 w-4" />,
        onClick: handleSendEmailClick,
      },
      {
        label: "Assinar APR",
        icon: <PenLine className="h-4 w-4" />,
        onClick: handleOpenSignatureClick,
      },
      {
        label: "Ver assinaturas",
        icon: <Users className="h-4 w-4" />,
        onClick: handleOpenSignaturesClick,
      },
      ...(!isApproved
        ? [
            {
              label: "Editar APR",
              icon: <FileText className="h-4 w-4" />,
              onClick: handleEditClick,
            },
          ]
        : []),
      {
        label: "Excluir APR",
        icon: <Trash2 className="h-4 w-4" />,
        onClick: handleDeleteClick,
        variant: "danger" as const,
      },
    ],
    [
      apr.status,
      canModerate,
      handleApproveClick,
      handleCreateNewVersionClick,
      handleDeleteClick,
      handleEditClick,
      handleFinalizeClick,
      handleOpenPdf,
      handleOpenSignatureClick,
      handleOpenSignaturesClick,
      handlePrintClick,
      handleRejectClick,
      handleSendEmailClick,
      hasGovernedPdf,
      isApproved,
    ],
  );

  return (
    <TableRow className={cn(density === "compact" ? "h-16" : "h-[76px]")}>
      <TableCell className={cn("align-top", cellPadding)}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">
            {apr.numero || "Sem número"}
          </p>
          <p className="max-w-[220px] text-sm font-semibold leading-5 text-[var(--ds-color-text-primary)]">
            {apr.titulo || "APR sem título"}
          </p>
        </div>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
            {apr.site?.nome || "Obra não vinculada"}
          </p>
          <p className="text-xs text-[var(--ds-color-text-secondary)]">
            Elaborador: {apr.elaborador?.nome || "Não informado"}
          </p>
        </div>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
            statusTone.badge,
          )}
        >
          {status.label}
        </span>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
            {responsible.name}
          </p>
          <p className="text-xs text-[var(--ds-color-text-secondary)]">
            {responsible.role}
          </p>
        </div>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
            {deadline.absoluteLabel}
          </p>
          <p className={cn("text-xs font-semibold", deadlineTone.text)}>
            {deadline.relativeLabel}
          </p>
        </div>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <span
          className={cn(
            "inline-flex rounded-[var(--ds-radius-md)] border px-2.5 py-1.5 text-xs font-medium",
            blockingTone.inline,
          )}
        >
          {blocking.label}
        </span>
      </TableCell>

      <TableCell className={cn("align-top", cellPadding)}>
        <p className="text-sm text-[var(--ds-color-text-secondary)]">
          {formatAprDateTime(apr.updated_at)}
        </p>
      </TableCell>

      <TableCell className={cn("align-top text-right", cellPadding)}>
        <div className="flex items-center justify-end gap-1">
          {primaryAction}
          <div className={cn(isPending && "pointer-events-none opacity-60")}>
            <ActionMenu items={actionItems} />
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
