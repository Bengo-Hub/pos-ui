'use client';

/**
 * Log a guest item found on the property, with optional photos — a room (or a common area,
 * when opened without a room) and, when known, the guest it belongs to. Available whether the
 * room is occupied or not, since most finds happen during post-checkout cleaning.
 */

import { useState } from 'react';
import { Camera, Loader2, PackageSearch, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateLostFoundItem, useUploadLostFoundPhoto } from '@/hooks/useHotel';
import { apiErrorMessage } from '@/lib/api/error-message';
import { resolveMediaUrl } from '@/lib/screensaver';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'jewelry', label: 'Jewelry' },
  { value: 'documents', label: 'Documents' },
  { value: 'toiletries', label: 'Toiletries' },
  { value: 'luggage', label: 'Luggage' },
  { value: 'other', label: 'Other' },
];

interface LostFoundModalProps {
  outletId: string;
  roomId?: string;
  roomGuestId?: string;
  roomLabel?: string;
  open: boolean;
  onClose: () => void;
}

export function LostFoundModal({ outletId, roomId, roomGuestId, roomLabel, open, onClose }: LostFoundModalProps) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [locationFound, setLocationFound] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const create = useCreateLostFoundItem();
  const uploadPhoto = useUploadLostFoundPhoto();

  if (!open) return null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadPhoto.mutateAsync(file);
        setPhotoUrls((prev) => [...prev, res.url]);
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to upload photo'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!description.trim()) { toast.error('Describe the item'); return; }
    try {
      await create.mutateAsync({
        outlet_id: outletId,
        room_id: roomId,
        room_guest_id: roomGuestId,
        description: description.trim(),
        category,
        location_found: locationFound.trim() || undefined,
        photo_urls: photoUrls,
      });
      toast.success('Item logged');
      setDescription('');
      setCategory('other');
      setLocationFound('');
      setPhotoUrls([]);
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to log item'));
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
            <PackageSearch className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-foreground">Log Found Item{roomLabel ? ` · ${roomLabel}` : ''}</h2>
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
          <label className="block">
            <span className="text-sm font-medium text-foreground">What was found *</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Black leather wallet, silver watch"
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Where found</span>
              <input
                value={locationFound}
                onChange={(e) => setLocationFound(e.target.value)}
                placeholder="e.g. under the bed"
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-foreground">Photos (optional)</span>
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
            {photoUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {photoUrls.map((url) => (
                  <div key={url} className="relative group">
                    <img src={resolveMediaUrl(url)} alt="Found item" className="h-16 w-16 rounded-lg object-cover border border-border" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
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
              disabled={create.isPending || uploading}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {create.isPending ? 'Saving…' : 'Log Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
