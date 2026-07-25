import { apiClient } from './client';

// Per-doc-type document numbering for POS. Numbers are PURE NUMERIC by default (empty prefix +
// empty date_format ⇒ just the zero-padded counter, e.g. 000001); a tenant can opt any doc type
// into a prefixed/dated format. Mirrors the treasury/inventory document-sequence settings.

export interface DocumentSequence {
  doc_type: string;
  prefix: string;
  separator: string;
  date_format: string; // '', YYMMDD, YYYYMMDD, MMYY
  padding: number;
  reset_freq: string; // never | daily | monthly | yearly
  current_val: number;
  next_number: string;
}

export type UpdateDocumentSequenceInput = Pick<
  DocumentSequence,
  'prefix' | 'separator' | 'date_format' | 'padding' | 'reset_freq'
>;

export const DOC_TYPE_LABELS: Record<string, string> = {
  order: 'Order Number',
  pos_receipt: 'Receipt',
  pos_return: 'Return',
  pos_reversal: 'Reversal',
  repair_job: 'Repair Job',
  prescription: 'Prescription Number',
};

// Suggested prefixes pre-filled ONLY when a tenant switches a doc type to the "Prefixed" format.
export const DOC_TYPE_SUGGESTED_PREFIX: Record<string, string> = {
  order: 'POS',
  pos_receipt: 'RCT',
  pos_return: 'RET',
  pos_reversal: 'REV',
  repair_job: 'JOB',
  prescription: 'RX',
};

export const DATE_FORMATS: { value: string; label: string }[] = [
  { value: '', label: 'No date' },
  { value: 'YYMMDD', label: 'YYMMDD (260625)' },
  { value: 'YYYYMMDD', label: 'YYYYMMDD (20260625)' },
  { value: 'MMYY', label: 'MMYY (0626)' },
];

export const documentSequencesApi = {
  list: (tenantID: string) =>
    apiClient.get<{ data: DocumentSequence[] } | DocumentSequence[]>(
      `/api/v1/${tenantID}/pos/document-sequences`,
    ),
  update: (tenantID: string, docType: string, data: UpdateDocumentSequenceInput) =>
    apiClient.put<DocumentSequence>(
      `/api/v1/${tenantID}/pos/document-sequences/${docType}`,
      data,
    ),
};
