import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type MobileActionBarProps = HTMLAttributes<HTMLDivElement>;

/**
 * Shared action surface for long forms. Its CSS contract keeps actions above
 * the mobile navigation and the device safe area without hard-coded offsets.
 */
export function MobileActionBar({
  children,
  className,
  'aria-label': ariaLabel = 'Ações do formulário',
  ...props
}: MobileActionBarProps) {
  return (
    <div
      {...props}
      role="group"
      aria-label={ariaLabel}
      data-sophie-reserved-zone="bottom"
      className={cn('ds-mobile-action-bar', className)}
    >
      {children}
    </div>
  );
}
