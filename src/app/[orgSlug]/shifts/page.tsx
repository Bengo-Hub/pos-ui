'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import { useParams } from 'next/navigation';
import { Clock, DollarSign, LogIn, LogOut, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';

const POS_API = process.env.NEXT_PUBLIC_POS_API_URL || 'https://posapi.codevertexitsolutions.com';

interface ShiftSession {
  id: string;
  device_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  opening_float: number;
  closing_float?: number;
  status: 'open' | 'closed';
}

export default function ShiftsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const token = useAuthStore((s) => s.session?.accessToken);
  const qc = useQueryClient();
  const [float, setFloat] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const { data: session, isLoading } = useQuery<ShiftSession | null>({
    queryKey: ['shift-session', orgSlug],
    queryFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/pos/devices/current/sessions/current`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json();
    },
    enabled: !!token && !!orgSlug,
  });

  const openShift = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/pos/devices/current/sessions/open`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ opening_float: parseFloat(float) || 0 }),
      });
      if (!res.ok) throw new Error('Failed to open shift');
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-session', orgSlug] }); setFloat(''); },
  });

  const closeShift = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${POS_API}/v1/${orgSlug}/pos/devices/current/sessions/close`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ closing_float: parseFloat(float) || 0 }),
      });
      if (!res.ok) throw new Error('Failed to close shift');
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-session', orgSlug] }); setFloat(''); },
  });

  const isOpen = session?.status === 'open';
  const busy = openShift.isPending || closeShift.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shift Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Open or close your cashier shift</p>
      </div>

      {/* Current status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`size-12 rounded-full flex items-center justify-center ${isOpen ? 'bg-green-500/10' : 'bg-muted'}`}>
              <Clock className={`h-6 w-6 ${isOpen ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold text-foreground">{isOpen ? 'Shift Open' : 'No Active Shift'}</p>
              {session?.opened_at && (
                <p className="text-sm text-muted-foreground">
                  Opened: {new Date(session.opened_at).toLocaleTimeString()}
                </p>
              )}
              {session?.opening_float !== undefined && (
                <p className="text-sm text-muted-foreground">
                  Float: KES {session.opening_float.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Float entry */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              {isOpen ? 'Closing Float (KES)' : 'Opening Float (KES)'}
            </span>
            <div className="relative mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={float}
                onChange={(e) => setFloat(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </label>

          {isOpen ? (
            <button
              onClick={() => closeShift.mutate()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Close Shift
            </button>
          ) : (
            <button
              onClick={() => openShift.mutate()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Open Shift
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
