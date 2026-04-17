/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.(spec|smoke-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': require.resolve('ts-jest').replace(/\\/g, '/'),
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  maxWorkers: 1,
  silent: true,
  coverageThreshold: {
    global: {
      statements: 38,
      functions: 30,
      branches: 31,
    },
  },
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
