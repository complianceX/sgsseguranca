import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testTimeout: 60000,
  testMatch: [
    '<rootDir>/critical/**/*.e2e-spec.ts',
    '<rootDir>/aprs/**/*.e2e-spec.ts',
    '<rootDir>/idor-security.e2e-spec.ts',
    '<rootDir>/multi-tenancy.e2e-spec.ts',
  ],
  transform: {
    // O Puppeteer 25 e suas dependencias diretas (puppeteer-core,
    // @puppeteer/browsers, chromium-bidi, yargs) sao ESM puro. O Jest nao
    // sabe executar ESM cru (nem via require, nem via createRequire — so o
    // import() dinamico do proprio Node consegue, e mesmo esse tem uma
    // corrida ruim com o desmonte do ambiente por arquivo de teste no E2E).
    // A saida padrao da industria para isso: deixar o transform (aqui,
    // ts-jest) reescrever esses pacotes para CommonJS durante o teste,
    // liberando allowJs so para esse transform. Producao nunca passa por
    // aqui — usa o pacote real, carregado pelo require nativo do Node 22
    // (que sabe pontar para pacotes ESM quando o package.json expoe a
    // condicao "require", como o puppeteer expoe).
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(puppeteer|puppeteer-core|@puppeteer|chromium-bidi|yargs)/)',
  ],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/uuid-cjs.js',
  },
  globalSetup: '<rootDir>/setup/e2e-infra-check.ts',
  globalTeardown: '<rootDir>/setup/e2e-global-teardown.ts',
  openHandlesTimeout: 10_000,
  maxWorkers: 1,
  workerThreads: false,
};

export default config;
