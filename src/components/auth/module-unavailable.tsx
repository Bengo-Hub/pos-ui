'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useModuleAccess } from '@/hooks/use-module-access';
import { Lock } from 'lucide-react';

const USE_CASE_LABELS: Record<string, string> = {
  hospitality: 'Hospitality',
  retail: 'Retail',
  quick_service: 'Quick Service',
  pharmacy: 'Pharmacy',
  services: 'Services',
};

interface ModuleUnavailablePageProps {
  moduleKey?: string;
}

export function ModuleUnavailablePage({ moduleKey = 'reports' }: ModuleUnavailablePageProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { useCase } = useModuleAccess();
  const useCaseLabel = useCase ? (USE_CASE_LABELS[useCase] ?? useCase) : '';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-bold text-foreground font-display mb-1">
        Module Not Available
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        The <span className="font-semibold capitalize">{moduleKey.replace(/_/g, ' ')}</span> module
        is not enabled for <span className="font-semibold">{useCaseLabel}</span> outlets.
        Contact your administrator if you believe this is a mistake.
      </p>
      <Link
        href={`/${orgSlug}/dashboard`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
