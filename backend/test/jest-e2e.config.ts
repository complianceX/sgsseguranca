import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/critical/**/*.e2e-spec.ts',
    '<rootDir>/aprs/**/*.e2e-spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^uuid$': '<rootDir>/uuid-cjs.js',
  },
  globalSetup: '<rootDir>/setup/e2e-infra-check.ts',
  globalTeardown: '<rootDir>/setup/e2e-global-teardown.ts',
  maxWorkers: 1,
  workerThreads: false,
};

export default config;
