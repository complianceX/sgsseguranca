import { useEffect, useRef, type ReactNode } from 'react';
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
  const shellRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    shellRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      lastFocusedElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'ds-modal-overlay z-[100]',
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'ds-modal-shell max-h-[calc(100vh-2rem)]',
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
