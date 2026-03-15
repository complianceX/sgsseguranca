import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

export interface MetricItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}

interface ListPageLayoutProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  metrics?: MetricItem[];
  toolbarTitle: string;
  toolbarDescription?: string;
  toolbarContent?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
}

export function ListPageLayout({
  eyebrow,
  title,
  description,
  icon,
  actions,
  metrics,
  toolbarTitle,
  toolbarDescription,
  toolbarContent,
  children,
  footer,
  className,
  panelClassName,
}: ListPageLayoutProps) {
  return (
    <div className={cn('ds-page-layout', className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        actions={actions}
      />

      {metrics?.length ? (
        <section className="ds-metric-strip">
          {metrics.map((item) => (
            <article
              key={item.label}
              className={cn(
                'ds-metric-item',
                item.tone && item.tone !== 'neutral' ? `ds-metric-item--${item.tone}` : null,
              )}
            >
              <p className="ds-metric-item__label">{item.label}</p>
              <div className="ds-metric-item__value">{item.value}</div>
              {item.note ? <p className="ds-metric-item__note">{item.note}</p> : null}
            </article>
          ))}
        </section>
      ) : null}

      <section className={cn('ds-list-shell', panelClassName)}>
        <div className="ds-list-toolbar md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">{toolbarTitle}</h2>
            {toolbarDescription ? (
              <p className="text-sm text-[var(--ds-color-text-secondary)]">{toolbarDescription}</p>
            ) : null}
          </div>
          {toolbarContent ? <div className="ds-list-toolbar__row">{toolbarContent}</div> : null}
        </div>
        <div className="ds-list-body">{children}</div>
        {footer ? <div className="ds-list-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
