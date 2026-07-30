'use client';

import { useRef, useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { ApprovalDialog, type ApprovalResult } from '@/components/pos/approval-dialog';
import { SearchableCombobox, type ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';
import { useControlledLogs, useCreateControlledLog } from '@/hooks/usePharmacy';
import { usePrescribers } from '@/hooks/useClinical';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ArrowLeft, Loader2, Plus, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

interface DrugCatalogItem {
  id: string;
  name: string;
  sku: string;
}

/** Same pharmaceutical-catalog search the New Prescription drug picker uses. */
async function searchDrugs(tenantID: string, query: string, cache: Map<string, DrugCatalogItem>): Promise<ComboboxOption[]> {
  if (!tenantID || query.trim().length < 1) return [];
  const res = await apiClient.get<{ data: DrugCatalogItem[] }>(`/api/v1/${tenantID}/pos/catalog/items`, {
    category: 'pharmaceutical',
    search: query,
    limit: 20,
  });
  const rows = res?.data ?? [];
  return rows.map((item) => {
    cache.set(item.id, item);
    return { value: item.id, label: item.name, description: item.sku };
  });
}

function LogDispenseModal({ onClose }: { onClose: () => void }) {
  const outlet = useAuthStore((s) => s.outlet);
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const { data: prescribers } = usePrescribers();
  const createLog = useCreateControlledLog();
  const drugCache = useRef(new Map<string, DrugCatalogItem>());

  const [drug, setDrug] = useState<DrugCatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [patientName, setPatientName] = useState('');
  const [patientIdNumber, setPatientIdNumber] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [dispensedBy, setDispensedBy] = useState(() => {
    const mine = prescribers?.find((p) => p.user_id === user?.id);
    return mine?.staff_id ?? '';
  });
  const [pendingApproval, setPendingApproval] = useState(false);

  const canSubmit = !!drug && quantity > 0 && patientName.trim().length > 0 && !!dispensedBy && !!outlet?.id;

  const finalize = async (approval: ApprovalResult) => {
    if (!drug || !outlet?.id) return;
    if (!approval.approvalToken) {
      // Controlled-substance dispensing requires a live witness (scan card or PIN) — the
      // one-time-code path mints a redeemable code, not the JWT approval_token this endpoint
      // verifies, so it isn't a valid witness here.
      toast.error('Use "Scan card" or "PIN" to witness a controlled-substance dispense — a shared code is not accepted.');
      return;
    }
    try {
      await createLog.mutateAsync({
        outlet_id: outlet.id,
        catalog_item_id: drug.id,
        item_sku: drug.sku,
        item_name: drug.name,
        quantity_dispensed: quantity,
        dispensed_by: dispensedBy,
        patient_name: patientName.trim(),
        patient_id_number: patientIdNumber.trim() || undefined,
        lot_number: lotNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        approval_token: approval.approvalToken,
      });
      toast.success('Controlled substance dispense logged');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to log dispense'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldAlert className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base">Log Controlled Substance Dispense</h3>
              <p className="text-xs text-muted-foreground">Requires a witnessed step-up approval to submit</p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {!outlet && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm text-destructive">
              No outlet selected — please select an outlet first
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">
              Drug <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={[]}
              value={drug?.id}
              onChange={(value) => setDrug(drugCache.current.get(value) ?? null)}
              onRemoteSearch={(q) => searchDrugs(tenantID, q, drugCache.current)}
              placeholder="Search drugs…"
              searchPlaceholder="Type drug name or SKU…"
              emptyText="No drugs found"
              clearable
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Quantity <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Lot Number</label>
              <input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="e.g. LOT-2026-04"
                className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Patient Name <span className="text-destructive">*</span>
              </label>
              <input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Patient ID Number</label>
              <input
                value={patientIdNumber}
                onChange={(e) => setPatientIdNumber(e.target.value)}
                placeholder="National ID / Passport"
                className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">
              Dispensed By <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={(prescribers ?? []).map((p) => ({ value: p.staff_id, label: p.name, hint: p.role }))}
              value={dispensedBy}
              onChange={(value) => setDispensedBy(value)}
              placeholder="Select dispensing pharmacist…"
              emptyText="No pharmacists/doctors found"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes…"
              className="w-full bg-background border border-border rounded-xl py-2 px-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || createLog.isPending}
            onClick={() => setPendingApproval(true)}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {createLog.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Get Witness Approval…
          </button>
        </div>
      </div>

      {/* Dual-person dispensing requirement — a witness (manager or pharmacist) must approve via
          PIN/card/one-time code before the log entry can be created. */}
      <ApprovalDialog
        open={pendingApproval}
        action="controlled_substance_dispense"
        description={`A witness must approve dispensing ${drug?.name ?? 'this controlled substance'} to ${patientName || 'the patient'}.`}
        confirmLabel="Authorize dispense"
        onApproved={async (approval) => {
          setPendingApproval(false);
          await finalize(approval);
        }}
        onClose={() => setPendingApproval(false)}
      />
    </div>
  );
}

function ControlledSubstancesPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { data: logs, isLoading } = useControlledLogs();
  const [createOpen, setCreateOpen] = useState(false);

  const rows = logs ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${orgSlug}/pharmacy`}
            className="h-9 w-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Controlled Substances Register</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Dual-witness dispensing log for scheduled/controlled drugs
            </p>
          </div>
        </div>
        <Can permission={P.PHARMACY_CHANGE}>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Log Dispense
          </button>
        </Can>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading register…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <ShieldAlert className="h-10 w-10 opacity-30" />
          <p className="font-medium">No controlled-substance dispenses logged yet</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Drug</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Qty</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Lot #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((log) => (
                <tr key={log.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {new Date(log.dispensed_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 font-medium">
                    {log.item_name}
                    <span className="text-xs text-muted-foreground ml-1.5">{log.item_sku}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono">{log.quantity_dispensed}</td>
                  <td className="px-4 py-3.5">{log.patient_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">{log.lot_number || '—'}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs hidden sm:table-cell max-w-[240px] truncate">
                    {log.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <LogDispenseModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

export default function ControlledSubstancesPageGated() {
  return (
    <ModuleGate moduleKey="pharmacy" fallback={<ModuleUnavailablePage moduleKey="pharmacy" />}>
      <ControlledSubstancesPage />
    </ModuleGate>
  );
}
