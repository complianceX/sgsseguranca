"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Apr } from "@/services/aprsService";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileText,
  GitBranch,
  Mail,
  PenLine,
  Pencil,
  Printer,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SignatureModal } from "@/components/SignatureModal";
import { SignaturesPanel } from "@/components/SignaturesPanel";
import { signaturesService } from "@/services/signaturesService";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionMenu } from "@/components/ActionMenu";

interface AprCardProps {
  apr: Apr;
  onDelete: (id: string) => void;
  onPrint: (apr: Apr) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onApprove: (id: string) => void;
  onFinalize: (id: string) => void;
  onReject: (id: string) => void;
  onCreateNewVersion: (id: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Aprovada":
      return <CheckCircle className="h-4 w-4 text-[var(--ds-color-success)]" />;
    case "Pendente":
      return (
        <Clock className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
      );
    case "Cancelada":
      return (
        <AlertTriangle className="h-4 w-4 text-[var(--ds-color-danger)]" />
      );
    case "Encerrada":
      return (
        <CheckCircle className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
      );
    default:
      return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "Aprovada":
      return "bg-[var(--ds-color-success)] text-white";
    case "Pendente":
      return "bg-[var(--ds-color-action-primary)] text-white";
    case "Cancelada":
      return "bg-[var(--ds-color-danger)] text-white";
    case "Encerrada":
      return "bg-[var(--ds-color-text-muted)] text-white";
    default:
      return "bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
};

export const AprCard = React.memo(
  ({
    apr,
    onDelete,
    onPrint,
    onSendEmail,
    onDownloadPdf,
    onApprove,
    onFinalize,
    onReject,
    onCreateNewVersion,
  }: AprCardProps) => {
    const { user, hasPermission } = useAuth();
    const [showSignModal, setShowSignModal] = useState(false);
    const [showSignaturesPanel, setShowSignaturesPanel] = useState(false);

    const handleSignSave = useCallback(
      async (signatureData: string, type: string) => {
        try {
          await signaturesService.create({
            document_id: apr.id,
            document_type: "APR",
            signature_data: signatureData,
            type,
            user_id: user?.id,
            company_id: apr.company_id,
          });
          toast.success("Assinatura registrada com sucesso.");
        } catch {
          toast.error("Erro ao registrar assinatura.");
        }
      },
      [apr.company_id, apr.id, user?.id],
    );

    const isApproved = apr.status === "Aprovada";
    const hasGovernedPdf = Boolean(apr.pdf_file_key);
    const hasCriticalRisk = (apr.classificacao_resumo?.critico || 0) > 0;
    const hasSubstantialRisk = (apr.classificacao_resumo?.substancial || 0) > 0;
    const riskHighlightClass = hasCriticalRisk
      ? "border-[color:var(--ds-color-danger)]/25 bg-[color:var(--ds-color-danger)]/8"
      : hasSubstantialRisk
        ? "border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/8"
        : "";

    const handleCreateNewVersion = useCallback(() => {
      onCreateNewVersion(apr.id);
    }, [apr.id, onCreateNewVersion]);

    const handleFinalize = useCallback(() => {
      onFinalize(apr.id);
    }, [apr.id, onFinalize]);

    const handleApprove = useCallback(() => {
      onApprove(apr.id);
    }, [apr.id, onApprove]);

    const handleReject = useCallback(() => {
      onReject(apr.id);
    }, [apr.id, onReject]);

    const handlePrintClick = useCallback(() => {
      onPrint(apr);
    }, [apr, onPrint]);

    const handleDownloadClick = useCallback(() => {
      onDownloadPdf(apr.id);
    }, [apr.id, onDownloadPdf]);

    const handleSendEmailClick = useCallback(() => {
      onSendEmail(apr.id);
    }, [apr.id, onSendEmail]);

    const handleOpenSignModal = useCallback(() => {
      setShowSignModal(true);
    }, []);

    const handleCloseSignModal = useCallback(() => {
      setShowSignModal(false);
    }, []);

    const handleOpenSignaturesPanel = useCallback(() => {
      setShowSignaturesPanel(true);
    }, []);

    const handleCloseSignaturesPanel = useCallback(() => {
      setShowSignaturesPanel(false);
    }, []);

    const handleDeleteClick = useCallback(() => {
      onDelete(apr.id);
    }, [apr.id, onDelete]);

    const actionItems = useMemo(
      () => [
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
          onClick: handleOpenSignModal,
        },
        {
          label: "Ver assinaturas",
          icon: <Users className="h-4 w-4" />,
          onClick: handleOpenSignaturesPanel,
        },
        {
          label: "Excluir APR",
          icon: <Trash2 className="h-4 w-4" />,
          onClick: handleDeleteClick,
          variant: "danger" as const,
        },
      ],
      [
        handleDeleteClick,
        handleOpenSignModal,
        handleOpenSignaturesPanel,
        handleSendEmailClick,
        hasGovernedPdf,
      ],
    );

    return (
      <Card
        tone="default"
        padding="md"
        className={cn(
          "group flex h-full flex-col animate-in fade-in zoom-in-95 transition-all duration-[var(--ds-motion-base)] hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]",
          riskHighlightClass,
        )}
      >
        <CardHeader className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 p-2.5 text-[var(--ds-color-action-primary)] transition-colors group-hover:bg-[var(--ds-color-action-primary)] group-hover:text-white">
              <FileText className="h-6 w-6" />
            </div>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
                getStatusClass(apr.status),
              )}
            >
              {getStatusIcon(apr.status)}
              <span>{apr.status}</span>
            </span>
          </div>

