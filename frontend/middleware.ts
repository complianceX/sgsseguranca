// Ponto de entrada obrigatório do Next.js Middleware.
// A lógica completa (CSP, auth guard, hidden routes) vive em proxy.ts
// para manter testabilidade independente do contrato de nome exigido pelo Next.js.
export { proxy as middleware, config } from './proxy';
