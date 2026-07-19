'use client';

import { useState } from 'react';
import { FileText, Loader2, Lock, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useDocumentSequences, useUpdateDocumentSequence } from '@/hooks/useDocumentSequences';
import {
  DATE_FORMATS,
  DOC_TYPE_LABELS,
  DOC_TYPE_SUGGESTED_PREFIX,
  type DocumentSequence,
} from '@/lib/api/document-sequences';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { toast } from 'sonner';
import { inputClass, labelClass } from './shared';

function DocumentSequenceRow({ seq, canEdit }: { seq: DocumentSequence; canEdit: boolean }) {
  const update = useUpdateDocumentSequence();
  const suggested = DOC_TYPE_SUGGESTED_PREFIX[seq.doc_type] ?? '';
  // 'numeric' → pure sequential number (000001); 'prefixed' → prefix/date/separator style.
  const [format, setFormat] = useState<'numeric' | 'prefixed'>(
    seq.prefix || seq.date_format ? 'prefixed' : 'numeric',
  );
  const [prefix, setPrefix] = useState(seq.prefix ?? '');
  const [separator, setSeparator] = useState(seq.separator || '-');
  const [dateFormat, setDateFormat] = useState(seq.date_format ?? '');
  const [padding, setPadding] = useState(String(seq.padding ?? 6));

  const selectNumeric = () => {
    setFormat('numeric');
    setPrefix('');
    setDateFormat('');
  };
  const selectPrefixed = () => {
    setFormat('prefixed');
    setPrefix((p) => p || suggested);
    setDateFormat((d) => d || 'YYMMDD');
  };

  // Live local preview mirrors the backend formatter.
  const preview = (() => {
    const parts: string[] = [];
    if (format === 'prefixed' && prefix.trim()) parts.push(prefix.trim());
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateMap: Record<string, string> = {
      YYMMDD: `${yy}${mm}${dd}`,
      YYYYMMDD: `${yyyy}${mm}${dd}`,
      MMYY: `${mm}${yy}`,
    };
    if (format === 'prefixed' && dateFormat && dateMap[dateFormat]) parts.push(dateMap[dateFormat]);
    const n = (seq.current_val + 1).toString().padStart(Math.max(1, parseInt(padding, 10) || 1), '0');
    parts.push(n);
    return parts.join(separator || '-');
  })();

  function save() {
    const numeric = format === 'numeric';
    update.mutate(
      {
        docType: seq.doc_type,
        data: {
          prefix: numeric ? '' : prefix.trim(),
          separator: separator || '-',
          date_format: numeric ? '' : dateFormat,
          padding: parseInt(padding, 10) || 6,
          reset_freq: seq.reset_freq,
        },
      },
      { onSuccess: () => toast.success(`${DOC_TYPE_LABELS[seq.doc_type] ?? seq.doc_type} numbering updated`) },
    );
  }

  const toggleBtn = (mode: 'numeric' | 'prefixed', label: string, onClick: () => void) => (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onClick}
      className={`px-3 py-1 rounded text-sm ${
        format === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm">{DOC_TYPE_LABELS[seq.doc_type] ?? seq.doc_type}</span>
        <span className="text-xs font-mono text-muted-foreground">
          Next: <span className="font-bold text-foreground">{preview}</span>
        </span>
      </div>
      <div className="inline-flex rounded-md border border-border bg-background p-0.5">
        {toggleBtn('numeric', 'Numeric', selectNumeric)}
        {toggleBtn('prefixed', 'Prefixed', selectPrefixed)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {format === 'prefixed' && (
          <>
            <div>
              <label className={labelClass}>Prefix</label>
              <input
                className={inputClass}
                value={prefix}
                disabled={!canEdit}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder={suggested || 'POS'}
              />
            </div>
            <div>
              <label className={labelClass}>Separator</label>
              <input
                className={inputClass}
                value={separator}
                maxLength={3}
                disabled={!canEdit}
                onChange={(e) => setSeparator(e.target.value)}
                placeholder="-"
              />
            </div>
            <div>
              <label className={labelClass}>Date format</label>
              <select
                className={inputClass}
                value={dateFormat}
                disabled={!canEdit}
                onChange={(e) => setDateFormat(e.target.value)}
              >
                {DATE_FORMATS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className={labelClass}>Padding</label>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={12}
            value={padding}
            disabled={!canEdit}
            onChange={(e) => setPadding(e.target.value)}
          />
        </div>
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-1.5" /> {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function DocumentNumberingTab() {
  const { data: sequences, isLoading } = useDocumentSequences();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm">Document Numbering</span>
          {!canEdit && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Choose pure numeric numbering (the default, e.g. 000001) or a prefixed/dated format (e.g.
          POS-260625-000001) for order, receipt, return, reversal, and repair-job numbers. Changes
          apply to newly created documents.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (sequences ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No document sequences configured yet.
          </p>
        ) : (
          (sequences ?? []).map((s) => (
            <DocumentSequenceRow key={s.doc_type} seq={s} canEdit={canEdit} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
