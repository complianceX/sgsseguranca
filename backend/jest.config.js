/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.(spec|smoke-spec)\\.ts$',
  transform: {
    // Puppeteer 25 e suas dependencias diretas (puppeteer-core,
    // @puppeteer/browsers, chromium-bidi, yargs) sao ESM puro. Sem isso, o
    // Jest quebra com "SyntaxError: Unexpected token 'export'" em qualquer
    // suite que alcance (mesmo transitivamente) o pool de browsers do PDF.
    // Deixamos o ts-jest reescrever esses pacotes especificos para
    // CommonJS durante o teste; producao nunca passa por aqui.
    '^.+\\.(t|j)s$': [
      require.resolve('ts-jest').replace(/\\/g, '/'),
      { tsconfig: { allowJs: true } },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(puppeteer|puppeteer-core|@puppeteer|chromium-bidi|yargs)/)',
  ],
  // uuid >=14 is pure ESM and cannot be loaded by Jest's CJS transform.
  // This CJS shim mirrors the full uuid API using Node's built-in crypto.
  // Production runtime uses uuid@14 directly (override in package.json).
  moduleNameMapper: {
    '^uuid$': '<rootDir>/test/uuid-cjs.js',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  maxWorkers: 1,
  silent: true,
  coverageThreshold: {
    global: {
      statements: 49,
      functions: 40,
      branches: 40,
    },
  },
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
