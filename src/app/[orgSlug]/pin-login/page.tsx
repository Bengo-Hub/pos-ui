'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import { WifiOff, ChevronLeft, User } from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { PINKeypad } from '@/components/pos/pin-keypad';
import { cn } from '@/lib/utils';

interface StaffProfile {
  user_id: string;
  name: string;
  tenant_id: string;
  outlet_id: string;
  has_pin: boolean;
}

interface PINLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    user_id: string;
    name: string;
    tenant_id: string;
    outlet_id: string;
  };
}

const TERMINAL_TOKEN_KEY = 'pos_terminal_token';

export default function PINLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const isOnline = useOnline();
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');

  const [selected, setSelected] = useState<StaffProfile | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [offlineProfiles, setOfflineProfiles] = useState<CachedStaffProfile[]>([]);

  // Fetch staff profiles from server when online
  const { data: serverProfiles } = useQuery<StaffProfile[]>({
    queryKey: ['pos-staff-profiles', tenantID],
    queryFn: async () => {
      const body = await apiClient.get<{ data: StaffProfile[] }>(
        `/api/v1/${tenantID}/pos/auth/pin/profile`
      );
      const list: StaffProfile[] = body.data ?? [];
      // Cache profiles to IndexedDB for offline use
      for (const p of list) {
        await cacheStaffProfile({
          user_id: p.user_id,
          tenant_id: p.tenant_id,
          name: p.name,
          email: '',
          roles: [],
          permissions: [],
          cached_at: new Date().toISOString(),
        });
      }
      return list;
    },
    enabled: isOnline && !!tenantID,
    staleTime: 5 * 60 * 1000,
  });

  // Load offline profiles when going offline
  useEffect(() => {
    if (!isOnline && tenantID) {
      getCachedStaffProfiles(tenantID).then(setOfflineProfiles);
    }
  }, [isOnline, tenantID]);

  const profiles: StaffProfile[] = isOnline
    ? (serverProfiles ?? [])
    : offlineProfiles.map((p) => ({
        user_id: p.user_id,
        name: p.name,
        tenant_id: p.tenant_id,
        outlet_id: '',
        has_pin: !!p.pin_hash,
      }));

  // Online PIN login
  const loginMutation = useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) =>
      apiClient.post<PINLoginResponse>(`/api/v1/${tenantID}/pos/auth/pin`, { user_id: userId, pin }),
    onSuccess: (data) => {
      sessionStorage.setItem(TERMINAL_TOKEN_KEY, data.access_token);
      router.push(`/${orgSlug}/order`);
    },
    onError: () => {
      setPinError('Incorrect PIN. Please try again.');
    },
  });

  const handlePIN = async (pin: string) => {
    if (!selected) return;
    setPinError(null);

    if (isOnline) {
      loginMutation.mutate({ userId: selected.user_id, pin });
      return;
    }

    // Offline: validate against cached bcrypt hash
    const cached = offlineProfiles.find((p) => p.user_id === selected.user_id);
    if (!cached?.pin_hash) {
      setPinError('PIN not available offline. Connect to internet to log in.');
      return;
    }

    const valid = await bcryptCompare(pin, cached.pin_hash);
    if (!valid) {
      setPinError('Incorrect PIN. Please try again.');
      return;
    }

    // Store a minimal offline session marker
    sessionStorage.setItem(
      TERMINAL_TOKEN_KEY,
      JSON.stringify({
        offline: true,
        user_id: cached.user_id,
        name: cached.name,
        tenant_id: cached.tenant_id,
        expires_at: Date.now() + 4 * 60 * 60 * 1000,
      })
    );
    router.push(`/${orgSlug}/order`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-8">
      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm">
          <WifiOff className="h-4 w-4 shrink-0" />
          Offline — using cached profiles
        </div>
      )}

      {!selected ? (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Who's working?</h1>
            <p className="text-sm text-muted-foreground mt-1">Select your name to enter your PIN</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-md">
            {profiles.map((p) => (
              <button
                key={p.user_id}
                onClick={() => { if (p.has_pin) setSelected(p); }}
                disabled={!p.has_pin}
                className={cn(
                  'flex flex-col items-center gap-3 p-4 rounded-2xl border bg-card transition-all',
                  p.has_pin
                    ? 'hover:border-primary hover:bg-primary/5 active:scale-95 cursor-pointer'
                    : 'opacity-40 cursor-not-allowed'
                )}
              >
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-center leading-tight">{p.name}</span>
                {!p.has_pin && (
                  <span className="text-[10px] text-muted-foreground">No PIN set</span>
                )}
              </button>
            ))}

            {profiles.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground text-sm py-8">
                {isOnline ? 'Loading staff…' : 'No cached profiles. Connect to internet first.'}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Hello, {selected.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your PIN to continue</p>
          </div>

          <PINKeypad
            onConfirm={handlePIN}
            loading={loginMutation.isPending}
            error={pinError}
            label={undefined}
          />

          <button
            onClick={() => { setSelected(null); setPinError(null); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </>
      )}
    </div>
  );
}
