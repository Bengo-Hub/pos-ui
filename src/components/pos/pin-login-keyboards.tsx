'use client';

/**
 * Re-exports the shared PIN-login keyboards (@bengo-hub/shared-ui-lib/pin-login) — the numeric
 * keypad + on-screen QWERTY used to be duplicated per-app; they now live in shared-ui-lib so
 * every service (POS/Library/Inventory) gets the same one. Kept as a thin re-export so existing
 * imports (`@/components/pos/pin-login-keyboards`, e.g. the manager-approval PINKeypad adapter in
 * `pin-keypad.tsx`) don't need to change.
 */

export { PinKeypad, QwertyKeyboard } from '@bengo-hub/shared-ui-lib/pin-login';
export type { PinKeypadProps, QwertyKeyboardProps } from '@bengo-hub/shared-ui-lib/pin-login';
