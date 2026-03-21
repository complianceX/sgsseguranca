/**
 * Tipos derivados do schema OpenAPI de contratos governados.
 *
 * Gerado por: npm run api:generate:governed-contracts
 * Fonte: backend/openapi/governed-contracts.openapi.json
 *
 * NÃO edite manualmente — regenere a partir do backend.
 */
import type { components } from "./governed-contracts.schema";

/* ------------------------------------------------------------------ */
/*  PDF Access — substitui os 9 *PdfAccessResponse manuais            */
/* ------------------------------------------------------------------ */

/** Resposta canônica de acesso a PDF governado (gerada do backend). */
export type GovernedPdfAccessResponse =
  components["schemas"]["GovernedPdfAccessResponseDto"];

/** Enum de disponibilidade de PDF governado. */
export type GovernedPdfAccessAvailability =
  GovernedPdfAccessResponse["availability"];

/* ------------------------------------------------------------------ */
/*  Mail Dispatch — substitui DocumentMailDispatchResponse manual      */
/* ------------------------------------------------------------------ */

/** Resposta canônica de dispatch de e-mail documental (gerada do backend). */
export type DocumentMailDispatchResponse =
  components["schemas"]["DocumentMailDispatchResponseDto"];

/** Modo de entrega de e-mail. */
export type DocumentMailDeliveryMode =
  DocumentMailDispatchResponse["deliveryMode"];

/** Tipo de artefato anexado ao e-mail. */
export type DocumentMailArtifactType =
  DocumentMailDispatchResponse["artifactType"];
