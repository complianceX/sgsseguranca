/**
 * Mock leve de Puppeteer para testes E2E.
 *
 * O shim real (puppeteer-cjs-shim.js) usa `new Function` para escapar do
 * sistema de módulos do Jest e carrega o Puppeteer ESM real (~300-600 MB de
 * heap). Nos testes E2E o que importa é o contrato HTTP do endpoint, não o
 * conteúdo visual do PDF. Este mock retorna um PDF sintético válido sem
 * lançar o Chromium, eliminando o OOM no CI.
 *
 * Formato: CJS (exigido pelo moduleNameMapper do jest-e2e.config.ts que
 * intercepta `require('puppeteer')` no processo Jest+NestJS unificado).
 */

'use strict';

function buildPdf(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = Buffer.concat(chunks).length;
    chunks.push(
      Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, 'latin1'),
    );
  }

  const xrefOffset = Buffer.concat(chunks).length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  xref +=
    `trailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

// O conteúdo é determinístico para cobrir tamanho e extração no contrato E2E.
const syntheticPdfContent = [
  'BT',
  '/F1 12 Tf',
  '72 720 Td',
  '(APR - AN\\301LISE PRELIMINAR DE RISCOS) Tj',
  '0 -18 Td',
  '(APR-BATCH-001) Tj',
  '0 -18 Td',
  '(APR lote governado 1) Tj',
  '0 -18 Td',
  '(Tenant A SST LTDA) Tj',
  '0 -18 Td',
  '(11222333000181) Tj',
  '0 -18 Td',
  '(Site A) Tj',
  '0 -18 Td',
  '(22/05/2026) Tj',
  '0 -18 Td',
  '(23/05/2026) Tj',
  '0 -18 Td',
  '(Tecnico A) Tj',
  '0 -18 Td',
  '(Técnico de Segurança do Trabalho) Tj',
  '0 -18 Td',
  '(Administrador da empresa) Tj',
  '0 -18 Td',
  '(CARGO / FUNÇÃO) Tj',
  '0 -18 Td',
  '(Assinado) Tj',
  '0 -18 Td',
  '(Aprovado) Tj',
  '0 -18 Td',
  '(Assinatura desenhada) Tj',
  '0 -18 Td',
  '(Imagem da assinatura registrada) Tj',
  '0 -18 Td',
  '(Admin A) Tj',
  '0 -18 Td',
  '(Operação de rotina) Tj',
  '0 -18 Td',
  '(Ruído) Tj',
  '0 -18 Td',
  '(Exposição eventual) Tj',
  '0 -18 Td',
  '(Linha de produção) Tj',
  '0 -18 Td',
  '(Perda auditiva) Tj',
  '0 -18 Td',
  '(Uso de EPI e monitoramento) Tj',
  '0 -18 Td',
  '(Técnico SST) Tj',
  '0 -18 Td',
  '(Aprovada) Tj',
  '0 -18 Td',
  '(APR validada para emissão em lote.) Tj',
  '0 -18 Td',
  '(Assinaturas registradas) Tj',
  '0 -18 Td',
  '(Autenticidade e rastreabilidade) Tj',
  'ET',
  ' '.repeat(12_000),
].join('\n');

const SYNTHETIC_PDF = buildPdf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
    '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(syntheticPdfContent, 'latin1')} >>\n` +
    `stream\n${syntheticPdfContent}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
]);

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);

function makeMockPage(parentBrowser) {
  return {
    // Configuração de timeout — chamada pelo PuppeteerPoolService.getPage()
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    setJavaScriptEnabled: async () => {},
    // Interceptação de rede — chamada pelo PdfService.generateFromHtml()
    setRequestInterception: async () => {},
    setContent: async () => {},
    emulateMediaType: async () => {},
    setViewport: async () => {},
    setCacheEnabled: async () => {},
    setExtraHTTPHeaders: async () => {},
    evaluate: async () => null,
    waitForSelector: async () => null,
    waitForFunction: async () => null,
    pdf: async () => SYNTHETIC_PDF,
    screenshot: async () => MINIMAL_PDF,
    close: async () => {},
    // Necessário para PuppeteerPoolService.releasePage() identificar o browser
    browser: () => parentBrowser,
    on: () => {},
    off: () => {},
    removeListener: () => {},
  };
}

function makeMockBrowser() {
  const pages = [];
  const browser = {
    newPage: async () => {
      const page = makeMockPage(browser);
      pages.push(page);
      return page;
    },
    pages: async () => [...pages],
    close: async () => {},
    process: () => ({ pid: -1 }),
    // connected=true evita que o pool recicle o browser em toda chamada getPage()
    connected: true,
    on: () => {},
    off: () => {},
    removeListener: () => {},
    isConnected: () => true,
  };
  return browser;
}

module.exports = {
  launch: async (_options) => makeMockBrowser(),
  executablePath: async () => '/puppeteer-e2e-mock',
  defaultArgs: () => [],
};
