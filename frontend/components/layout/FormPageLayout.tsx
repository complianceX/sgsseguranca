import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

interface FormPageLayoutProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormPageLayout({
  eyebrow,
  title,
  description,
  icon,
  actions,
  summary,
  children,
  footer,
  className,
}: FormPageLayoutProps) {
  return (
    <div className={cn('ds-form-shell ds-form-page', className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        actions={actions}
      />
      {summary}
      {children}
      {footer ? <div className="ds-form-sticky-bar">{footer}</div> : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  icon,
  badge,
  actions,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn('ds-form-section', className)}>
      <div className="ds-form-section__header md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          {icon ? (
            <div className="ds-page-header__icon h-10 w-10 rounded-xl">
              {icon}
            </div>
          ) : null}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">{title}</h2>
              {badge ? (
                <span className="ds-badge ds-badge--info">{badge}</span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 max-w-3xl text-sm text-[var(--ds-color-text-secondary)]">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
