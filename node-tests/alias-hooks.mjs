// Resolves the app's "@/" import alias (tsconfig paths) to src/*.ts for node:test, so a module that
// imports another through "@/" can be tested directly. Registered by a test with
// register('./alias-hooks.mjs', import.meta.url) before it imports the module under test.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(`../src/${specifier.slice(2)}${suffix}`, import.meta.url);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
