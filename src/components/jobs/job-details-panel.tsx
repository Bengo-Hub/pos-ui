'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Palette } from 'lucide-react';

import { JobAttachmentsEditor } from '@/components/jobs/job-attachments-editor';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import type { ServiceSpecField } from '@/lib/api/service-jobs';
import { cn } from '@/lib/utils';

const fieldCls =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring';

function SpecInput({ field, value, onChange }: { field: ServiceSpecField; value: string; onChange: (v: string) => void }) {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'select' && field.options?.length) {
    return (
      <label className="space-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <label className="col-span-full space-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <textarea
          className={cn(fieldCls, 'h-14 py-1')}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  return (
    <label className="space-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        className={fieldCls}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * Reception's job sheet for a job-workflow services outlet (printing, garage, laundry, tailoring).
 * The customer picks services from the tenant's catalog on the right; this panel captures what
 * the production team needs on top: the due date, a brief, reference media (links and small
 * uploads) or a "design it for us" request, and a spec sheet per catalog line.
 */
export function JobDetailsPanel() {
  const t = useTerminal();
  const profile = t.jobProfile;
  const [open, setOpen] = useState(true);
  if (!profile) return null;

  const draft = t.jobDraft;
  const specFields = profile.spec_fields ?? [];
  const specCount = t.cart.filter((c) => c.jobSpecs && Object.keys(c.jobSpecs).length > 0).length;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <ClipboardList className="h-4 w-4" /> {profile.job_label} details
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {draft.dueAt && <span>Due {new Date(draft.dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          {draft.attachments.length > 0 && <span>{draft.attachments.length} attachment(s)</span>}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-primary/20 px-3 pb-3 pt-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ready by</span>
              <input
                type="datetime-local"
                className={fieldCls}
                value={draft.dueAt}
                onChange={(e) => t.setJobDraft({ ...draft, dueAt: e.target.value })}
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Instructions</span>
              <textarea
                className={cn(fieldCls, 'h-16 py-1')}
                placeholder="What the customer wants: wording, colours, placement, quantities, anything the team must know"
                value={draft.brief}
                onChange={(e) => t.setJobDraft({ ...draft, brief: e.target.value })}
              />
            </label>
          </div>

          {profile.design_from_scratch && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={draft.designFromScratch}
                onChange={(e) => t.setJobDraft({ ...draft, designFromScratch: e.target.checked })}
              />
              <Palette className="h-4 w-4 text-primary" />
              Customer has no artwork, design it for them from the instructions
            </label>
          )}

          {profile.accepts_attachments && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Artwork and reference media
              </span>
              <JobAttachmentsEditor
                value={draft.attachments}
                onChange={(attachments) => t.setJobDraft({ ...draft, attachments })}
              />
            </div>
          )}

          {specFields.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Spec sheet per item {t.cart.length > 0 && `(${specCount}/${t.cart.length} filled)`}
              </span>
              {t.cart.length === 0 && (
                <p className="text-xs text-muted-foreground">Pick services from the catalog, then fill in each item&apos;s specs here.</p>
              )}
              {t.cart.map((line, idx) => (
                <div key={`${line.id}-${idx}`} className="rounded-lg border border-border bg-card p-2">
                  <p className="mb-1 text-xs font-bold">{line.quantity} × {line.name}</p>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {specFields.map((f) => (
                      <SpecInput
                        key={f.key}
                        field={f}
                        value={line.jobSpecs?.[f.key] ?? ''}
                        onChange={(v) => t.setLineJobSpecs(idx, { ...(line.jobSpecs ?? {}), [f.key]: v })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
