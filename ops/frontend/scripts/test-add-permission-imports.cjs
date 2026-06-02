const assert = require('node:assert/strict');
const path = require('node:path');
const {
  hasPermissionImport,
  shouldSkipFile,
} = require('./add-permission-imports.js');

assert.equal(
  hasPermissionImport("import { Permission, PermissionPrefix } from '@/lib/permissions';"),
  true,
);
assert.equal(
  hasPermissionImport("import { PermissionPrefix } from '@/lib/permissions';"),
  false,
);
assert.equal(
  hasPermissionImport("import { Permission } from './permissions';"),
  true,
);
assert.equal(
  shouldSkipFile(path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'lib', 'permissions.ts')),
  true,
);

console.log('ADD_PERMISSION_IMPORTS_TEST_OK');
