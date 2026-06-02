'use client';

import { Toaster } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/hooks/useTheme';

export function ResponsiveToaster() {
  const isMobile = useIsMobile();
  const { isAdminGeral } = useAuth();
  const { isDark } = useTheme();

  const topOffset = isMobile ? 16 : isAdminGeral ? 112 : 80;

  return (
    <Toaster
      theme={isDark ? 'dark' : 'light'}
      position={isMobile ? 'bottom-center' : 'top-right'}
      offset={topOffset}
      closeButton
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            '!border-[var(--component-modal-border)] !bg-[color:var(--component-card-bg-elevated)] !text-[var(--ds-color-text-primary)] !shadow-[var(--component-card-shadow-elevated)]',
          title: '!text-[var(--ds-color-text-primary)] !font-semibold',
          description: '!text-[var(--ds-color-text-secondary)]',
          content: '!gap-1.5',
          icon: '!text-[var(--ds-color-action-primary)]',
          closeButton:
            '!border-[var(--component-card-border)] !bg-[color:var(--component-card-bg)] !text-[var(--ds-color-text-secondary)]',
          success:
            '!border-[var(--ds-color-success-border)] !bg-[color:color-mix(in_srgb,var(--ds-color-success-subtle)_88%,var(--component-card-bg-elevated)_12%)] !text-[var(--ds-color-success-fg)]',
          info:
            '!border-[var(--ds-color-info-border)] !bg-[color:color-mix(in_srgb,var(--ds-color-info-subtle)_88%,var(--component-card-bg-elevated)_12%)] !text-[var(--ds-color-info-fg)]',
          warning:
            '!border-[var(--ds-color-warning-border)] !bg-[color:color-mix(in_srgb,var(--ds-color-warning-subtle)_88%,var(--component-card-bg-elevated)_12%)] !text-[var(--ds-color-warning-fg)]',
          error:
            '!border-[var(--ds-color-danger-border)] !bg-[color:color-mix(in_srgb,var(--ds-color-danger-subtle)_88%,var(--component-card-bg-elevated)_12%)] !text-[var(--ds-color-danger-fg)]',
        },
      }}
      richColors
    />
  );
}
