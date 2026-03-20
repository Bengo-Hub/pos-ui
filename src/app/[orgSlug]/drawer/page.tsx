'use client';

import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { useCurrentDrawer, useOpenDrawer, useCloseDrawer, useDrawerHistory } from '@/hooks/usePOS';
import {
  Banknote,
  DollarSign,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function DrawerPage() {
  const [openingAmount, setOpeningAmount] = useState('5000');
  const [closingAmount, setClosingAmount] = useState('');

  const { data: currentData, isLoading } = useCurrentDrawer();
  const { data: historyData } = useDrawerHistory();
  const openDrawer = useOpenDrawer();
  const closeDrawer = useCloseDrawer();

  const isOpen = currentData?.isOpen ?? false;
  const drawer = currentData?.drawer;
  const history = historyData?.data ?? [];

  const handleOpen = () => {
    openDrawer.mutate(
      { outletId: '', startingCash: parseFloat(openingAmount) || 0 },
      {
        onSuccess: () => toast.success('Drawer opened!'),
        onError: () => toast.error('Failed to open drawer'),
      }
    );
  };

  const handleClose = () => {
    if (!drawer?.id) return;
    closeDrawer.mutate(
      { drawerId: drawer.id, endingCash: parseFloat(closingAmount) || 0 },
      {
        onSuccess: () => {
          toast.success('Drawer closed!');
          setClosingAmount('');
        },
        onError: () => toast.error('Failed to close drawer'),
      }
    );
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cash Drawer</h1>
        <p className="text-muted-foreground mt-1">Manage your cash drawer sessions.</p>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isOpen ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              {isOpen ? <Unlock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-xl font-bold">{isOpen ? 'Drawer Open' : 'Drawer Closed'}</h2>
              <p className="text-sm text-muted-foreground">
                {isOpen && drawer ? `Opened at ${formatDate(drawer.opened_at)}` : 'No active session'}
              </p>
            </div>
            <Badge variant={isOpen ? 'success' : 'error'} className="ml-auto">
              {isOpen ? 'ACTIVE' : 'CLOSED'}
            </Badge>
          </div>

          {isOpen && drawer ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-accent/30">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Opening Balance</p>
                  <p className="text-2xl font-bold mt-1">KES {(drawer.starting_cash || 0).toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl bg-accent/30">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Expected Balance</p>
                  <p className="text-2xl font-bold mt-1">KES {(drawer.starting_cash || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="border-t pt-6">
                <p className="text-sm font-bold mb-3">Close Drawer</p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="number"
                      placeholder="Counted cash amount"
                      value={closingAmount}
                      onChange={(e) => setClosingAmount(e.target.value)}
                      className="w-full bg-accent/30 border-none rounded-lg py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <Button onClick={handleClose} disabled={closeDrawer.isPending} className="min-h-[48px] px-6 gap-2" variant="destructive">
                    <Lock className="h-4 w-4" /> Close Drawer
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter your opening float to start a new session.</p>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder="Opening float (KES)"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    className="w-full bg-accent/30 border-none rounded-lg py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button onClick={handleOpen} disabled={openDrawer.isPending} className="min-h-[48px] px-6 gap-2">
                  <Unlock className="h-4 w-4" /> Open Drawer
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-bold">Session History</h3>
        </div>
        <div className="divide-y divide-border">
          {history.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No previous sessions.</div>
          ) : (
            history.map((d: any) => (
              <div key={d.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{formatDate(d.opened_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.closed_at ? `Closed ${formatDate(d.closed_at)}` : 'Still open'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">KES {(d.starting_cash || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">opening float</p>
                </div>
                <Badge variant={d.status === 'open' ? 'success' : 'default'}>{d.status}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
