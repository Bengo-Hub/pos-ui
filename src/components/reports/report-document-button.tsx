'use client';

import { FileText, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { PdfPreview, useDocumentPreview } from '@bengo-hub/shared-ui-lib/documents';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';

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
  variant?: 'primary' | 'outline' | 'ghost';
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

/**
 * ReportCsvButton downloads the SAME report endpoint's ?format=csv output (pos-api's docs engine
 * flattens every table/key-value/chart section into rows — nothing is lost, charts become
 * label,value pairs). Fetches via the authenticated apiClient and saves through a temporary object
 * URL — a bare <a href download> would hit the endpoint without the bearer token and 401.
 */
export interface ReportCsvButtonProps {
  report: string;
  params?: Record<string, string | number | undefined>;
  fileName: string;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'primary' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
}

export function ReportCsvButton({
  report,
  params,
  fileName,
  label = 'CSV',
  variant = 'outline',
  className,
  disabled,
}: ReportCsvButtonProps) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');

  const handleClick = async () => {
    if (!tenantID) {
      toast.error('No tenant in the current session.');
      return;
    }
    const q: Record<string, string> = { format: 'csv' };
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== '') q[k] = String(v);
    }
    try {
      const blob = await apiClient.getBlob(`/api/v1/${tenantID}/pos/reports/${report}`, q);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download CSV.');
    }
  };

  return (
    <Button type="button" variant={variant} onClick={() => void handleClick()} disabled={disabled} className={className ?? 'gap-2 h-8 text-xs'}>
      <Sheet className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

/**
 * ReportExportButtons — the standard pairing for every Analytics-page report: a PDF button (preview
 * modal with charts/cards) and a CSV button (direct download, same underlying docs.Report data).
 * Point both at the SAME report slug — pos-api's ReportPDFHandler.write dispatches on ?format=.
 */
export interface ReportExportButtonsProps {
  report: string;
  params?: Record<string, string | number | undefined>;
  fileNameBase: string; // without extension, e.g. "sales-by-staff-2026-07-01-to-2026-07-08"
  title: string;
  orientation?: 'portrait' | 'landscape';
  className?: string;
}

export function ReportExportButtons({ report, params, fileNameBase, title, orientation, className }: ReportExportButtonsProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <ReportDocumentButton
        report={report} params={params} fileName={`${fileNameBase}.pdf`} title={title}
        orientation={orientation} label="PDF" size="sm" className="gap-1.5 h-7 text-xs px-2.5"
      />
      <ReportCsvButton
        report={report} params={params} fileName={`${fileNameBase}.csv`}
        label="CSV" size="sm" className="gap-1.5 h-7 text-xs px-2.5"
      />
    </div>
  );
}
