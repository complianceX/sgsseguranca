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
 * Cada chamada refaz o `import()` — de propósito, sem cache próprio em escopo
 * de módulo. O Node já mantém seu registro de módulos ESM por processo,
 * então uma segunda importação do mesmo especificador resolve quase
 * instantaneamente a partir desse cache nativo, sem reexecutar o módulo.
 *
 * A primeira versão desta função cacheava a Promise do `import()` numa
 * variável de módulo. Nos testes E2E (Jest, `--runInBand`), isso quebrou:
 * cada arquivo `.e2e-spec.ts` roda no mesmo processo mas em seu próprio
 * ambiente Jest, que é desmontado ao final do arquivo. Se a Promise cacheada
 * ainda não tivesse assentado quando esse desmonte acontecia, o arquivo
 * seguinte herdava uma Promise presa a um ambiente morto — e todo `getPage()`
 * subsequente falhava com `Cannot read properties of undefined`, derrubando
 * a geração de PDF em cascata pelos testes restantes. Sem cache próprio, cada
 * chamada é independente e usa o cache do Node, que não tem esse problema.
 */

type PuppeteerModule = {
  launch: (options?: LaunchOptions) => Promise<Browser>;
  executablePath: () => Promise<string> | string;
};

type PuppeteerImport = PuppeteerModule & { default?: PuppeteerModule };

export async function loadPuppeteer(): Promise<PuppeteerModule> {
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

  const module = await dynamicImport('puppeteer');
  // O bundle ESM expõe a API tanto no default quanto nos named exports,
  // dependendo do interop. Aceitar os dois evita depender desse detalhe.
  return module.default ?? module;
}
