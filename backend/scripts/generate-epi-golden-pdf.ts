import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { buildEpiAssignmentPdfHtml } from '../src/modules/epi-assignments/epi-assignment-pdf.template';
import { INSTITUTIONAL_PDF_FOOTER_TEMPLATE } from '../src/shared/services/pdf-institutional-template';

const repositoryRoot = path.resolve(__dirname, '..', '..');
const outputDir = path.join(repositoryRoot, 'output', 'pdf');
const temporaryDir = path.join(repositoryRoot, 'tmp', 'pdfs');
const pdfPath = path.join(outputDir, 'epi-ficha-entrega-golden.pdf');
const previewPath = path.join(temporaryDir, 'epi-ficha-entrega-golden.png');
const htmlPath = path.join(temporaryDir, 'epi-ficha-entrega-golden.html');

const fixture = {
  id: '11111111-1111-4111-8111-111111111111',
  company_id: 'company-fixture-001',
  site_id: 'site-fixture-001',
  quantidade: 2,
  ca: 'CA-12345',
  validade_ca: '2027-01-01T00:00:00.000Z',
  entregue_em: '2026-08-16T12:00:00.000Z',
  observacoes: 'Uso obrigatorio durante a atividade de campo.',
  company: { razao_social: 'Empresa Fixture SGS' },
  site: { nome: 'Obra Fixture Segura' },
  user: { nome: 'Joao da Silva' },
  epi: { nome: 'Capacete de seguranca' },
  assinatura_entrega: {
    signer_name: 'Joao da Silva',
    signature_type: 'digital',
    signature_hash: 'sha256-fixture-signature',
    timestamp_issued_at: '2026-08-16T12:00:01.000Z',
    timestamp_authority: 'SGS Fixture TSA',
  },
};

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(temporaryDir, { recursive: true });

  const html = buildEpiAssignmentPdfHtml(fixture);
  if (html.includes('signature_data') || html.includes('attacker')) {
    throw new Error('O golden PDF nao pode conter dados brutos de assinatura.');
  }
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') {
        void request.continue();
      } else {
        void request.abort('blockedbyclient');
      }
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: INSTITUTIONAL_PDF_FOOTER_TEMPLATE,
      margin: { top: '14mm', right: '14mm', bottom: '16mm', left: '14mm' },
      printBackground: true,
    });
    const pdfPreviewPage = await browser.newPage();
    await pdfPreviewPage.goto(pathToFileURL(pdfPath).href, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await pdfPreviewPage.screenshot({ path: previewPath, fullPage: true });
  } finally {
    await browser.close();
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  if (pdfBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('O golden PDF nao possui assinatura PDF valida.');
  }
  console.log(`EPI golden PDF: ${pdfPath}`);
  console.log(`HTML intermediario: ${htmlPath}`);
  console.log(`Preview PNG renderizado pelo Chromium: ${previewPath}`);
  console.log(`Bytes: ${pdfBytes.length}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
