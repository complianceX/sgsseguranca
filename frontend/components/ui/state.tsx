import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  LoaderCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { PageSkeleton } from './skeleton';

type StateTone = 'neutral' | 'danger' | 'success';

type StateCardProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

const toneClasses: Record<StateTone, string> = {
  neutral:
    'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)]',
  danger:
    'border-[color:var(--ds-color-danger)]/25 bg-[color:var(--ds-color-danger)]/10 text-[var(--ds-color-text-primary)]',
  success:
    'border-[color:var(--ds-color-success)]/25 bg-[color:var(--ds-color-success)]/10 text-[var(--ds-color-text-primary)]',
};

function StateCard({
  title,
  description,
  icon,
  action,
  className,
  compact = false,
  tone,
}: StateCardProps & { tone: StateTone }) {
  return (
    <Card
      tone="default"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-5' : 'p-8',
        toneClasses[tone],
        className,
      )}
    >
      <CardHeader className="items-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-color-surface-muted)]/35 text-[var(--ds-color-text-primary)]">
          {icon}
        </div>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription className="max-w-md">{description}</CardDescription> : null}
      </CardHeader>
      {action ? (
        <CardFooter className="mt-6 justify-center border-t-0 pt-0">{action}</CardFooter>
      ) : null}
    </Card>
  );
}

export function EmptyState(props: StateCardProps) {
  return <StateCard tone="neutral" icon={props.icon ?? <Inbox size={22} />} {...props} />;
}

export function ErrorState(props: StateCardProps) {
  return (
    <StateCard
      tone="danger"
      icon={props.icon ?? <AlertTriangle size={22} />}
      {...props}
    />
  );
}

export function SuccessState(props: StateCardProps) {
  return (
    <StateCard
      tone="success"
      icon={props.icon ?? <CheckCircle2 size={22} />}
      {...props}
    />
  );
}

export function InlineLoadingState({
  label = 'Carregando dados',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-24 items-center justify-center gap-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] px-4 text-sm text-[var(--ds-color-text-muted)]',
        className,
      )}
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--ds-color-action-primary)]" />
      <span>{label}</span>
    </div>
  );
}

export function PageLoadingState({
  title = 'Carregando conteudo',
  description = 'Preparando dados e componentes desta tela.',
  cards = 4,
  tableRows = 5,
}: {
  title?: string;
  description?: string;
  cards?: number;
  tableRows?: number;
}) {
  return (
    <section role="status" aria-live="polite" className="space-y-6">
      <Card tone="muted" padding="md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-[var(--ds-color-action-primary)]" />
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      <PageSkeleton cards={cards} tableRows={tableRows} />
    </section>
  );
}
