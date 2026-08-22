/**
 * Official M-Pesa (Safaricom) mark — served as a static asset (public/mpesa-logo.svg, sourced from
 * Wikimedia Commons: https://commons.wikimedia.org/wiki/File:M-PESA_LOGO-01.svg, public domain per
 * Commons — below the threshold of originality). ONE file, referenced everywhere a tender button
 * needs the real M-Pesa mark instead of a generic phone/bank icon — no inlined/duplicated SVG path
 * data between components. The same file is duplicated 1:1 into treasury-ui's public/ folder (see
 * treasury-ui/src/components/payments/logos/MpesaLogo.tsx) so both apps render the identical mark.
 */
export function MpesaLogo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static icon, no next/image needed
  return <img src="/mpesa-logo.svg" alt="M-Pesa" className={className} />;
}
