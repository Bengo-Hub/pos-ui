'use client';

import { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';

import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { usePermissions } from '@/hooks/usePermissions';
import { useStaffList, useSetStaffPIN } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { P } from '@/lib/rbac/permissions';

function useTenantId() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export default function PinManagementPage() {
  const tenantId = useTenantId();
  const { can } = usePermissions();

  if (!can(P.STAFF_MANAGE)) {
    return <ModuleUnavailablePage moduleKey="pin-management" />;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Staff PIN Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set or reset the 4-digit PIN for staff members to use at the POS terminal.
        </p>
      </div>
      <StaffPinList tenantId={tenantId} />
    </div>
  );
}

function StaffPinList({ tenantId }: { tenantId: string }) {
  const { data: staffResponse, isLoading } = useStaffList(tenantId);
  const staff = staffResponse?.data ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!staff.length) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No staff members found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {staff.map((member) => (
        <div
          key={member.user_id}
          className="border rounded-xl p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">{member.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{member.role.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {member.has_pin ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                PIN set
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No PIN</span>
            )}
            <button
              onClick={() => setSelected(selected === member.user_id ? null : member.user_id)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {member.has_pin ? 'Reset PIN' : 'Set PIN'}
            </button>
          </div>
          {selected === member.user_id && (
            <div className="w-full mt-3 col-span-full">
              <PinSetForm
                tenantId={tenantId}
                userId={member.user_id}
                onDone={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PinSetForm({
  tenantId,
  userId,
  onDone,
}: {
  tenantId: string;
  userId: string;
  onDone: () => void;
}) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const { mutate, isPending } = useSetStaffPIN(tenantId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) {
      toast.error('PIN must be at least 4 digits');
      return;
    }
    if (pin !== confirm) {
      toast.error('PINs do not match');
      return;
    }
    mutate(
      { userId, pin },
      {
        onSuccess: () => {
          toast.success('PIN updated successfully');
          onDone();
        },
        onError: () => toast.error('Failed to update PIN'),
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 pt-3 border-t mt-3">
      <div className="flex-1">
        <label className="block text-xs font-medium mb-1">New PIN (4-6 digits)</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="••••"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium mb-1">Confirm PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="••••"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
