'use client';

import { useParams } from 'next/navigation';
import { SalesListView } from '@/components/pos/sales/sales-list-view';

/**
 * All Sales — the combined GoDigital-style sales list (POS terminal sales + back-office
 * "Add Sale" records). Advanced filters, row-click Sell Details, and a per-row Actions dropdown.
 */
export default function AllSalesPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <SalesListView
      orgSlug={orgSlug}
      title="All Sales"
      subtitle="Every sale — POS terminal and back-office Add Sale."
    />
  );
}
