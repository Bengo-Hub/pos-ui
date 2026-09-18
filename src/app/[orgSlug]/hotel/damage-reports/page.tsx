'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import {
  useDamageReports,
  useApproveDamageReport,
  useRejectDamageReport,
  useHotelRooms,
} from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { DamageReport } from '@/lib/api/hotel';
import { cn, formatCurrency } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/screensaver';
import { CheckCircle2, Loader2, ShieldAlert, X, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

const STATUS_OPTIONS = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-muted text-muted-foreground',
};

function RejectModal({ report, onClose }: { report: DamageReport; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const reject = useRejectDamageReport();

  async function handleReject() {
    if (!notes.trim()) { toast.error('A reason is required to reject a damage report'); return; }
    try {
      await reject.mutateAsync({ id: report.id, reviewNotes: notes.trim() });
      toast.success('Damage report rejected');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to reject damage report'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Reject Damage Report</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason *</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Why this report is being rejected"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button
              onClick={handleReject}
              disabled={reject.isPending}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Reject'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DamageReportsPage() {
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);
  const [filter, setFilter] = useState<string | undefined>('pending');
  const [rejectTarget, setRejectTarget] = useState<DamageReport | null>(null);

  const { data: reports = [], isLoading } = useDamageReports(filter ? { status: filter } : undefined);
  const { data: rooms = [] } = useHotelRooms();
  const approve = useApproveDamageReport();

  const roomLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, `Room ${r.room_number}`);
    return m;
  }, [rooms]);

  async function handleApprove(report: DamageReport) {
    try {
      const res = await approve.mutateAsync({ id: report.id });
      toast.success(res.folio_posted ? 'Approved — charge posted to the guest\'s folio' : 'Approved — guest already checked out, charge could not be auto-posted');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to approve damage report'));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Damage Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">{reports.length} report{reports.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s === 'all' ? undefined : s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              (s === 'all' ? !filter : filter === s) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <ShieldAlert className="h-12 w-12 opacity-30" />
          <p>No damage reports{filter ? ` (${filter})` : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {reports.map((report) => (
            <div key={report.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-foreground">{roomLabel.get(report.room_id) ?? 'Room'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[report.status])}>{report.status}</span>
              </div>

              <p className="mt-3 text-sm text-foreground">{report.description}</p>
              <p className="mt-2 text-lg font-bold text-primary">{formatCurrency(report.amount, report.currency)}</p>

              {report.evidence_urls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.evidence_urls.map((url) => (
                    <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer">
                      <img src={resolveMediaUrl(url)} alt="Damage evidence" className="h-16 w-16 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}

              {report.status !== 'pending' && report.review_notes && (
                <p className="mt-3 text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">{report.review_notes}</p>
              )}
              {report.status === 'approved' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.folio_item_id ? 'Posted to guest folio.' : 'Guest already checked out — not posted to a folio.'}
                </p>
              )}

              {canManage && report.status === 'pending' && (
                <div className="mt-4 flex gap-2 pt-3 border-t border-border">
                  <button
                    onClick={() => handleApprove(report)}
                    disabled={approve.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => setRejectTarget(report)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectTarget && <RejectModal report={rejectTarget} onClose={() => setRejectTarget(null)} />}
    </div>
  );
}

export default function DamageReportsPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <DamageReportsPage />
    </ModuleGate>
  );
}
