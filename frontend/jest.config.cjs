const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  clearMocks: true,
  restoreMocks: true,
  detectOpenHandles: true,
  testTimeout: 15000,
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  coveragePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  watchPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  moduleNameMapper: {
    "^@/context/(.*)$": "<rootDir>/src/state/$1",
    "^@/(.*)$": ["<rootDir>/src/$1", "<rootDir>/$1"],
  },
};

module.exports = createJestConfig(customJestConfig);
