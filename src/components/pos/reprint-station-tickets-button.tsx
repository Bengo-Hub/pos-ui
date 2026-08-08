'use client';

import { useState } from 'react';
import { ChefHat, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useKDSStations } from '@/hooks/useKDS';
import { printKitchenBarTickets, type TicketLine } from '@/lib/pos/kitchen-bar-print';

interface OrderLineLike {
  name?: string;
  item_name?: string;
  quantity?: number;
  voided_qty?: number;
  category?: string;
  notes?: string;
  unit_price?: number;
  total_price?: number;
  /** Station this line was actually resolved to at order-creation time (pos-api
   *  resolveStationForLine) — authoritative, so a reprint lands on the SAME station the KDS
   *  screen ticket used, regardless of any later category/override changes. */
  kds_station_id?: string;
}

interface ReprintStationTicketsButtonProps {
  orderNumber: string;
  tableRef?: string;
  lines: OrderLineLike[];
  className?: string;
}

/**
 * Manual, on-demand reprint of an order's kitchen/bar station tickets — the crisis-recovery lever
 * for dockets: unlike the automatic send-to-kitchen path (which stays silent whenever the server
 * print-agent queue is assumed to own the job, to avoid double-printing), this is an EXPLICIT
 * click, so it always runs `silent: false` — any station whose configured printer can't be reached
 * falls back to the browser print dialog instead of the ticket just never coming out. See
 * [[pos-print-crisis-browser-fallback]].
 *
 * Self-hides when the outlet has no live KDS stations (retail/non-hospitality use cases never had
 * kitchen tickets to begin with).
 */
export function ReprintStationTicketsButton({ orderNumber, tableRef, lines, className }: ReprintStationTicketsButtonProps) {
  const { data: posSettings } = usePOSSettings();
  const { data: stationsData } = useKDSStations();
  const [printing, setPrinting] = useState(false);

  const stations = stationsData?.data ?? [];
  if (stations.length === 0) return null;

  const activeLines = lines.filter((l) => !(l.voided_qty != null && l.voided_qty >= (l.quantity ?? 0)));

  const handleClick = async () => {
    if (activeLines.length === 0) {
      toast.info('No active line items to reprint.');
      return;
    }
    setPrinting(true);
    try {
      const ticketLines: TicketLine[] = activeLines.map((l) => ({
        name: l.name ?? l.item_name ?? 'Item',
        quantity: l.quantity ?? 1,
        category: l.category,
        notes: l.notes,
        unitPrice: l.unit_price,
        totalPrice: l.total_price,
        kdsStationId: l.kds_station_id,
      }));
      const res = await printKitchenBarTickets({
        orderNumber,
        tableRef,
        lines: ticketLines,
        kdsStations: stations,
        stations: (posSettings as { printer_profiles?: unknown[] } | undefined)?.printer_profiles as never[] ?? [],
        includeCustomerBill: false,
        currency: (posSettings as any)?.currency ?? 'KES',
        autoPrintKitchen: true,
        autoPrintBill: false,
        // Explicit manual action → never silently swallow a failure; fall back to the browser
        // print dialog per-station instead (the fix for "dockets can not be printed").
        silent: false,
      });
      if (res.printed > 0) toast.success(`Reprinted ${res.printed} kitchen/bar ticket${res.printed === 1 ? '' : 's'}.`);
      else toast.error('Nothing to reprint — check the outlet has active KDS stations configured.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className={className} onClick={handleClick} disabled={printing}>
      {printing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ChefHat className="h-4 w-4 mr-2" />}
      Reprint Kitchen/Bar
    </Button>
  );
}
