/**
 * Screen-level use-case configuration for the adaptive POS terminal.
 *
 * `useModuleAccess` gates NAVIGATION by use case; this module drives the SCREEN — the terminal
 * layout, default catalog display, and which cart actions/controls render — so a single `/order`
 * page adapts to retail · pharmacy · hospitality · quick_service · services without per-vertical
 * pages. One source of truth, consumed by the order terminal (and reusable elsewhere).
 */

export type TerminalProfile = 'retail' | 'pharmacy' | 'hospitality' | 'quick_service' | 'services';
export type DisplayMode = 'card' | 'list' | 'image_grid';

export interface TerminalConfig {
  /** Normalised profile for the current outlet's use_case. */
  profile: TerminalProfile;
  /** Default catalog display mode for this use case. */
  defaultDisplayMode: DisplayMode;
  /** Auto-focus the scan/search field on load (retail/pharmacy fast checkout). */
  barcodeFirst: boolean;
  /** Show the Retail/Wholesale pricing-profile selector. */
  showPricingProfile: boolean;
  /** Show dine-in/takeaway order-type + table selection (hospitality/quick_service). */
  showOrderType: boolean;
  /** Per-item course assignment + Fire Courses (sit-down hospitality). */
  showCourses: boolean;
  /** Mandatory sales-person / staff attribution on the cart (services). */
  showStaffAttribution: boolean;
  /** Show the on-screen calculator overlay (retail/pharmacy). */
  showCalculator: boolean;
  /** Keyboard-first checkout: Enter pays when the cart has items and no field is focused. */
  keyboardCheckout: boolean;
  /** Show the brand grid filter (retail). */
  showBrandGrid: boolean;
  /** Title shown on the terminal header / new-order action. */
  terminalTitle: string;
}

const HOSPITALITY = ['hospitality', 'hotel', 'bar', 'cafe', 'restaurant'];
const QUICK = ['quick_service', 'quick service'];

/** Collapse any raw outlet use_case string into a terminal profile. Defaults to retail. */
export function normalizeUseCase(useCase?: string | null): TerminalProfile {
  const uc = (useCase ?? '').toLowerCase();
  if (HOSPITALITY.some((h) => uc.includes(h))) return 'hospitality';
  if (QUICK.some((q) => uc.includes(q))) return 'quick_service';
  if (uc.includes('pharmacy')) return 'pharmacy';
  if (uc.includes('service') || uc.includes('salon') || uc.includes('clinic') || uc.includes('spa')) return 'services';
  return 'retail';
}

/** Pure terminal config for a given outlet use_case. */
export function terminalConfigFor(useCase?: string | null): TerminalConfig {
  const profile = normalizeUseCase(useCase);
  switch (profile) {
    case 'hospitality':
      return {
        profile, defaultDisplayMode: 'image_grid', barcodeFirst: false, showPricingProfile: false,
        showOrderType: true, showCourses: true, showStaffAttribution: false, showCalculator: false,
        keyboardCheckout: false, showBrandGrid: false, terminalTitle: 'New Order',
      };
    case 'quick_service':
      return {
        profile, defaultDisplayMode: 'card', barcodeFirst: false, showPricingProfile: false,
        showOrderType: true, showCourses: false, showStaffAttribution: false, showCalculator: false,
        keyboardCheckout: false, showBrandGrid: false, terminalTitle: 'New Order',
      };
    case 'pharmacy':
      return {
        profile, defaultDisplayMode: 'list', barcodeFirst: true, showPricingProfile: true,
        showOrderType: false, showCourses: false, showStaffAttribution: false, showCalculator: true,
        keyboardCheckout: true, showBrandGrid: false, terminalTitle: 'Walk-In Sale',
      };
    case 'services':
      return {
        profile, defaultDisplayMode: 'card', barcodeFirst: false, showPricingProfile: false,
        showOrderType: false, showCourses: false, showStaffAttribution: true, showCalculator: false,
        keyboardCheckout: false, showBrandGrid: false, terminalTitle: 'New Sale',
      };
    case 'retail':
    default:
      return {
        profile: 'retail', defaultDisplayMode: 'list', barcodeFirst: true, showPricingProfile: true,
        showOrderType: false, showCourses: false, showStaffAttribution: false, showCalculator: true,
        keyboardCheckout: true, showBrandGrid: true, terminalTitle: 'New Sale',
      };
  }
}
