'use client';

/**
 * Drafts — saved-but-unpaid sales. A draft is just a POSOrder with status="draft" (saved from the
 * terminal "Park" or Add Sale "Save as Draft"). Reuses useOrders({status:'draft'}); resuming a draft
 * opens its order detail where payment is taken. No new listing logic.
 */

import { useOrders } from '@/hooks/usePOS';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, FileText, ArrowRight } from 'lucide-react';

export default function DraftsPage() {
  const params = useParams();
  const org = (params?.orgSlug as string) || '';
  const { data, isLoading } = useOrders({ status: 'draft', limit: 100 });
  const drafts: any[] = data?.data ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Drafts</h1>
        <span className="text-sm text-muted-foreground">{drafts.length} saved</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : drafts.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border px-6 py-12 text-center text-muted-foreground">
          No drafts. Save an in-progress sale as a draft from the POS terminal (Park) or Add Sale to resume it later.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {drafts.map((o) => {
            const lineCount = (o.edges?.lines ?? o.lines ?? []).length;
            return (
              <Link
                key={o.id}
                href={`/${org}/sell/add?order_id=${o.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-accent/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm font-mono truncate">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.customer_name ? `${o.customer_name} · ` : ''}
                    {o.created_at ? new Date(o.created_at).toLocaleString() : ''}
                    {lineCount ? ` · ${lineCount} item${lineCount === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-sm tabular-nums">KES {(o.total_amount ?? 0).toLocaleString()}</span>
                  {/* REQ-003: resumes into Add Sale with lines/customer prefilled; completing
                      payment reclassifies THIS draft (no duplicate). */}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Resume Sale <ArrowRight className="h-3.5 w-3.5" /></span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
