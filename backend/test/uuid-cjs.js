'use strict';
/**
 * CJS shim for uuid used ONLY in the Jest test environment.
 * uuid >=14 is pure ESM; Node.js 20+ can load it natively but Jest's
 * CommonJS transform cannot. This shim wraps crypto built-ins so the
 * test suite works without ESM mode.
 *
 * Production code is unaffected — the override in package.json
 * (`"uuid": ">=14.0.0"`) applies to the real runtime.
 */
const { randomUUID, createHash } = require('crypto');

function v1() { return randomUUID(); }
function v4() { return randomUUID(); }
function v6() { return randomUUID(); }
function v7() { return randomUUID(); }

function _hashUUID(name, namespace, ver) {
  const algo = ver === 3 ? 'md5' : 'sha1';
  const nsHex = String(namespace).replace(/-/g, '');
  const hash = createHash(algo)
    .update(Buffer.from(nsHex, 'hex'))
    .update(String(name))
    .digest('hex');
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    String(ver) + hash.slice(13, 16),
    variant + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function v3(name, namespace) { return _hashUUID(name, namespace, 3); }
function v5(name, namespace) { return _hashUUID(name, namespace, 5); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validate(str) { return typeof str === 'string' && UUID_RE.test(str); }
function version(str) { return parseInt(str[14], 16); }

function parse(str) {
  const hex = str.replace(/-/g, '');
  const arr = new Uint8Array(16);
  for (let i = 0; i < 16; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function stringify(arr) {
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

const NIL = '00000000-0000-0000-0000-000000000000';
const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

module.exports = { v1, v3, v4, v5, v6, v7, validate, version, parse, stringify, NIL, MAX };
