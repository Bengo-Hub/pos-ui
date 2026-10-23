import { Monitor, Smartphone, Tablet } from 'lucide-react';

/** Icon for a device kind (client trail device_kind, or a POS device_type); anything else is a monitor. */
export function KindIcon({ kind, className }: { kind?: string; className?: string }) {
  if (kind === 'mobile') return <Smartphone className={className} />;
  if (kind === 'tablet') return <Tablet className={className} />;
  return <Monitor className={className} />;
}
