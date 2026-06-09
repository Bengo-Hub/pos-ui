'use client';

import { useState } from 'react';
import { Wrench, Plus, Phone, Smartphone } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import {
  useRepairs,
  REPAIR_STATUSES,
  REPAIR_STATUS_LABELS,
  type RepairStatus,
} from '@/hooks/useRepairs';
import { RepairIntakeForm } from '@/components/repairs/RepairIntakeForm';
import { RepairDetailPanel } from '@/components/repairs/RepairDetailPanel';
import { RepairStatusBadge } from '@/components/repairs/RepairStatusBadge';

const MODULE_KEY = 'repairs';

export default function RepairPage() {
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'all'>('all');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [selectedID, setSelectedID] = useState<string | null>(null);

  const { data, isLoading } = useRepairs(statusFilter === 'all' ? undefined : statusFilter);
  const jobs = data?.data ?? [];

  return (
    <ModuleGate moduleKey={MODULE_KEY} fallback={<ModuleUnavailablePage moduleKey={MODULE_KEY} />}>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg leading-none">Repairs</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Job cards &amp; device repairs</p>
          </div>
          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Repair
          </button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              statusFilter === 'all'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            All
          </button>
          {REPAIR_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {REPAIR_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Two-pane: list + detail */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
          {/* List */}
          <div className="space-y-2">
            {isLoading ? (
              [...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/40 gap-3">
                <Wrench className="h-10 w-10" />
                <p className="text-sm">No repair jobs</p>
              </div>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedID(job.id)}
                  className={`w-full text-left rounded-2xl border p-3 transition-colors ${
                    selectedID === job.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate flex-1">{job.job_number}</span>
                    <RepairStatusBadge status={job.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    {job.customer_name && <span>{job.customer_name}</span>}
                    {job.customer_phone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{job.customer_phone}</span>
                    )}
                    {job.device_description && (
                      <span className="flex items-center gap-1 truncate">
                        <Smartphone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{job.device_description}</span>
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail */}
          <div className="rounded-2xl border border-border p-4 lg:sticky lg:top-4 h-fit">
            {selectedID ? (
              <RepairDetailPanel jobID={selectedID} />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/40 gap-3">
                <Wrench className="h-10 w-10" />
                <p className="text-sm">Select a job to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <RepairIntakeForm
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onCreated={(id) => {
          setIntakeOpen(false);
          setSelectedID(id);
        }}
      />
    </ModuleGate>
  );
}
