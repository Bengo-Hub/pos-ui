'use client';

import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  DollarSign,
  Lock,
  Unlock,
  Wallet
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Shift {
  id: string;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  status: 'open' | 'closed';
}

const mockShifts: Shift[] = [
  { id: '1', cashier: 'Alice K.', openedAt: '2026-03-06 08:00', closedAt: null, openingBalance: 5000, closingBalance: null, cashSales: 12400, cashIn: 0, cashOut: 2000, status: 'open' },
  { id: '2', cashier: 'James M.', openedAt: '2026-03-05 08:00', closedAt: '2026-03-05 20:00', openingBalance: 5000, closingBalance: 18200, cashSales: 15200, cashIn: 0, cashOut: 2000, status: 'closed' },
  { id: '3', cashier: 'Brian O.', openedAt: '2026-03-04 08:00', closedAt: '2026-03-04 20:00', openingBalance: 5000, closingBalance: 22500, cashSales: 19500, cashIn: 0, cashOut: 2000, status: 'closed' },
];

export default function DrawerPage() {
  const currentShift = mockShifts.find((s) => s.status === 'open');
  const [countAmount, setCountAmount] = useState('');

  const expectedBalance = currentShift
    ? currentShift.openingBalance + currentShift.cashSales + currentShift.cashIn - currentShift.cashOut
    : 0;

  const handleCloseShift = () => {
    if (!countAmount) {
      toast.error('Please enter the counted cash amount');
      return;
    }
    const counted = parseInt(countAmount.replace(/,/g, ''));
    const variance = counted - expectedBalance;
    toast.success(`Shift closed. Variance: KES ${variance >= 0 ? '+' : ''}${variance.toLocaleString()}`);
    setCountAmount('');
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cash Drawer</h1>
        <p className="text-muted-foreground mt-1">Manage shift openings, closings, and cash counts.</p>
      </div>

      {currentShift ? (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-green-500/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Unlock className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h3 className="font-bold">Active Shift</h3>
                <p className="text-xs text-muted-foreground">{currentShift.cashier} &middot; Since {currentShift.openedAt}</p>
              </div>
            </div>
            <Badge variant="success">Open</Badge>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                  <Wallet className="h-3 w-3" /> Opening
                </div>
                <p className="text-xl font-bold">KES {currentShift.openingBalance.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-green-500 font-bold uppercase tracking-wider">
                  <ArrowUpRight className="h-3 w-3" /> Cash Sales
                </div>
                <p className="text-xl font-bold">KES {currentShift.cashSales.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-orange-500 font-bold uppercase tracking-wider">
                  <ArrowDownLeft className="h-3 w-3" /> Cash Out
                </div>
                <p className="text-xl font-bold">KES {currentShift.cashOut.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-primary font-bold uppercase tracking-wider">
                  <DollarSign className="h-3 w-3" /> Expected
                </div>
                <p className="text-xl font-bold">KES {expectedBalance.toLocaleString()}</p>
              </div>
            </div>

            <div className="border-t border-green-500/20 pt-6 space-y-4">
              <h4 className="text-sm font-bold">Close Shift</h4>
              <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Counted Cash Amount</label>
                  <input
                    value={countAmount}
                    onChange={(e) => setCountAmount(e.target.value)}
                    placeholder="Enter amount..."
                    className="w-full bg-card border border-border rounded-xl py-3 px-4 text-sm focus:ring-1 focus:ring-primary outline-none font-mono min-h-[44px]"
                  />
                </div>
                <Button
                  onClick={handleCloseShift}
                  variant="destructive"
                  className="gap-2 min-h-[44px] px-6"
                >
                  <Lock className="h-4 w-4" /> Close Shift
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-4">
            <Lock className="h-12 w-12 text-muted-foreground/20 mx-auto" />
            <h3 className="font-bold text-lg">No Active Shift</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">Open a new shift to start accepting cash payments and managing the drawer.</p>
            <Button className="gap-2 min-h-[44px] px-8">
              <Unlock className="h-4 w-4" /> Open Shift
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-tight">Shift History</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/5">
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Cashier</th>
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Opened</th>
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Closed</th>
                  <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Opening</th>
                  <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Closing</th>
                  <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-accent/5 transition-colors">
                    <td className="px-6 py-4 text-xs font-medium">{shift.cashier}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{shift.openedAt}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{shift.closedAt ?? '-'}</td>
                    <td className="px-6 py-4 text-right text-xs">KES {shift.openingBalance.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-xs font-bold">{shift.closingBalance ? `KES ${shift.closingBalance.toLocaleString()}` : '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={shift.status === 'open' ? 'success' : 'outline'}>
                        {shift.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
