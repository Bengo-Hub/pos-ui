'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The standalone Retail POS has been absorbed into the use-case-adaptive /order terminal.
 * Retail-specific features (StockBadge, ScaleDisplay, manager PIN override, loyalty, pricing
 * profile, barcode-first, keyboard checkout) now render in /order gated by the outlet use_case.
 * This stub keeps existing links/bookmarks to /retail working.
 */
export default function RetailRedirectPage() {
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params?.orgSlug ?? '';

  useEffect(() => {
    router.replace(`/${orgSlug}/order`);
  }, [orgSlug, router]);

  return null;
}
