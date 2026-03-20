'use client';

import { Badge, Card, CardContent } from '@/components/ui/base';
import { useOrders, useTables } from '@/hooks/usePOS';
import {
  ArrowUpRight,
  Banknote,
  ClipboardList,
  DollarSign,
  Grid3x3,
  Loader2,
} from 'lucide-react';
import { useMemo } from 'react';

export default function DashboardPage() {
  const { data: ordersData, isLoading: ordersLoading } = useOrders();
  const { data: tablesData, isLoading: tablesLoading } = useTables();

  const orders = ordersData?.orders ?? [];
  const tables = tablesData?.data ?? [];

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
    const avgTicket = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;
    const occupiedTables = tables.filter((t: any) => t.status === 'occupied').length;
    return {
      orderCount: orders.length,
      revenue: totalRevenue,
      avgTicket,
      occupiedTables,
      totalTables: tables.length,
      availableTables: tables.length - occupiedTables,
    };
  }, [orders, tables]);

  const kpis = [
    { label: "Today's Orders", value: String(stats.orderCount), trend: '', up: false, icon: ClipboardList, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Revenue Today', value: `KES ${stats.revenue.toLocaleString()}`, trend: '', up: false, icon: DollarSign, color: 'text-green-500 bg-green-500/10' },
    { label: 'Avg Ticket', value: `KES ${stats.avgTicket.toLocaleString()}`, trend: '', up: false, icon: Banknote, color: 'text-purple-500 bg-purple-500/10' },
    { label: 'Open Tables', value: `${stats.occupiedTables} / ${stats.totalTables}`, trend: `${stats.availableTables} available`, up: false, icon: Grid3x3, color: 'text-rose-500 bg-rose-500/10' },
  ];

  const recentOrders = orders.slice(0, 6);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)}h ago`;
  };

  const isLoading = ordersLoading || tablesLoading;

  return (
    <div className="p-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">POS Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of today&apos;s operations.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="group hover:border-primary/30 transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                        <kpi.icon className="h-5 w-5" />
                      </div>
                      {kpi.trend && (
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
                {recentOrders.length === 0 ? (
                  <div className="px-6 py-12 text-center text-muted-foreground">
                    No orders yet today. Start taking orders!
                  </div>
                ) : (
                  recentOrders.map((order: any) => (
                    <div key={order.id} className="px-6 py-4 flex items-center justify-between hover:bg-accent/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-9 w-9 rounded-lg bg-accent/30 flex items-center justify-center">
                          <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{order.order_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.edges?.lines?.length ?? 0} items
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <p className="text-sm font-bold">KES {(order.total_amount || 0).toLocaleString()}</p>
                        <Badge variant={order.status === 'completed' ? 'success' : order.status === 'draft' ? 'warning' : 'default'}>
                          {order.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground w-20 text-right">
                          {formatTime(order.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
