/**
 * Wrapper oficial da suíte de carga enterprise.
 *
 * Motivo:
 * - Mantemos a implementação principal em `backend/test/load/k6-load-test.js`
 *   junto com os fixtures do backend.
 * - Expondo este wrapper em `test/load/k6-load-test.js`, preservamos o comando
 *   solicitado para operação e documentação.
 */
export * from '../../backend/test/load/k6-load-test.js';
export { default } from '../../backend/test/load/k6-load-test.js';
