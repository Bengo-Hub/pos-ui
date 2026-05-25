'use client';

import { useParams, redirect } from 'next/navigation';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Bar Display has been unified into the KDS page.
 * KDS supports all station types (kitchen, bar, coffee, etc.) via station tabs.
 */
export default function BarRedirectPage() {
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params?.orgSlug ?? '';

  useEffect(() => {
    router.replace(`/${orgSlug}/kds`);
  }, [orgSlug, router]);

  return null;
}
