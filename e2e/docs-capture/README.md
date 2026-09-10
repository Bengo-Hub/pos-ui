# docs-capture

Playwright specs that take annotated screenshots for the "POS" section of the shared-docs user
guide (`shared-docs/docs/user-guide/pos/`). These are not a regression suite — they exercise the
real UI (search, add-to-cart, open a settings tab, generate a one-time approval code) and cancel
out or clear the cart afterward without ever completing a real sale, so nothing fails CI and no
demo data is created. They log into `codevertex-demo` (the platform's shared demo tenant) via PIN
login, mirroring the exact pattern inventory-ui's own `docs-capture` suite established (see
`lib/pin-login.ts`'s comments for the specific pos-ui adaptations — a single `/pin-login` page
with an internal outlet/PIN step toggle, rather than inventory-ui's separate `/auth/pin-login`
route).

## Re-running this

The guide's screenshots go stale whenever the terminal, Settings tabs, or any captured page's
layout changes. Re-run the relevant spec and re-publish shared-docs:

```
pnpm docs:capture
# or a single file:
pnpm test:e2e -- e2e/docs-capture/terminal.spec.ts --headed
```

`BASE_URL` and `E2E_ORG_SLUG` default to `https://pos.codevertexafrica.com` and `codevertex-demo`
(see `lib/pin-login.ts`'s `orgUrl()`); `E2E_ADMIN_PIN` defaults to `0000`.

Screenshots are written straight into the sibling `shared-docs` repo
(`docs/user-guide/pos/assets/`) — there's no copy step, so both repos need to be checked out side
by side (already the case for this monorepo-of-repos layout).

## Known gaps, deliberately not captured live

- **Sales Analytics** and **Tax Report** (`reports-and-dashboard.spec.ts`) — both hit a genuine
  live "rate limit exceeded" response from this demo tenant's analytics endpoint during this
  suite's own development (heavy repeated testing in a short window), and the Tax Report page
  crashed outright right after. Re-run these two specifically, alone, well after any other
  docs-capture activity against `codevertex-demo`, before trusting a fresh capture.
- **Sale Date** (backdating a sale at entry, on the terminal) — documented in prose only in
  `selling-and-checkout.md`; the button wasn't reliably visible during capture and isn't worth
  the extra fragility for one small feature.
- **Void/Complimentary code buttons on an already-open order** — `approvals-and-overrides.spec.ts`'s
  third test is best-effort: it needs a genuinely open/pending-payment order to already exist in
  the shared demo tenant (these buttons self-hide on every terminal status). Skips cleanly when
  none exists, which is the common case.

## A real, reproducible timing lesson from this suite

Several tabs/dialogs render their heading (and description) well above the actual content card —
scrolling to the tab's own `<h2>` heading (`openSettingsTab`'s built-in scroll) is **not** enough
to bring the real fields into the viewport. Scroll to the specific target element (e.g. the first
field's own label text) before screenshotting, not just the tab heading — see the Tax and Card
Terminal tests for the pattern.