          <div className="space-y-2">
            <CardTitle className="text-lg transition-colors group-hover:text-[var(--ds-color-action-primary)]">
              {apr.titulo}
            </CardTitle>
            <p className="line-clamp-2 text-sm italic text-[var(--ds-color-text-muted)]">
              {apr.descricao || "Sem descrição."}
            </p>
          </div>

          <div className="inline-flex w-fit items-center rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-text-secondary)]">
            <GitBranch className="mr-1.5 h-3.5 w-3.5" />
            <span>Versão {apr.versao || 1}</span>
          </div>
        </CardHeader>

        <CardContent className="mt-0 flex flex-1 flex-col">
          <div className="mb-5 space-y-2 border-t border-[var(--ds-color-border-subtle)] pt-4 text-sm text-[var(--ds-color-text-muted)]">
            <div className="flex items-center">
              <Calendar className="mr-2 h-3.5 w-3.5 text-[var(--ds-color-text-muted)]" />
              <span className="font-medium">Emissão:</span>
              <span className="ml-1">
                {new Date(apr.data_inicio).toLocaleDateString("pt-BR")}
              </span>
            </div>
            {apr.data_fim ? (
              <div className="flex items-center">
                <Calendar className="mr-2 h-3.5 w-3.5 text-[var(--ds-color-text-muted)]" />
                <span className="font-medium">Validade:</span>
                <span className="ml-1">
                  {new Date(apr.data_fim).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 border-t border-[var(--ds-color-border-subtle)] pt-3">
            {isApproved ? (
              <>
                <Button
                  type="button"
                  onClick={handleCreateNewVersion}
                  variant="outline"
                  size="sm"
                  title="Criar nova versão"
                >
                  Nova versão
                </Button>
                {hasGovernedPdf ? (
                  <Button
                    type="button"
                    onClick={handleFinalize}
                    variant="outline"
                    size="sm"
                    title="Encerrar APR"
                  >
                    Encerrar
                  </Button>
                ) : null}
              </>
            ) : hasPermission("can_create_apr") ? (
              <>
                <Button
                  type="button"
                  onClick={handleApprove}
                  variant="outline"
                  size="sm"
                  title="Aprovar APR"
                >
                  Aprovar
                </Button>
                <Button
                  type="button"
                  onClick={handleReject}
                  variant="outline"
                  size="sm"
                  className="border-[color:var(--ds-color-danger)]/30 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                  title="Reprovar APR"
                >
                  Reprovar
                </Button>
              </>
            ) : null}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handlePrintClick}
              title={
                hasGovernedPdf
                  ? "Imprimir PDF final governado da APR"
                  : "Pré-visualizar APR"
              }
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={handleDownloadClick}
              title={
                hasGovernedPdf
                  ? "Abrir PDF final governado da APR"
                  : "Gerar PDF de pré-visualização"
              }
            >
              <Download className="h-4 w-4" />
            </Button>
            <Link
              href={`/dashboard/aprs/edit/${apr.id}`}
              className={cn(
                buttonVariants({ size: "icon", variant: "ghost" }),
                isApproved
                  ? "pointer-events-none text-[var(--ds-color-text-muted)] opacity-40"
                  : "",
              )}
              title={
                isApproved ? "APR aprovada: edição bloqueada" : "Editar APR"
              }
            >
              <Pencil className="h-4 w-4" />
            </Link>
            <ActionMenu items={actionItems} />
          </div>
        </CardContent>

        <SignatureModal
          isOpen={showSignModal}
          onClose={handleCloseSignModal}
          onSave={handleSignSave}
          userName={user?.nome ?? "Usuário"}
        />
        <SignaturesPanel
          isOpen={showSignaturesPanel}
          onClose={handleCloseSignaturesPanel}
          documentId={apr.id}
          documentType="APR"
        />
      </Card>
    );
  },
);

AprCard.displayName = "AprCard";
