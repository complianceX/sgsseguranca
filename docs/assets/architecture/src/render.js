/**
 * Renderiza um fluxograma HTML para PNG (raster) ou PDF (vetorial).
 *
 * Reusa o Chromium que o Puppeteer do backend já resolve — não baixa outro
 * navegador nem adiciona dependência nova ao projeto.
 *
 * Uso (a partir da raiz do repositório):
 *   node docs/assets/architecture/src/render.js <entrada.html> <saida.png|pdf> [escala]
 *
 * Exemplos:
 *   node docs/assets/architecture/src/render.js \
 *     docs/assets/architecture/src/sgs-fluxograma-sistema.html \
 *     docs/assets/architecture/sgs-fluxograma-sistema.png 2
 *
 *   node docs/assets/architecture/src/render.js \
 *     docs/assets/architecture/src/sgs-fluxograma-sistema.html \
 *     docs/assets/architecture/sgs-fluxograma-sistema.pdf
 */
const path = require('path');
const { createRequire } = require('module');

// puppeteer é dependência do backend; este script vive em docs/.
const backendRequire = createRequire(
  path.resolve(__dirname, '../../../../backend/package.json'),
);
const puppeteer = backendRequire('puppeteer');

const VIEWPORT_WIDTH = 2000;

(async () => {
  const [htmlPath, outPath, scaleArg] = process.argv.slice(2);

  if (!htmlPath || !outPath) {
    console.error('uso: node render.js <entrada.html> <saida.png|pdf> [escala]');
    process.exit(1);
  }

  const scale = Number(scaleArg || 2);
  const isPdf = outPath.toLowerCase().endsWith('.pdf');

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: VIEWPORT_WIDTH,
      height: 1400,
      deviceScaleFactor: scale,
    });

    await page.goto('file:///' + path.resolve(htmlPath).replace(/\\/g, '/'), {
      waitUntil: 'networkidle0',
    });

    const dims = await page.evaluate(() => ({
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
    }));

    if (isPdf) {
      // vetorial — texto continua selecionável, bom para impressão/apresentação
      await page.pdf({
        path: outPath,
        width: dims.w + 'px',
        height: dims.h + 'px',
        printBackground: true,
        pageRanges: '1',
      });
    } else {
      await page.screenshot({ path: outPath, fullPage: true });
    }

    console.log(
      'OK',
      outPath,
      `${dims.w}x${dims.h} css px`,
      isPdf ? '(vetorial)' : `@${scale}x → ${dims.w * scale}x${dims.h * scale}`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('FALHOU:', error.message);
  process.exit(1);
});
