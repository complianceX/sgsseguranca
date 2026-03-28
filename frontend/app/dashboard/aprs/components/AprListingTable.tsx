"use client";

import { useState } from "react";
import { SignatureModal } from "@/components/SignatureModal";
import { SignaturesPanel } from "@/components/SignaturesPanel";
import {
  EmptyState,
} from "@/components/ui/state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { signaturesService } from "@/services/signaturesService";
import { toast } from "sonner";
import { AprListingRow } from "./AprListingRow";
import { AprListingDensity, AprListingRecord } from "./aprListingUtils";

interface AprListingTableProps {
  aprs: AprListingRecord[];
  density: AprListingDensity;
  isFiltered: boolean;
  onDelete: (id: string) => void;
  onPrint: (apr: AprListingRecord) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onApprove: (id: string) => void;
  onFinalize: (id: string) => void;
  onReject: (id: string) => void;
  onCreateNewVersion: (id: string) => void;
  onClearFilters: () => void;
}

export function AprListingTable({
  aprs,
  density,
  isFiltered,
  onDelete,
  onPrint,
  onSendEmail,
  onDownloadPdf,
  onApprove,
  onFinalize,
  onReject,
  onCreateNewVersion,
  onClearFilters,
}: AprListingTableProps) {
  const { user } = useAuth();
  const [signatureTarget, setSignatureTarget] = useState<AprListingRecord | null>(null);
  const [signaturesTarget, setSignaturesTarget] = useState<AprListingRecord | null>(null);

  if (aprs.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          title="Nenhuma APR encontrada"
          description={
            isFiltered
              ? "Não há resultados para os filtros aplicados nesta fila operacional."
              : "Ainda não existem APRs registradas para este tenant."
          }
          action={
            isFiltered ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const handleSignSave = async (signatureData: string, type: string) => {
    if (!signatureTarget) return;

    try {
      await signaturesService.create({
        document_id: signatureTarget.id,
        document_type: "APR",
        signature_data: signatureData,
        type,
        user_id: user?.id,
        company_id: signatureTarget.company_id,
      });
      toast.success("Assinatura registrada com sucesso.");
      setSignatureTarget(null);
    } catch {
      toast.error("Erro ao registrar assinatura.");
    }
  };

  return (
    <>
      <Table className="min-w-[1360px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[240px]">Identificação</TableHead>
            <TableHead className="w-[220px]">Contexto</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[180px]">Responsável</TableHead>
            <TableHead className="w-[160px]">Prazo / Vencimento</TableHead>
            <TableHead className="w-[220px]">Bloqueio / Pendência</TableHead>
            <TableHead className="w-[150px]">Última atualização</TableHead>
            <TableHead className="w-[120px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {aprs.map((apr) => (
            <AprListingRow
              key={apr.id}
              apr={apr}
              density={density}
              onDelete={onDelete}
              onPrint={onPrint}
              onSendEmail={onSendEmail}
              onDownloadPdf={onDownloadPdf}
              onApprove={onApprove}
              onFinalize={onFinalize}
              onReject={onReject}
              onCreateNewVersion={onCreateNewVersion}
              onOpenSignature={setSignatureTarget}
              onOpenSignatures={setSignaturesTarget}
            />
          ))}
        </TableBody>
      </Table>

      <SignatureModal
        isOpen={Boolean(signatureTarget)}
        onClose={() => setSignatureTarget(null)}
        onSave={handleSignSave}
        userName={user?.nome ?? "Usuário"}
      />

      <SignaturesPanel
        isOpen={Boolean(signaturesTarget)}
        onClose={() => setSignaturesTarget(null)}
        documentId={signaturesTarget?.id ?? ""}
        documentType="APR"
      />
    </>
  );
}
