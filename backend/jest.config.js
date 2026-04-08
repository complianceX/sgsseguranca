/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': require.resolve('ts-jest').replace(/\\/g, '/'),
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 30,
      functions: 16,
      branches: 24,
    },
  },
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
