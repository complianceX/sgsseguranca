import type { PdfContext } from "../core/types";
import { applyDocumentFooter } from "../core/pagination";

type FooterGovernanceOptions = {
  code: string;
  generatedAt?: string;
  issuer?: string;
  draft?: boolean;
};

export function applyFooterGovernance(ctx: PdfContext, options: FooterGovernanceOptions) {
  applyDocumentFooter(ctx, options);
}
