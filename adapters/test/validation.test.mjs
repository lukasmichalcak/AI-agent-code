import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from '../chains.mjs';
test('read-only allowlist blocks signing and unsupported providers', () => {
  assert.throws(() => validateRequest({ provider: 'evm', operation: 'sign' }), /Read-only/);
  assert.throws(() => validateRequest({ provider: 'evil', operation: 'discover' }), /provider/);
});
test('reject mismatched native decimals and unknown chains', () => {
  assert.throws(() => validateRequest({ provider: 'evm', operation: 'balance', asset: { chain: {ecosystem:'evm',chainId:999}, kind:'native', decimals:18 } }), /Unsupported/);
  assert.throws(() => validateRequest({ provider: 'evm', operation: 'balance', asset: { chain: {ecosystem:'evm',chainId:8453}, kind:'native', decimals:6 } }), /decimals/);
});
