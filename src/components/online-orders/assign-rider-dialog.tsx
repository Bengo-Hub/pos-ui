'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAvailableRiders, useAssignRider } from '@/hooks/useOnlineOrders';
import type { DeliveryOrder, Rider } from '@/lib/api/online-orders';
import { cn } from '@/lib/utils';
import { Bike, Check, Loader2, Phone, Search, Star } from 'lucide-react';
import { toast } from 'sonner';

function riderName(r: Rider): string {
  const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
  return name || r.driver_code || 'Rider';
}

interface AssignRiderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: DeliveryOrder | null;
}

/**
 * Rider-select dialog for online DELIVERY orders. Lists active fleet riders
 * (fetched only while open) and assigns the chosen one. Surfaces sonner toasts on
 * success/error. Gating of the trigger is the caller's responsibility (ORDERS_MANAGE).
 */
export function AssignRiderDialog({ open, onOpenChange, order }: AssignRiderDialogProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');

  const { data: riders = [], isLoading, isError } = useAvailableRiders(open);
  const assign = useAssignRider();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter((r) => {
      const hay = `${riderName(r)} ${r.phone ?? ''} ${r.driver_code ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [riders, query]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('');
      setSelected('');
    }
    onOpenChange(next);
  }

  function handleAssign() {
    if (!order || !selected) return;
    const rider = riders.find((r) => r.id === selected);
    assign.mutate(
      { orderID: order.id, riderId: selected },
      {
        onSuccess: () => {
          toast.success(
            `Rider ${rider ? riderName(rider) : ''} assigned to ${order.order_number}`.trim(),
          );
          handleOpenChange(false);
        },
        onError: () => toast.error('Failed to assign rider'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Rider</DialogTitle>
          <DialogDescription>
            {order
              ? `Choose a rider for delivery order ${order.order_number}.`
              : 'Choose a rider for this delivery order.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search riders…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading riders…
            </div>
          ) : isError ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Could not load riders. Try again.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {riders.length === 0 ? 'No active riders available.' : 'No riders match your search.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const isSelected = r.id === selected;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Bike className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {riderName(r)}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {r.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {r.phone}
                              </span>
                            )}
                            {typeof r.average_rating === 'number' && r.average_rating > 0 && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-current text-amber-500" />
                                {r.average_rating.toFixed(1)}
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleAssign} disabled={!selected || assign.isPending}>
            {assign.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning…
              </>
            ) : (
              'Assign Rider'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
