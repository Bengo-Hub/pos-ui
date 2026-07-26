'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Link2, Loader2, RadioTower, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import {
  createPrintAgentPairing, listPrintAgents, localAgentStatus, pairLocalAgent,
  type PrintAgentInfo,
} from '@/lib/pos/print-jobs';

const POS_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://posapi.codevertexafrica.com';

/**
 * Print Agent pairing + status (Settings → Receipt & Printing).
 *
 * Pairing turns the Local Print Agent from a dumb relay into an AccuPOS-style spooler: it polls
 * pos-api for queued print jobs (kitchen/bar tickets, bills, receipts, test pages) and prints them
 * to network AND locally-installed USB printers — so orders print in the background and waiters
 * can log out instantly.
 */
export function PrintAgentCard({ canEdit }: { canEdit: boolean }) {
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const authOutlet = useAuthStore((s) => s.outlet);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outletId = selectedOutlet?.id || authOutlet?.id || '';

  const [local, setLocal] = useState<{ reachable: boolean; paired?: boolean; polling?: boolean; version?: string } | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [agents, setAgents] = useState<PrintAgentInfo[]>([]);
  const [pairing, setPairing] = useState(false);
  const [manualKey, setManualKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [st, srv] = await Promise.all([
      localAgentStatus(),
      tenantId ? listPrintAgents(tenantId, outletId || undefined) : Promise.resolve({ agent_online: false, agents: [] }),
    ]);
    setLocal(st);
    setServerOnline(srv.agent_online);
    setAgents(srv.agents);
  }, [tenantId, outletId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handlePair = async () => {
    if (!tenantId || !outletId) {
      toast.info('Select an outlet first.');
      return;
    }
    setPairing(true);
    setManualKey(null);
    try {
      const name = `${selectedOutlet?.name || authOutlet?.name || 'Terminal'} agent`;
      const pairingRes = await createPrintAgentPairing(tenantId, outletId, name);
      if (!pairingRes) {
        toast.error('Could not create a pairing key.');
        return;
      }
      const handed = await pairLocalAgent(POS_API_BASE, pairingRes.key);
      if (handed) {
        toast.success('Print agent paired — background printing is active on this terminal.');
      } else {
        // The one-time key must not be lost: surface it so the operator can paste it into the
        // agent manually (or after installing/starting it).
        setManualKey(pairingRes.key);
        toast.warning('Local print agent not reachable — install/start it, then pair with the key shown below.');
      }
      setTimeout(() => void refresh(), 1500);
    } finally {
      setPairing(false);
    }
  };

  const pill = (ok: boolean, labelOk: string, labelBad: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ok ? labelOk : labelBad}
    </span>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Background Printing (Print Agent)</span>
          </div>
          <div className="flex items-center gap-2">
            {pill(!!local?.reachable, `Agent running${local?.version ? ` v${local.version}` : ''}`, 'Agent not detected')}
            {pill(serverOnline, 'Spooling jobs', 'Not spooling')}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pair the Local Print Agent on this terminal so orders, bills and receipts print in the
          background — waiters log out instantly and USB printers print silently (no browser dialog).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handlePair} disabled={!canEdit || pairing}>
            {pairing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
            Pair this terminal
          </Button>
          <a
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
            href={`${POS_API_BASE}/api/v1/pos/print-agent/download?os=windows`}
          >
            <Download className="h-3.5 w-3.5" /> Download print agent
          </a>
        </div>
        {manualKey && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            <div className="font-medium mb-1">One-time pairing key (shown once):</div>
            <code className="break-all select-all">{manualKey}</code>
            <div className="mt-1 text-muted-foreground">
              Start the agent on this terminal, then click “Pair this terminal” again — or POST{' '}
              <code>{'{"server":"'}{POS_API_BASE}{'","key":"…"}'}</code> to <code>http://127.0.0.1:9330/pair</code>.
            </div>
          </div>
        )}
        {agents.length > 0 && (
          <div className="space-y-1">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="truncate">{a.name}{a.version ? ` · v${a.version}` : ''}</span>
                {pill(a.online, 'online', a.last_seen_at ? `last seen ${new Date(a.last_seen_at).toLocaleString()}` : 'never connected')}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
