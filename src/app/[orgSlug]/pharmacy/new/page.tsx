'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Redirect to list page with ?new=1 which opens the create modal inline.
export default function NewPrescriptionRedirect() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${orgSlug}/pharmacy?new=1`);
  }, [orgSlug, router]);

  return null;
}
