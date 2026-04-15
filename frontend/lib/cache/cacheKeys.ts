/**
 * TTL padrao para consultas do dashboard (em ms).
 * Alinhado com a janela de stale do backend (300s) para evitar re-requests
 * desnecessarios ao Redis enquanto o cache ainda e valido no servidor.
 */
export const DASHBOARD_CACHE_TTL_MS = 180_000;

export const CACHE_KEYS = {
  notificationsUnreadCount: 'notifications-unread-count',
  notificationsList: 'notifications-list',
  sgsInsights: 'sgs-insights',
  dashboardSummary: 'dashboard-summary',
  dashboardPendingQueue: 'dashboard-pending-queue',
  catsSummary: 'cats-summary',
  catsSitesLookup: 'cats-sites-lookup',
  catsWorkersLookup: 'cats-workers-lookup',
  correctiveActionsSummary: 'corrective-actions-summary',
  correctiveActionsSlaOverview: 'corrective-actions-sla-overview',
  correctiveActionsSlaBySite: 'corrective-actions-sla-by-site',
  correctiveActionsUsersLookup: 'corrective-actions-users-lookup',
  epiAssignmentsSummary: 'epi-assignments-summary',
  epiFichasEpisLookup: 'epi-fichas-epis-lookup',
  epiFichasUsersLookup: 'epi-fichas-users-lookup',
  kpisCatStatistics: 'kpis-cat-statistics',
  kpisCorrectiveActionsSummary: 'kpis-corrective-actions-summary',
  kpisCorrectiveActionsSlaBySite: 'kpis-corrective-actions-sla-by-site',
  kpisNonconformitiesMonthly: 'kpis-nonconformities-monthly',
  kpisTrainingsExpirySummary: 'kpis-trainings-expiry-summary',
  executiveKpis: 'executive-kpis',
  executiveHeatmap: 'executive-heatmap',
  riskMapMatrix: 'risk-map-matrix',
  riskMapSites: 'risk-map-sites',
} as const;
