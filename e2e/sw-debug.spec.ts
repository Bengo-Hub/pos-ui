import { test } from '@playwright/test';

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';

test('diagnose service worker activation', async ({ page }) => {
  const failed: string[] = [];
  const swLogs: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/service worker|sw|workbox|cache|precache|register/i.test(t)) swLogs.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => swLogs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && (r.url().includes('/_next/') || r.url().includes('/sw') || r.url().includes('/workbox'))) {
      failed.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });
  // Poll the SW state up to ~100s to distinguish "slow precache" from "hung/failed install".
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(10_000);
    const s = await page.evaluate(async () => {
      const r = (await navigator.serviceWorker.getRegistrations())[0];
      return r ? `installing=${r.installing?.state ?? '-'} waiting=${r.waiting?.state ?? '-'} active=${r.active?.state ?? '-'}` : 'none';
    });
    console.log(`SW_POLL[${(i + 1) * 10}s]: ${s}`);
  }

  const state = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      supported: true,
      controller: !!navigator.serviceWorker.controller,
      controllerUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations: regs.map((r) => ({
        scope: r.scope,
        installing: r.installing?.state ?? null,
        waiting: r.waiting?.state ?? null,
        active: r.active?.state ?? null,
        activeUrl: r.active?.scriptURL ?? null,
      })),
    };
  });

  console.log('SW_STATE: ' + JSON.stringify(state));
  console.log('FAILED_REQUESTS: ' + JSON.stringify(failed.slice(0, 20)));
  console.log('SW_LOGS: ' + JSON.stringify(swLogs.slice(0, 20)));
});
