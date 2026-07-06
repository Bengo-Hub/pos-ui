/**
 * Background print jobs (AccuPOS model) + Local Print Agent pairing.
 *
 * The server renders ESC/POS and queues jobs; the on-site Local Print Agent polls, claims and
 * prints them (network 9100 or a locally-installed USB printer via the OS spooler). The till just
 * enqueues and moves on — printing never blocks the UI and never opens a browser dialog.
 */

import { apiClient } from '@/lib/api/client';
import { AGENT_BASE } from '@/lib/pos/printer-discovery';

export type PrintJobType = 'bill' | 'receipt' | 'test' | 'drawer';

export interface EnqueueJobInput {
  job_type: PrintJobType;
  order_id?: string;
  outlet_id?: string;
  profile_id?: string;
  payment_method?: string;
  station?: string;
}

export interface EnqueueJobResult {
  agent_online: boolean;
  jobs: Array<{ id: string; job_type: string; status: string }>;
}

/**
 * Enqueue a background print job on the server queue. Returns `agent_online:false` (and enqueues
 * nothing) when no Local Print Agent is polling — the caller then falls back to the client-side
 * silent transports (loopback agent relay / QZ). Never throws.
 */
export async function enqueuePrintJob(tenantId: string, input: EnqueueJobInput): Promise<EnqueueJobResult> {
  try {
    const res = await apiClient.post<EnqueueJobResult>(`/api/v1/${tenantId}/pos/printing/jobs`, input);
    return { agent_online: !!res?.agent_online, jobs: res?.jobs ?? [] };
  } catch {
    return { agent_online: false, jobs: [] };
  }
}

export interface PrintAgentInfo {
  id: string;
  name: string;
  outlet_id: string;
  online: boolean;
  last_seen_at?: string | null;
  version?: string;
}

/** List paired agents (+ aggregate liveness) for the settings card / terminal status. */
export async function listPrintAgents(
  tenantId: string,
  outletId?: string,
): Promise<{ agent_online: boolean; agents: PrintAgentInfo[] }> {
  try {
    const qs = outletId ? `?outlet_id=${encodeURIComponent(outletId)}` : '';
    const res = await apiClient.get<{ agent_online: boolean; agents: PrintAgentInfo[] }>(
      `/api/v1/${tenantId}/pos/printing/agents${qs}`,
    );
    return { agent_online: !!res?.agent_online, agents: res?.agents ?? [] };
  } catch {
    return { agent_online: false, agents: [] };
  }
}

/** Create a pairing on the server; the plaintext key is returned ONCE. */
export async function createPrintAgentPairing(
  tenantId: string,
  outletId: string,
  name: string,
): Promise<{ id: string; key: string } | null> {
  try {
    const res = await apiClient.post<{ id: string; key: string }>(
      `/api/v1/${tenantId}/pos/printing/agents`,
      { outlet_id: outletId, name },
    );
    return res?.key ? res : null;
  } catch {
    return null;
  }
}

/** Revoke a paired agent. */
export async function revokePrintAgent(tenantId: string, agentId: string): Promise<boolean> {
  try {
    await apiClient.delete(`/api/v1/${tenantId}/pos/printing/agents/${agentId}`);
    return true;
  } catch {
    return false;
  }
}

// ── Loopback agent (127.0.0.1:9330) helpers ────────────────────────────────

/** Hand a server-issued pairing key to the LOCAL agent so it starts polling (agent >= 1.2.0). */
export async function pairLocalAgent(serverBaseUrl: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_BASE}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server: serverBaseUrl, key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pairing/polling state of the LOCAL agent (settings badge). */
export async function localAgentStatus(): Promise<{ reachable: boolean; paired?: boolean; polling?: boolean; version?: string }> {
  try {
    const res = await fetch(`${AGENT_BASE}/status`);
    if (!res.ok) return { reachable: false };
    const body = (await res.json()) as { paired?: boolean; polling?: boolean; version?: string };
    return { reachable: true, paired: body.paired, polling: body.polling, version: body.version };
  } catch {
    return { reachable: false };
  }
}

/** Printers installed on THIS machine (Windows spooler / CUPS) via the local agent — lets the
 *  operator bind a USB profile to the exact OS printer name. */
export async function localAgentPrinters(): Promise<string[]> {
  try {
    const res = await fetch(`${AGENT_BASE}/printers`);
    if (!res.ok) return [];
    const body = (await res.json()) as { printers?: string[] };
    return body.printers ?? [];
  } catch {
    return [];
  }
}
