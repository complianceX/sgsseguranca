import type { Browser, LaunchOptions } from 'puppeteer';

/**
 * Carregador de Puppeteer para um backend CommonJS.
 *
 * ## Por que isto é necessário
 *
 * A partir da versão 25, o pacote `puppeteer` declara `"type": "module"` — é
 * ESM puro. O backend compila com `"module": "commonjs"`, então
 * `import * as puppeteer from 'puppeteer'` vira um `require()` no JavaScript
 * emitido, e o Node responde:
 *
 * ```
 * SyntaxError: Unexpected token 'export'
 * ```
 *
 * Isso não é hipotético: derrubou 95 suítes de teste na primeira execução após
 * o upgrade, porque qualquer arquivo que alcance o pool de browsers passa por
 * esse `require`.
 *
 * ## Como funciona
 *
 * Os **tipos** continuam vindo de um `import type`, que o TypeScript apaga na
 * compilação — não gera `require` nenhum. Só o acesso em tempo de execução
 * passa por aqui.
 *
 * O `import()` é construído via `new Function` de propósito. Com
 * `module: commonjs`, o TypeScript transpila `import()` literal para
 * `Promise.resolve().then(() => require(...))`, o que recria exatamente o
 * problema. Escondê-lo do compilador é o que preserva o `import()` dinâmico
 * nativo do Node, que sabe carregar ESM a partir de CommonJS.
 *
 * O módulo é carregado uma única vez e a promessa fica em cache: iniciar um
 * browser já é caro, e não faz sentido pagar a resolução do módulo a cada PDF.
 */

type PuppeteerModule = {
  launch: (options?: LaunchOptions) => Promise<Browser>;
  executablePath: () => Promise<string> | string;
};

type PuppeteerImport = PuppeteerModule & { default?: PuppeteerModule };

let modulePromise: Promise<PuppeteerModule> | null = null;

export function loadPuppeteer(): Promise<PuppeteerModule> {
  if (!modulePromise) {
    // `new Function` impede o TypeScript de transpilar o import() para require().
    //
    // O `no-implied-eval` existe para impedir que entrada de usuário vire
    // código. Não é o caso: o corpo da função é uma constante literal deste
    // arquivo, e o único parâmetro é o especificador — sempre a string
    // 'puppeteer', escrita logo abaixo. Nada externo alcança este ponto.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<PuppeteerImport>;

    modulePromise = dynamicImport('puppeteer').then((module) => {
      // O bundle ESM expõe a API tanto no default quanto nos named exports,
      // dependendo do interop. Aceitar os dois evita depender desse detalhe.
      return module.default ?? module;
    });
  }
  return modulePromise;
}

/** Descarta o cache. Existe para testes que precisam reprogramar o módulo. */
export function resetPuppeteerRuntimeCache(): void {
  modulePromise = null;
}
