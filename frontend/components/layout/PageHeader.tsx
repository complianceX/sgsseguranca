import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
  contentClassName,
}: PageHeaderProps) {
  return (
    <section className={cn('ds-page-header', className)}>
      <div className="ds-page-header__main md:flex-row md:items-start md:justify-between">
        <div className="ds-page-header__lead">
          {icon ? <div className="ds-page-header__icon">{icon}</div> : null}
          <div className={cn('ds-page-header__copy', contentClassName)}>
            {eyebrow ? <span className="ds-page-header__eyebrow">{eyebrow}</span> : null}
            <h1 className="text-[clamp(1.5rem,1.2rem+0.7vw,2rem)] font-semibold tracking-[-0.03em] text-[var(--ds-color-text-on-canvas)]">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-[var(--ds-color-text-on-canvas-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
