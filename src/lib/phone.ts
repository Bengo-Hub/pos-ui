/**
 * Kenyan phone normalization shared across customer / loyalty capture.
 * Canonicalises "+254 792 548766", "254792548766", "792548766", "0792 548 766" → "0792548766"
 * so a typed number consistently matches the stored account/contact (pos-api also matches on the
 * last-9 national subscriber digits as a safety net for legacy mixed-format data).
 */

/** All digits, no spaces/punctuation/leading +. */
export function phoneDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

/** The 9-digit national subscriber number (last 9 digits), or '' if too short. */
export function nationalSubscriberDigits(raw: string): string {
  const d = phoneDigits(raw);
  return d.length >= 9 ? d.slice(-9) : '';
}

/** Canonical Kenyan local format: 0 + the 9-digit subscriber number (e.g. "0743793901"). */
export function normalizeKePhone(raw: string): string {
  const nat = nationalSubscriberDigits(raw);
  if (!nat) return (raw || '').trim();
  return `0${nat}`;
}

/** A phone has enough digits to be a usable lookup key. */
export function isUsablePhone(raw: string): boolean {
  return phoneDigits(raw).length >= 9;
}
