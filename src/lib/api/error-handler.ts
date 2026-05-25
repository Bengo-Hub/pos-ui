/**
 * Central API error parser — converts raw axios errors into structured types
 * so every layer (toasts, redirects, UI state) works from one source of truth.
 */

export type SubscriptionErrorCode =
  | 'subscription_inactive'
  | 'subscription_expired'
  | 'feature_not_available'
  | 'usage_limit_exceeded'
  | 'device_limit_reached'
  | 'plan_upgrade_required';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  /** Present on subscription errors — describes what limit was hit */
  detail?: string;
  /** Present on subscription errors — recommended plan to upgrade to */
  upgrade_plan?: string;
}

export interface SubscriptionError extends ApiError {
  code: SubscriptionErrorCode;
}

const SUBSCRIPTION_CODES = new Set<SubscriptionErrorCode>([
  'subscription_inactive',
  'subscription_expired',
  'feature_not_available',
  'usage_limit_exceeded',
  'device_limit_reached',
  'plan_upgrade_required',
]);

export function isSubscriptionError(data: any): data is SubscriptionError {
  if (!data) return false;
  // Legacy shape: { upgrade: true }
  if (data.upgrade === true) return true;
  return SUBSCRIPTION_CODES.has(data?.code as SubscriptionErrorCode);
}

export function parseApiError(error: any): ApiError {
  const response = error?.response;
  const status: number = response?.status ?? 0;
  const data = response?.data ?? {};

  return {
    status,
    code: data.code ?? 'unknown_error',
    message: data.message ?? data.error ?? error?.message ?? 'An unexpected error occurred.',
    detail: data.detail ?? data.description,
    upgrade_plan: data.upgrade_plan,
  };
}

const SUBSCRIPTION_MESSAGES: Record<SubscriptionErrorCode, string> = {
  subscription_inactive: 'Your subscription is inactive. Please renew to continue.',
  subscription_expired: 'Your subscription has expired. Renew now to restore access.',
  feature_not_available: 'This feature is not available on your current plan.',
  usage_limit_exceeded: 'You have reached the usage limit for your plan.',
  device_limit_reached: 'Device limit reached. Upgrade your plan to add more devices.',
  plan_upgrade_required: 'An upgrade is required to access this feature.',
};

export function subscriptionErrorMessage(data: any): string {
  const code = data?.code as SubscriptionErrorCode;
  if (code && SUBSCRIPTION_MESSAGES[code]) {
    return data.message || SUBSCRIPTION_MESSAGES[code];
  }
  return data?.message || SUBSCRIPTION_MESSAGES.subscription_inactive;
}
