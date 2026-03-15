'use client';

import React from 'react';
import { Pt, PtApprovalBlockedPayload } from '@/services/ptsService';
import type {
  PtApprovalChecklistState,
  PtApprovalReview,
} from './PtApprovalReviewPanel';
import { PtsTableRow } from './PtsTableRow';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/state';
import { TableRowSkeleton } from '@/components/ui/skeleton';

interface PtsTableProps {
  pts: Pt[];
  loading: boolean;
  onDelete: (id: string) => void;
  onPrint: (id: string) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onPrepareApproval: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  approvingId: string | null;
  rejectingId: string | null;
  approvalReviewLoadingId: string | null;
  approvalIssuesById: Record<string, PtApprovalBlockedPayload>;
  approvalReviewById: Record<string, PtApprovalReview>;
  approvalChecklistById: Record<string, PtApprovalChecklistState>;
  onDismissApprovalIssue: (id: string) => void;
  onDismissApprovalReview: (id: string) => void;
  onUpdateApprovalChecklist: (
    id: string,
    key: keyof PtApprovalChecklistState,
    checked: boolean,
  ) => void;
}

export const PtsTable = React.memo(
  ({
    pts,
    loading,
    onDelete,
    onPrint,
    onSendEmail,
    onDownloadPdf,
    onPrepareApproval,
    onApprove,
    onReject,
    approvingId,
    rejectingId,
    approvalReviewLoadingId,
    approvalIssuesById,
    approvalReviewById,
    approvalChecklistById,
    onDismissApprovalIssue,
    onDismissApprovalReview,
    onUpdateApprovalChecklist,
  }: PtsTableProps) => {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número / Título</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRowSkeleton key={index} cols={5} />
              ))
            ) : pts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10">
                  <EmptyState
                    title="Nenhuma PT encontrada"
                    description="Tente ajustar os filtros ou crie uma nova permissão de trabalho."
                    compact
                  />
                </TableCell>
              </TableRow>
            ) : (
              pts.map((pt) => (
                <PtsTableRow
                  key={pt.id}
                  pt={pt}
                  onDelete={onDelete}
                  onPrint={onPrint}
                  onSendEmail={onSendEmail}
                  onDownloadPdf={onDownloadPdf}
                  onPrepareApproval={onPrepareApproval}
                  onApprove={onApprove}
                  onReject={onReject}
                  approvingId={approvingId}
                  rejectingId={rejectingId}
                  approvalReviewLoadingId={approvalReviewLoadingId}
                  approvalIssue={approvalIssuesById[pt.id]}
                  approvalReview={approvalReviewById[pt.id]}
                  approvalChecklist={
                    approvalChecklistById[pt.id] || {
                      reviewedReadiness: false,
                      reviewedWorkers: false,
                      confirmedRelease: false,
                    }
                  }
                  onDismissApprovalIssue={onDismissApprovalIssue}
                  onDismissApprovalReview={onDismissApprovalReview}
                  onUpdateApprovalChecklist={onUpdateApprovalChecklist}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  },
);

PtsTable.displayName = 'PtsTable';
