import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';
import { MetricCard } from '@/components/ui/metric-card';

/**
 * MetricItem — uma celula compacta na faixa de metricas.
 * Aparece acima do list shell quando `metrics` e fornecido.
 */
export interface MetricItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /**
   * Escolha o tone pelo significado da métrica, não por estética:
   * `danger` (vencido/crítico), `warning` (pendente/vencendo),
   * `success` (concluído/conforme), `primary` (destaque do recorte atual),
   * `neutral` (contagem sem conotação).
   */
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}

interface ListPageLayoutProps {
  /** Label acima do titulo (ex: "Documentos operacionais") */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Icone no canto do header — use um componente Lucide wrappado */
  icon?: ReactNode;
  /** CTAs principais — aparecem a direita do PageHeader */
  actions?: ReactNode;
  /** Faixa de metricas — opcional; omitir quando nao ha KPIs relevantes */
  metrics?: MetricItem[];
  /**
   * Titulo da toolbar/painel de listagem.
   * Omitir quando o titulo da pagina ja e suficiente como contexto.
   */
  toolbarTitle?: string;
  toolbarDescription?: string;
  /** Filtros, busca e selects de refinamento */
  toolbarContent?: ReactNode;
  /** Acoes secundarias no lado direito da toolbar (ex: exportar, importar) */
  toolbarActions?: ReactNode;
  /** Corpo principal — tabela, grid de cards, etc. */
  children: ReactNode;
  /** Rodape — tipicamente <PaginationControls /> */
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
}

/**
 * ListPageLayout — template oficial para paginas de listagem/CRUD.
 *
 * Estrutura:
 * ```
 * <PageHeader eyebrow title description icon actions />
 * <MetricStrip />               <- opcional
 * <ListShell>
 *   <Toolbar title + filters + toolbarActions />
 *   <Body>{children}</Body>
 *   <Footer><PaginationControls /></Footer>
 * </ListShell>
 * ```
 *
 * Uso minimo:
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
 *   title="Analise Preliminar de Risco"
 *   description="Gerencie APRs, acompanhe riscos e controle versoes aprovadas."
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
    <div className={cn('ds-page-layout', className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        actions={actions}
      />

      {metrics?.length ? (
        <section
          aria-label={`Metricas de ${title}`}
          className="ds-metric-strip"
        >
          {metrics.map((item) => (
            <MetricCard
              key={item.label}
              variant="strip"
              label={item.label}
              value={item.value}
              note={item.note}
              tone={item.tone}
            />
          ))}
        </section>
      ) : null}

      <section
        aria-label={toolbarTitle ?? title}
        className={cn('ds-list-shell', panelClassName)}
      >
        {hasToolbar ? (
          <div className="ds-list-toolbar">
            {(toolbarTitle || toolbarDescription || toolbarActions) ? (
              <div className="ds-list-toolbar__header">
                {(toolbarTitle || toolbarDescription) ? (
                  <div className="ds-list-toolbar__heading">
                    {toolbarTitle ? (
                      <h2 className="ds-list-toolbar__title">{toolbarTitle}</h2>
                    ) : null}
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
