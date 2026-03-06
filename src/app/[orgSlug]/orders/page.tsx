'use client';

import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Download,
  Eye,
  Filter,
  Search
} from 'lucide-react';
import { useState } from 'react';

interface Order {
  id: string;
  orderNumber: string;
  table: string;
  items: number;
  total: string;
  paymentMethod: string;
  status: 'completed' | 'preparing' | 'served' | 'cancelled' | 'void';
  server: string;
  time: string;
}

const mockOrders: Order[] = [
  { id: '1', orderNumber: 'ORD-084', table: 'Table 5', items: 4, total: '2,850', paymentMethod: 'M-Pesa', status: 'preparing', server: 'Alice K.', time: '14:32' },
  { id: '2', orderNumber: 'ORD-083', table: 'Table 12', items: 2, total: '1,200', paymentMethod: 'Cash', status: 'served', server: 'James M.', time: '14:28' },
  { id: '3', orderNumber: 'ORD-082', table: 'Takeaway', items: 6, total: '4,500', paymentMethod: 'Card', status: 'completed', server: 'Alice K.', time: '14:15' },
  { id: '4', orderNumber: 'ORD-081', table: 'Table 3', items: 3, total: '1,950', paymentMethod: 'M-Pesa', status: 'preparing', server: 'Brian O.', time: '13:58' },
  { id: '5', orderNumber: 'ORD-080', table: 'Table 8', items: 1, total: '650', paymentMethod: 'Cash', status: 'completed', server: 'James M.', time: '13:30' },
  { id: '6', orderNumber: 'ORD-079', table: 'Table 1', items: 5, total: '3,800', paymentMethod: 'Card', status: 'completed', server: 'Alice K.', time: '13:15' },
  { id: '7', orderNumber: 'ORD-078', table: 'Table 7', items: 2, total: '980', paymentMethod: 'Cash', status: 'cancelled', server: 'Brian O.', time: '12:45' },
];

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = mockOrders.filter((order) => {
    const matchesSearch = order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.table.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order History</h1>
          <p className="text-muted-foreground mt-1">View and manage all orders for today.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-4">
          <div className="relative w-full max-w-sm group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              placeholder="Search by order # or table..."
              className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {['all', 'completed', 'preparing', 'served', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn("px-3 py-1 rounded-full text-xs font-bold capitalize transition-all",
                  statusFilter === s ? "bg-primary text-primary-foreground" : "bg-accent/30 text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/5">
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Order #</th>
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Table</th>
                  <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Items</th>
                  <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Payment</th>
                  <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Server</th>
                  <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-accent/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs font-bold">{order.orderNumber}</td>
                    <td className="px-6 py-4 text-xs font-medium">{order.table}</td>
                    <td className="px-6 py-4 text-center text-xs">{order.items}</td>
                    <td className="px-6 py-4 text-right font-bold text-xs">KES {order.total}</td>
                    <td className="px-6 py-4 text-xs">{order.paymentMethod}</td>
                    <td className="px-6 py-4 text-xs">{order.server}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={
                        order.status === 'completed' ? 'success' :
                          order.status === 'preparing' ? 'warning' :
                            order.status === 'served' ? 'default' : 'error'
                      }>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-muted-foreground">{order.time}</td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">No orders match your filters.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
