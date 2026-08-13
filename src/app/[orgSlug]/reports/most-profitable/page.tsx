'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Renamed to /reports/profitability (client request, 2026-08-13) — a full revamp with tabs for
// every profitability dimension (Products/Categories/Brands/Locations/Date/Customer/Service
// Staff/Invoice), not just the item ranking this page used to show alone. Redirect kept so any
// existing bookmarks/links to the old URL still land somewhere useful.
export default function MostProfitableRedirect() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${orgSlug}/reports/profitability`);
  }, [orgSlug, router]);

  return null;
}
