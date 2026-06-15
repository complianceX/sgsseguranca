'use client';

import { useCallback, useState } from 'react';
import { handleApiError } from '@/lib/error-handler';

export type WorkflowAction = 'approve' | 'reject' | 'reopen';

export interface UseApprovalWorkflowReturn {
  acting: WorkflowAction | null;
  execute: (action: WorkflowAction, fn: () => Promise<void>, label?: string) => Promise<void>;
}

const DEFAULT_LABELS: Record<WorkflowAction, string> = {
  approve: 'Aprovação',
  reject: 'Reprovação',
  reopen: 'Reabertura',
};

export function useApprovalWorkflow(): UseApprovalWorkflowReturn {
  const [acting, setActing] = useState<WorkflowAction | null>(null);

  const execute = useCallback(async (action: WorkflowAction, fn: () => Promise<void>, label?: string) => {
    if (acting) return;
    setActing(action);
    try {
      await fn();
    } catch (err) {
      handleApiError(err, label ?? DEFAULT_LABELS[action]);
    } finally {
      setActing(null);
    }
  }, [acting]);

  return { acting, execute };
}
