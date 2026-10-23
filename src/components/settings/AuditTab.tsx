'use client';

import { usePosAuditLogs, usePosExceptions } from '@/hooks/useAudit';
import { useAuthStore } from '@/store/auth';
import { Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACTION_FILTERS, actorLabel } from './audit/actions';
import { AuditTrailCard } from './audit/AuditTrailCard';
import { ExceptionsCard } from './audit/ExceptionsCard';

const PAGE = 50;

const inputClass = 'bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none';

const IP_RE = /^[0-9a-f:.]+$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loss Prevention: the per-staff exception report (with the devices and IPs each person signed in
 * from) and the full audit trail, filterable by date, action, staff member, device or IP, and
 * order number. Clicking a person, device or IP in either card narrows the trail to it.
 */
export function AuditTab() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [device, setDevice] = useState(''); // a client id or an IP
  const [orderNo, setOrderNo] = useState('');
  const [page, setPage] = useState(0);

  const range = {
    from: from ? new Date(from).toISOString() : undefined,
    // The "to" date is inclusive of the whole day.
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
  };
  const deviceTerm = device.trim();
  const deviceFilter = UUID_RE.test(deviceTerm)
    ? { client: deviceTerm }
    : deviceTerm && IP_RE.test(deviceTerm) ? { ip: deviceTerm } : {};

  const { data: exData, isLoading: exLoading } = usePosExceptions(tenantId, range);
  const { data: logData, isLoading: logLoading, isFetching } = usePosAuditLogs(tenantId, {
    ...range, ...deviceFilter,
    action: action || undefined,
    actor: actor || undefined,
    order: orderNo.trim() || undefined,
    limit: PAGE, offset: page * PAGE,
  });

  const exceptions = useMemo(() => exData?.data ?? [], [exData]);
  const rows = useMemo(() => logData?.data ?? [], [logData]);
  const total = logData?.total ?? 0;

  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of exceptions) seen.set(e.actor_user_id, actorLabel(e.actor_user_id, e.actor_name));
    for (const r of rows) if (!seen.has(r.actor_user_id)) seen.set(r.actor_user_id, actorLabel(r.actor_user_id, r.actor_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [exceptions, rows]);

  const reset = (fn: () => void) => { fn(); setPage(0); };
  const pickClient = (clientId?: string, ip?: string) => reset(() => setDevice(clientId || ip || ''));
  const hasFilters = !!(action || actor || deviceTerm || orderNo.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">From</label>
        <input type="date" className={inputClass} value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
        <label className="text-xs text-muted-foreground">To</label>
        <input type="date" className={inputClass} value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <ExceptionsCard
        rows={exceptions}
        loading={exLoading}
        from={from ? range.from : exData?.from}
        onPickActor={(id) => reset(() => setActor(id))}
        onPickClient={pickClient}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select className={inputClass} value={action} onChange={(e) => reset(() => setAction(e.target.value))} aria-label="Action">
          {ACTION_FILTERS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
        <select className={inputClass} value={actor} onChange={(e) => reset(() => setActor(e.target.value))} aria-label="Staff member">
          <option value="">All staff</option>
          {staffOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input className={`${inputClass} w-56`} placeholder="Device ID or IP address" value={device}
          onChange={(e) => reset(() => setDevice(e.target.value))} />
        <input className={`${inputClass} w-36`} placeholder="Order no." value={orderNo}
          onChange={(e) => reset(() => setOrderNo(e.target.value))} />
        {hasFilters && (
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => reset(() => { setAction(''); setActor(''); setDevice(''); setOrderNo(''); })}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
        {deviceTerm && !deviceFilter.client && !deviceFilter.ip && (
          <span className="text-xs text-amber-600">Enter a full device ID (from the device details) or an IP address.</span>
        )}
      </div>

      <AuditTrailCard rows={rows} total={total} loading={logLoading} onPickClient={pickClient} />

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-accent/10">Prev</button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-accent/10">Next</button>
        </div>
      )}
    </div>
  );
}
