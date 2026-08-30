'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Production images use the compiled contract. Tests and migration tooling
// must also work before build, so a clean checkout can load the same source
// contract through ts-node without introducing a second implementation.
const compiledContractPath = path.resolve(
  __dirname,
  '../dist/shared/config/environment-contract.js',
);
const sourceContractPath = path.resolve(
  __dirname,
  '../src/shared/config/environment-contract.ts',
);

function loadEnvironmentContract(options = {}) {
  const compiledPath = options.compiledPath || compiledContractPath;
  if (fs.existsSync(compiledPath)) {
    return require(compiledPath);
  }

  require('ts-node/register/transpile-only');
  return require(sourceContractPath);
}

const contract = loadEnvironmentContract();

function assertScriptEnvironment(options) {
  try {
    contract.validateCommonEnvironment(process.env, options);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'ENVIRONMENT_INVALID';
    throw new Error(`[environment-contract] ${message}`);
  }
}

module.exports = { assertScriptEnvironment, loadEnvironmentContract };
