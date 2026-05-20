'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import { BarChart3, Clock, DollarSign, LogIn, LogOut, Loader2, ShoppingCart } from 'lucide-react';
import { useCurrentShift, useOpenShift, useCloseShift, useSessionSummary } from '@/hooks/useShifts';
import { toast } from 'sonner';

export default function ShiftsPage() {
  const [float, setFloat] = useState('');

  const { data: session, isLoading } = useCurrentShift();
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const { data: summary } = useSessionSummary(session?.status === 'open');

  const isOpen = session?.status === 'open';
  const busy = openShift.isPending || closeShift.isPending;

  async function handleOpen() {
    try {
      await openShift.mutateAsync(parseFloat(float) || 0);
      toast.success('Shift opened');
      setFloat('');
    } catch {
      toast.error('Failed to open shift');
    }
  }

  async function handleClose() {
    try {
      await closeShift.mutateAsync(parseFloat(float) || 0);
      toast.success('Shift closed');
      setFloat('');
    } catch {
      toast.error('Failed to close shift');
    }
  }

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

      {/* Session summary — shown when shift is open */}
      {isOpen && summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Orders', value: summary.order_count.toString(), icon: ShoppingCart },
            { label: 'Revenue', value: `KES ${summary.total_revenue.toLocaleString()}`, icon: BarChart3 },
            { label: 'Expected Cash', value: `KES ${summary.expected_cash.toLocaleString()}`, icon: DollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs">{label}</span>
                </div>
                <p className="font-bold text-sm truncate">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Float entry + action */}
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
              onClick={handleClose}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Close Shift
            </button>
          ) : (
            <button
              onClick={handleOpen}
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
