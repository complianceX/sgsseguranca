'use client';

import { ModalFrame, ModalHeader, ModalBody, ModalFooter } from './modal-frame';
import { Button } from './button';
import type React from 'react';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  loading = false,
  danger = true,
}: ConfirmModalProps) {
  return (
    <ModalFrame isOpen={open} onClose={onClose} shellClassName="max-w-sm">
      <ModalHeader title={title} onClose={onClose} />
      <ModalBody>
        <p className="text-sm text-[var(--ds-color-text-secondary)]">{description}</p>
        {children ? <div className="mt-4">{children}</div> : null}
      </ModalBody>
      <ModalFooter>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </Button>
        </div>
      </ModalFooter>
    </ModalFrame>
  );
}
