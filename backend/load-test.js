// Wrapper de compatibilidade.
// O script real agora vive em test/load/k6-enterprise-scale.js
// para garantir cenarios alinhados ao contrato real da API.

export {
  authScenario,
  dashboardScenario,
  documentImportScenario,
  handleSummary,
  options,
  pdfQueueScenario,
  setup,
} from './test/load/k6-enterprise-scale.js';

export { default } from './test/load/k6-enterprise-scale.js';
