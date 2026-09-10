import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verbatim port of inventory-ui's e2e/docs-capture/lib/annotate.ts — framework-agnostic (pure
 * Playwright + DOM), no inventory-specific logic, so it's reused as-is rather than reinvented.
 *
 * One arrow-and-badge callout pointing at a field in a documentation screenshot. `locator` is a
 * real Playwright locator (getByPlaceholder/getByRole/etc.) — its bounding box is resolved via
 * boundingBox() in the Node/Playwright process, not by re-querying Playwright-only pseudo
 * selectors (:has-text(), text=) inside a plain page.evaluate(), which only understands real DOM
 * selector syntax.
 */
export interface Callout {
  locator: Locator;
  number: number;
  color?: string;
}

const OVERLAY_ID = '__docs_overlay__';
const DEFAULT_COLOR = '#dc2626';

export async function clearOverlay(page: Page) {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID);
}

/**
 * Screenshots the current viewport with numbered arrow callouts drawn over `callouts`' target
 * elements. Always a viewport (non full-page) screenshot: the overlay is position:fixed, which a
 * stitched full-page capture would place wrong on every scrolled section. Scroll the field you
 * want visible into view (locator.scrollIntoViewIfNeeded()) before calling this.
 */
export async function screenshotWithCallouts(page: Page, outPath: string, callouts: Callout[] = []) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await clearOverlay(page);

  const resolved: { rect: { left: number; top: number; width: number; height: number }; number: number; color?: string }[] = [];
  for (const item of callouts) {
    const box = await item.locator.first().boundingBox().catch(() => null);
    if (!box || (box.width === 0 && box.height === 0)) continue;
    resolved.push({ rect: { left: box.x, top: box.y, width: box.width, height: box.height }, number: item.number, color: item.color });
  }

  if (resolved.length) {
    await page.evaluate(
      ({ items, overlayId, defaultColor }) => {
        const layer = document.createElement('div');
        layer.id = overlayId;
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        document.body.appendChild(layer);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('style', 'position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:visible;');
        layer.appendChild(svg);

        for (const item of items as { rect: { left: number; top: number; width: number; height: number }; number: number; color?: string }[]) {
          const rect = item.rect;
          const color = item.color || defaultColor;

          const ring = document.createElement('div');
          ring.style.cssText = [
            'position:fixed',
            `left:${rect.left - 4}px`,
            `top:${rect.top - 4}px`,
            `width:${rect.width + 8}px`,
            `height:${rect.height + 8}px`,
            `border:3px solid ${color}`,
            'border-radius:8px',
            `box-shadow:0 0 0 3px ${color}33`,
          ].join(';');
          layer.appendChild(ring);

          const badgeSize = 28;
          const preferLeft = rect.left > badgeSize + 24;
          const badgeLeft = preferLeft
            ? rect.left - badgeSize - 14
            : Math.min(window.innerWidth - badgeSize - 4, rect.left + rect.width + 14);
          const badgeTop = Math.max(4, Math.min(window.innerHeight - badgeSize - 4, rect.top + rect.height / 2 - badgeSize / 2));
          const badge = document.createElement('div');
          badge.textContent = String(item.number);
          badge.style.cssText = [
            'position:fixed',
            `left:${badgeLeft}px`,
            `top:${badgeTop}px`,
            `width:${badgeSize}px`,
            `height:${badgeSize}px`,
            'border-radius:50%',
            `background:${color}`,
            'color:#fff',
            'font:700 14px system-ui,sans-serif',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'box-shadow:0 2px 6px rgba(0,0,0,.4)',
            'border:2px solid #fff',
          ].join(';');
          layer.appendChild(badge);

          const x1 = preferLeft ? badgeLeft + badgeSize : badgeLeft;
          const y1 = badgeTop + badgeSize / 2;
          const x2 = preferLeft ? rect.left - 4 : rect.left + rect.width + 4;
          const y2 = rect.top + rect.height / 2;

          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', String(x1));
          line.setAttribute('y1', String(y1));
          line.setAttribute('x2', String(x2));
          line.setAttribute('y2', String(y2));
          line.setAttribute('stroke', color);
          line.setAttribute('stroke-width', '2.5');
          svg.appendChild(line);

          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 9;
          const p2x = x2 - headLen * Math.cos(angle - Math.PI / 6);
          const p2y = y2 - headLen * Math.sin(angle - Math.PI / 6);
          const p3x = x2 - headLen * Math.cos(angle + Math.PI / 6);
          const p3y = y2 - headLen * Math.sin(angle + Math.PI / 6);
          const head = document.createElementNS(svgNS, 'polygon');
          head.setAttribute('points', `${x2},${y2} ${p2x},${p2y} ${p3x},${p3y}`);
          head.setAttribute('fill', color);
          svg.appendChild(head);
        }
      },
      { items: resolved, overlayId: OVERLAY_ID, defaultColor: DEFAULT_COLOR },
    );
  }

  await page.screenshot({ path: outPath });
  await clearOverlay(page);
}
