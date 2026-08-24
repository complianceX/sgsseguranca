/**
 * Mock leve de Puppeteer para testes E2E.
 *
 * O shim real (puppeteer-cjs-shim.js) usa `new Function` para escapar do
 * sistema de módulos do Jest e carrega o Puppeteer ESM real (~300-600 MB de
 * heap). Nos testes E2E o que importa é o contrato HTTP do endpoint, não o
 * conteúdo visual do PDF. Este mock retorna um buffer PDF mínimo válido sem
 * lançar o Chromium, eliminando o OOM no CI.
 *
 * Formato: CJS (exigido pelo moduleNameMapper do jest-e2e.config.ts que
 * intercepta `require('puppeteer')` no processo Jest+NestJS unificado).
 */

'use strict';

// PDF mínimo válido (PDF 1.4) — reconhecido como PDF por qualquer leitor.
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n' +
    '2 0 obj\n<</Type /Pages /Count 1 /Kids [3 0 R]>>\nendobj\n' +
    '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>\nendobj\n' +
    'xref\n0 4\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000064 00000 n \n' +
    '0000000125 00000 n \n' +
    'trailer\n<</Size 4 /Root 1 0 R>>\n' +
    'startxref\n190\n%%EOF\n',
);

function makeMockPage(parentBrowser) {
  return {
    // Configuração de timeout — chamada pelo PuppeteerPoolService.getPage()
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
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
    pdf: async () => MINIMAL_PDF,
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
