'use client';

/**
 * Drafts — saved-but-unpaid sales (a POSOrder with status="draft", saved from the terminal "Park"
 * or Add Sale "Save as Draft"). Rendered as a filterable data table (DraftsListView) that reuses
 * the All-Sales table pattern: expandable rows for line items + per-row Resume / Print / Delete
 * actions, RBAC-gated. Resuming a draft opens Add Sale where payment is taken (no duplicate order).
 */

import { useParams } from 'next/navigation';
import { DraftsListView } from '@/components/pos/drafts/drafts-list-view';

export default function DraftsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return <DraftsListView orgSlug={orgSlug} />;
}
