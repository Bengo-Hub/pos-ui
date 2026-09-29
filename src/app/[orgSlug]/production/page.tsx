'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ProductionBoard } from '@/components/jobs/production-board';

/** Production board for job-workflow services outlets (printing, garage, laundry, tailoring). */
export default function ProductionPage() {
  return (
    <ModuleGate moduleKey="production" fallback={<ModuleUnavailablePage moduleKey="production" />}>
      <ProductionBoard />
    </ModuleGate>
  );
}
