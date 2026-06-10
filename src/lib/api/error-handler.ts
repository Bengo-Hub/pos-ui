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
  /** Present on usage_limit_exceeded — overage metadata for the limit-reached modal */
  limit?: LimitReachedInfo;
}

/** Structured overage metadata returned by subscription-service on a metered limit (402). */
export interface LimitReachedInfo {
  metric: string;
  limit: number;
  used: number;
  /** True when the metric supports pay-as-you-go extra usage. */
  overageEligible: boolean;
  /** KES price per overage unit (per overageUnit quantum). */
  overageUnitPrice: number;
  /** Human unit label, e.g. "per 100 orders". */
  overageUnit: string;
  /** Sum of overage already accrued this period (KES). */
  accruedOverageKes: number;
  upgradeUrl?: string;
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
    limit: parseLimitInfo(data),
  };
}

/** Extracts the overage/limit metadata from a structured usage_limit_exceeded body. */
export function parseLimitInfo(data: any): LimitReachedInfo | undefined {
  if (!data || data.metric === undefined || data.limit === undefined) return undefined;
  return {
    metric: String(data.metric),
    limit: Number(data.limit) || 0,
    used: Number(data.used) || 0,
    overageEligible: !!data.overage_eligible,
    overageUnitPrice: Number(data.overage_unit_price) || 0,
    overageUnit: String(data.overage_unit ?? ''),
    accruedOverageKes: Number(data.accrued_overage_kes) || 0,
    upgradeUrl: data.upgrade_url,
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
