// Zero-dependency unit test for the pure C2B formatting helper (src/lib/pos/c2b-format.ts) — runs
// on Node's built-in test runner (Node 20+ `node --test`, with `--experimental-strip-types` for the
// TS syntax) since this repo has no JS/TS test framework installed yet. This directory is excluded
// from the Next.js/tsc app build (see tsconfig.json's `exclude`), same pattern as `e2e/`.
//
// Run from pos-ui/: node --experimental-strip-types --test node-tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTransTime } from '../src/lib/pos/c2b-format.ts';

test('formatTransTime parses a valid Daraja TransTime', () => {
  const result = formatTransTime('20260822143205');
  // Exact locale rendering can vary by ICU data, but it must be non-empty and mention the day.
  assert.notEqual(result, '');
  assert.match(result, /22/);
});

test('formatTransTime returns empty string for undefined', () => {
  assert.equal(formatTransTime(undefined), '');
});

test('formatTransTime returns empty string for empty string', () => {
  assert.equal(formatTransTime(''), '');
});

test('formatTransTime returns empty string for wrong length', () => {
  assert.equal(formatTransTime('202608221432'), ''); // 12 digits, not 14
  assert.equal(formatTransTime('2026082214320599'), ''); // 16 digits, not 14
});

test('formatTransTime returns empty string for non-numeric input', () => {
  assert.equal(formatTransTime('2026-08-22T14:32'), '');
});

test('formatTransTime returns empty string for an impossible date', () => {
  assert.equal(formatTransTime('20261399995999'), ''); // month 13, day 99, hour/min/sec out of range
});
