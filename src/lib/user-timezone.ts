/**
 * Time zones for screens, from `@bengo-hub/shared-ui-lib/format` (v0.1.146). SSO owns the zones:
 * a screen shows times in the signed-in person's zone, then the organisation's, then
 * Africa/Nairobi. The app calls `applyUserTimeZone(me, me.tenant)` once /me loads.
 *
 * Kept as this module so call sites import from one place; the logic lives in the shared library.
 */
export {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  resolveTimeZone,
  getActiveTimeZone,
  setActiveTimeZone,
  applyUserTimeZone,
  subscribeTimeZone,
  formatDate,
  formatDateTime,
  formatTime,
  toUserZone,
  type TimeZoneUser,
  type TimeZoneTenant,
  type DateInput,
  type DateFormatOptions,
} from '@bengo-hub/shared-ui-lib/format';
