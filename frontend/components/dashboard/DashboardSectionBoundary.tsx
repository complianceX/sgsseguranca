'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';

interface DashboardSectionBoundaryProps {
  children: ReactNode;
  fallbackTitle: string;
  fallbackDescription?: string;
}

interface DashboardSectionBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class DashboardSectionBoundary extends Component<
  DashboardSectionBoundaryProps,
  DashboardSectionBoundaryState
> {
  state: DashboardSectionBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): DashboardSectionBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      contexts: {
        boundary: {
          name: this.props.fallbackTitle,
          componentStack: info.componentStack ?? undefined,
        },
      },
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const description =
      this.props.fallbackDescription ??
      'Não foi possível carregar esta seção. Tente recarregar a página.';

    return (
      <section
        role="alert"
        aria-live="polite"
        aria-label={`Falha ao carregar: ${this.props.fallbackTitle}`}
        className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-5 py-8 text-center shadow-[var(--ds-shadow-xs)]"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
        >
          <AlertTriangle className="h-5 w-5 text-[var(--ds-color-danger)]" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-[var(--ds-color-danger-fg)]">
            {this.props.fallbackTitle}
          </h3>
          <p className="max-w-xs text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)] motion-safe:transition-colors hover:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  }
}

export default DashboardSectionBoundary;
