import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

/**
 * MetricItem — uma célula compacta na faixa de métricas.
 * Aparece acima do list shell quando `metrics` é fornecido.
 */
export interface MetricItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}

interface ListPageLayoutProps {
  /** Label acima do título (ex: "Documentos operacionais") */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Ícone no canto do header — use um componente Lucide wrappado */
  icon?: ReactNode;
  /** CTAs principais — aparecem à direita do PageHeader */
  actions?: ReactNode;
  /** Faixa de métricas — opcional; omitir quando não há KPIs relevantes */
  metrics?: MetricItem[];
  /**
   * Título da toolbar/painel de listagem.
   * Omitir quando o título da página já é suficiente como contexto.
   */
  toolbarTitle?: string;
  toolbarDescription?: string;
  /** Filtros, busca e selects de refinamento */
  toolbarContent?: ReactNode;
  /** Ações secundárias no lado direito da toolbar (ex: exportar, importar) */
  toolbarActions?: ReactNode;
  /** Corpo principal — tabela, grid de cards, etc. */
  children: ReactNode;
  /** Rodapé — tipicamente <PaginationControls /> */
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
}

/**
 * ListPageLayout — template oficial para páginas de listagem/CRUD.
 *
 * Estrutura:
 * ```
 * <PageHeader eyebrow title description icon actions />
 * <MetricStrip />               ← opcional
 * <ListShell>
 *   <Toolbar title + filters + toolbarActions />
 *   <Body>{children}</Body>
 *   <Footer><PaginationControls /></Footer>
 * </ListShell>
 * ```
 *
 * Uso mínimo:
 * ```tsx
 * <ListPageLayout title="APRs" actions={<Button>Nova APR</Button>}>
 *   <AprsTable />
 * </ListPageLayout>
 * ```
 *
 * Uso completo:
 * ```tsx
 * <ListPageLayout
 *   eyebrow="Documentos operacionais"
 *   title="Análise Preliminar de Risco"
 *   description="Gerencie APRs, acompanhe riscos e controle versões aprovadas."
 *   icon={<FileText className="h-5 w-5" />}
 *   actions={<Link href="/dashboard/aprs/new"><Button>Nova APR</Button></Link>}
 *   metrics={[
 *     { label: 'Total', value: 142, tone: 'neutral' },
 *     { label: 'Aprovadas', value: 98, tone: 'success' },
 *     { label: 'Pendentes', value: 31, tone: 'warning' },
 *   ]}
 *   toolbarTitle="Base de APRs"
 *   toolbarContent={<AprsFilters />}
 *   toolbarActions={<Button variant="outline" size="sm">Exportar</Button>}
 *   footer={<PaginationControls {...pagination} />}
 * >
 *   <AprsTable />
 * </ListPageLayout>
 * ```
 */
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
  toolbarActions,
  children,
  footer,
  className,
  panelClassName,
}: ListPageLayoutProps) {
  const hasToolbar = toolbarTitle || toolbarDescription || toolbarContent || toolbarActions;

  return (
    <div className={cn('ds-page-layout animate-fade-up', className)}>
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
        {hasToolbar ? (
          <div className="ds-list-toolbar">
            {(toolbarTitle || toolbarDescription || toolbarActions) ? (
              <div className="ds-list-toolbar__header">
                {(toolbarTitle || toolbarDescription) ? (
                  <div className="ds-list-toolbar__heading">
                    {toolbarTitle ? <h2 className="ds-list-toolbar__title">{toolbarTitle}</h2> : null}
                    {toolbarDescription ? (
                      <p className="ds-list-toolbar__description">{toolbarDescription}</p>
                    ) : null}
                  </div>
                ) : null}
                {toolbarActions ? (
                  <div className="ds-list-toolbar__actions">{toolbarActions}</div>
                ) : null}
              </div>
            ) : null}
            {toolbarContent ? (
              <div className="ds-list-toolbar__surface">
                <div className="ds-list-toolbar__row">{toolbarContent}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="ds-list-body">{children}</div>

        {footer ? <div className="ds-list-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
