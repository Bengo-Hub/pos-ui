'use client';

import { useRef, useState } from 'react';
import { FileText, Link2, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';

import { useUploadJobAttachment } from '@/hooks/useServiceJobs';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  isHttpUrl,
  JOB_FILE_ACCEPT,
  MAX_JOB_FILE_BYTES,
  MAX_JOB_FILES,
  MAX_JOB_LINKS,
  type JobAttachment,
} from '@/lib/api/service-jobs';
import { resolveMediaUrl } from '@/lib/screensaver';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

/**
 * Reference media on a job: links (Google Drive, YouTube, Instagram, any URL) and small uploads
 * (images or PDF, 512 KB each, 5 files at most). Bigger files belong in a link. Used by the
 * terminal's job panel and by the job detail on the Orders page.
 */
export function JobAttachmentsEditor({
  value,
  onChange,
  disabled,
}: {
  value: JobAttachment[];
  onChange: (next: JobAttachment[]) => void;
  disabled?: boolean;
}) {
  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadJobAttachment();
  const [uploading, setUploading] = useState(false);

  const files = value.filter((a) => a.kind === 'file');
  const links = value.filter((a) => a.kind === 'link');

  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    if (!isHttpUrl(url)) {
      toast.error('Paste a full link starting with https://');
      return;
    }
    if (links.length >= MAX_JOB_LINKS) {
      toast.error(`At most ${MAX_JOB_LINKS} links per job`);
      return;
    }
    onChange([...value, { kind: 'link', url, label: label.trim() || undefined }]);
    setLink('');
    setLabel('');
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = MAX_JOB_FILES - files.length;
    if (room <= 0) {
      toast.error(`At most ${MAX_JOB_FILES} files per job. Share more as a link.`);
      return;
    }
    const picked = Array.from(list).slice(0, room);
    if (list.length > room) toast.info(`Only ${room} more file(s) allowed; the rest were skipped.`);
    const tooBig = picked.filter((f) => f.size > MAX_JOB_FILE_BYTES);
    if (tooBig.length > 0) {
      toast.error(`${tooBig.map((f) => f.name).join(', ')} is over 512 KB. Share it as a Google Drive link instead.`);
    }
    const ok = picked.filter((f) => f.size <= MAX_JOB_FILE_BYTES);
    if (ok.length === 0) return;
    setUploading(true);
    const added: JobAttachment[] = [];
    try {
      for (const f of ok) {
        const res = await upload.mutateAsync(f);
        added.push({ kind: 'file', url: res.url, label: res.label || f.name });
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
      if (added.length > 0) onChange([...value, ...added]);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              {a.kind === 'link' ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <a
                href={resolveMediaUrl(a.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-primary hover:underline"
              >
                {a.label || a.url}
              </a>
              {!disabled && (
                <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove attachment">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={inputCls}
              placeholder="Paste a link (Google Drive, YouTube, Instagram)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
            />
            <input
              className={`${inputCls} sm:max-w-40`}
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button
              type="button"
              onClick={addLink}
              disabled={!link.trim()}
              className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Add link
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={JOB_FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || files.length >= MAX_JOB_FILES}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Attach file'}
            </button>
            <span className="text-[11px] text-muted-foreground">
              Images or PDF, 512 KB each, {files.length}/{MAX_JOB_FILES} files
            </span>
          </div>
        </>
      )}
    </div>
  );
}
