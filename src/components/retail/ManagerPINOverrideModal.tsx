'use client';

import { useState, useEffect } from 'react';
import { Loader2, ShieldAlert, User } from 'lucide-react';
import { toast } from 'sonner';
import { staffApi, StaffProfile } from '@/lib/api/staff';

const MANAGER_ROLES = ['manager', 'admin', 'owner', 'supervisor'];

interface ManagerPINOverrideModalProps {
  tenantId: string;
  itemName: string;
  onApprove: () => void;
  onCancel: () => void;
}

export function ManagerPINOverrideModal({
  tenantId,
  itemName,
  onApprove,
  onCancel,
}: ManagerPINOverrideModalProps) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    staffApi.profiles(tenantId).then((res) => {
      const managers = res.data.filter(
        (p) => MANAGER_ROLES.includes(p.role) && p.has_pin,
      );
      setProfiles(managers);
      if (managers.length === 1) setSelectedUserId(managers[0].user_id);
    }).catch(() => {
      toast.error('Failed to load staff profiles');
    }).finally(() => setLoading(false));
  }, [tenantId]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId || pin.length < 4) return;

    setVerifying(true);
    try {
      await staffApi.verifyPin(tenantId, selectedUserId, pin);
      onApprove();
    } catch {
      toast.error('Invalid PIN or insufficient permissions');
      setPin('');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="font-bold text-base">Manager Override Required</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{itemName}</span> is out of stock.
              A manager must approve this override.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-destructive text-center py-4">
            No managers with a PIN configured. Ask an admin to set a PIN first.
          </p>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            {profiles.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Select manager</label>
                <div className="grid gap-2">
                  {profiles.map((p) => (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(p.user_id)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selectedUserId === p.user_id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {p.role.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Manager PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••"
                autoFocus
                disabled={!selectedUserId}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={verifying || !selectedUserId || pin.length < 4}
                className="flex-1 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Approve Override'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
