'use client';

/**
 * Report a suspected guest-caused damage/fine against a room, with optional photo evidence.
 * This creates a RoomDamageReport in "pending" state — it does NOT post anything to the
 * folio yet. A manager reviews it (approve auto-posts the charge; reject records why) from
 * the Damage Reports page. Available whether the room is occupied or not, since damage is
 * often found by housekeeping after the guest has already checked out.
 */

import { useState } from 'react';
import { Camera, Loader2, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateDamageReport, useUploadDamageEvidence } from '@/hooks/useHotel';
import { apiErrorMessage } from '@/lib/api/error-message';
import { resolveMediaUrl } from '@/lib/screensaver';

interface DamageReportModalProps {
  roomId: string;
  roomNumber: string;
  open: boolean;
  onClose: () => void;
}

export function DamageReportModal({ roomId, roomNumber, open, onClose }: DamageReportModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const createReport = useCreateDamageReport(roomId);
  const uploadEvidence = useUploadDamageEvidence();

  if (!open) return null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadEvidence.mutateAsync(file);
        setEvidenceUrls((prev) => [...prev, res.url]);
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to upload photo'));
    } finally {
      setUploading(false);
    }
  }

  function removeEvidence(url: string) {
    setEvidenceUrls((prev) => prev.filter((u) => u !== url));
  }

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!description.trim()) { toast.error('Describe the damage'); return; }
    if (!amt || amt <= 0) { toast.error('Enter a positive estimated amount'); return; }
    try {
      await createReport.mutateAsync({ description: description.trim(), amount: amt, evidence_urls: evidenceUrls });
      toast.success('Damage report submitted for manager review');
      setDescription('');
      setAmount('');
      setEvidenceUrls([]);
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to submit damage report'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-bold text-foreground">Report Damage &middot; Room {roomNumber}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 px-3 py-2">
            This goes to a manager for review before it becomes a charge — it will not appear on the guest&apos;s folio until approved.
          </p>

          <label className="block">
            <span className="text-sm font-medium text-foreground">What happened *</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Burn mark on the duvet, broken lamp shade"
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Estimated cost *</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-foreground">Photo evidence (optional)</span>
            <label className="mt-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Add photos'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
              />
            </label>
            {evidenceUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {evidenceUrls.map((url) => (
                  <div key={url} className="relative group">
                    <img src={resolveMediaUrl(url)} alt="Damage evidence" className="h-16 w-16 rounded-lg object-cover border border-border" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => removeEvidence(url)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createReport.isPending || uploading}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createReport.isPending ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
