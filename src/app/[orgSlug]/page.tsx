'use client';

import { Badge, Card, CardContent } from '@/components/ui/base';
import {
  ArrowUpRight,
  Banknote,
  ClipboardList,
  DollarSign,
  Grid3x3
} from 'lucide-react';

export default function DashboardPage() {
  const kpis = [
    { label: "Today's Orders", value: '84', trend: '+15.2%', up: true, icon: ClipboardList, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Revenue Today', value: 'KES 127,450', trend: '+8.3%', up: true, icon: DollarSign, color: 'text-green-500 bg-green-500/10' },
    { label: 'Avg Ticket', value: 'KES 1,517', trend: '+3.1%', up: true, icon: Banknote, color: 'text-purple-500 bg-purple-500/10' },
    { label: 'Open Tables', value: '6 / 20', trend: '14 available', up: false, icon: Grid3x3, color: 'text-rose-500 bg-rose-500/10' },
  ];

  const recentOrders = [
    { id: 'ORD-084', table: 'Table 5', items: 4, total: 'KES 2,850', status: 'preparing', time: '3 min ago' },
    { id: 'ORD-083', table: 'Table 12', items: 2, total: 'KES 1,200', status: 'served', time: '8 min ago' },
    { id: 'ORD-082', table: 'Takeaway', items: 6, total: 'KES 4,500', status: 'paid', time: '12 min ago' },
    { id: 'ORD-081', table: 'Table 3', items: 3, total: 'KES 1,950', status: 'preparing', time: '15 min ago' },
    { id: 'ORD-080', table: 'Table 8', items: 1, total: 'KES 650', status: 'paid', time: '20 min ago' },
    { id: 'ORD-079', table: 'Table 1', items: 5, total: 'KES 3,800', status: 'served', time: '25 min ago' },
  ];

  return (
    <div className="p-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">POS Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of today&apos;s operations.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="group hover:border-primary/30 transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  {kpi.up ? (
                    <div className="flex items-center gap-0.5 text-xs font-bold text-green-500">
                      <ArrowUpRight className="h-3 w-3" />
                      {kpi.trend}
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                      {kpi.trend}
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold">Recent Orders</h3>
            <Badge variant="outline">Live</Badge>
          </div>
          <div className="divide-y divide-border">
            {recentOrders.map((order) => (
              <div key={order.id} className="px-6 py-4 flex items-center justify-between hover:bg-accent/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-lg bg-accent/30 flex items-center justify-center">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{order.id}</p>
                    <p className="text-xs text-muted-foreground">{order.table} &middot; {order.items} items</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <p className="text-sm font-bold">{order.total}</p>
                  <Badge variant={order.status === 'paid' ? 'success' : order.status === 'preparing' ? 'warning' : 'default'}>
                    {order.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground w-20 text-right">{order.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
