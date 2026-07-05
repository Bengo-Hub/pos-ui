'use client';

import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { PdfPreview, useDocumentPreview } from '@bengo-hub/shared-ui-lib/documents';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/base';

/**
 * ReportDocumentButton renders a "Print / Export" action that streams a branded PDF report from
 * pos-api and shows it in the shared PdfPreview modal (Download / Print / Open-in-tab) — the same
 * preview-first pattern inventory-ui uses for purchase orders. It is report-agnostic: point it at any
 * `/pos/reports/<report>` endpoint (Part B) and pass the date range / outlet params.
 */
export interface ReportDocumentButtonProps {
  /** Report endpoint slug under /pos/reports, e.g. "reset-summary" or "shift/<sessionId>". */
  report: string;
  /** Query params (from/to/outlet_id/…). `format` defaults to "pdf". */
  params?: Record<string, string | number | undefined>;
  /** Download file name (without directory), e.g. "reset-summary-2026-07-05.pdf". */
  fileName: string;
  /** Modal title. */
  title: string;
  /** Wide tables (staff/tax) preview better in landscape. */
  orientation?: 'portrait' | 'landscape';
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
}

export function ReportDocumentButton({
  report,
  params,
  fileName,
  title,
  orientation = 'portrait',
  label = 'Print / Export',
  variant = 'outline',
  className,
  disabled,
}: ReportDocumentButtonProps) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { openPreview, previewProps } = useDocumentPreview({ onError: (m) => toast.error(m) });

  const handleClick = () => {
    if (!tenantID) {
      toast.error('No tenant in the current session.');
      return;
    }
    // Only-defined params (drop undefined so the query string stays clean).
    const q: Record<string, string> = { format: 'pdf' };
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== '') q[k] = String(v);
    }
    void openPreview(
      () => apiClient.getBlob(`/api/v1/${tenantID}/pos/reports/${report}`, q),
      { fileName, title, orientation },
    );
  };

  return (
    <>
      <Button type="button" variant={variant} onClick={handleClick} disabled={disabled} className={className ?? 'gap-2 h-8 text-xs'}>
        <FileText className="h-3.5 w-3.5" /> {label}
      </Button>
      <PdfPreview {...previewProps} />
    </>
  );
}
