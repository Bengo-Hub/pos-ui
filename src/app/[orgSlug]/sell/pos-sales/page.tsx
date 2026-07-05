'use client';

import { useParams } from 'next/navigation';
import { SalesListView } from '@/components/pos/sales/sales-list-view';

/**
 * POS Sales — the same advanced sales list as All Sales, but pinned to sales rung up on the POS
 * terminal (source=pos_terminal), excluding back-office "Add Sale" records.
 */
export default function PosSalesPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <SalesListView
      orgSlug={orgSlug}
      fixedSource="pos_terminal"
      title="POS Sales"
      subtitle="Sales rung up on the POS terminal only."
    />
  );
}
