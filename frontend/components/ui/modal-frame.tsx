import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  shellClassName?: string;
  overlayClassName?: string;
}

interface ModalHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  onClose?: () => void;
  className?: string;
}

interface ModalSectionProps {
  children: ReactNode;
  className?: string;
}

export function ModalFrame({
  isOpen,
  onClose,
  children,
  shellClassName,
  overlayClassName,
}: ModalFrameProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'ds-modal-overlay z-[100] animate-in fade-in duration-200',
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'ds-modal-shell animate-in zoom-in-95 duration-200',
          shellClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  description,
  icon,
  onClose,
  className,
}: ModalHeaderProps) {
  return (
    <div className={cn('ds-modal-header', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="ds-modal-header__icon">{icon}</div> : null}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="ds-modal-close" aria-label="Fechar modal">
          <X className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

export function ModalBody({ children, className }: ModalSectionProps) {
  return <div className={cn('ds-modal-body', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: ModalSectionProps) {
  return <div className={cn('ds-modal-footer', className)}>{children}</div>;
}
