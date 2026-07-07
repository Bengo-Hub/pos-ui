'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Info, Loader2, MonitorPlay, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { screensaverMediaApi } from '@/lib/api/settings';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { resolveMediaUrl, isVideoUrl, DEFAULT_SCREENSAVERS } from '@/lib/screensaver';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { P } from '@/lib/rbac/permissions';
import { apiErrorMessage } from '@/lib/api/error-message';
import { inputClass, labelClass } from './shared';

const MAX_SLOTS = 3;
const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4';

/**
 * Display tab — idle-screen (screensaver) management: up to 3 admin-uploaded images/videos
 * rotated as a slideshow on the PIN screen and terminal idle lock. Replacing media requires
 * deleting the existing slot first (the backend also removes the file from storage), per the
 * managed-media contract. Falls back to the bundled per-tenant defaults, then the branded
 * gradient, when nothing is uploaded.
 */
export function DisplayTab() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const orgSlug = useAuthStore((s) => s.user?.tenant_slug ?? '');
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: settings } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();

  const { data, isLoading } = useQuery({
    queryKey: ['pos-screensavers', tenantID],
    queryFn: () => screensaverMediaApi.list(tenantID),
    enabled: !!tenantID,
  });
  const urls = useMemo(() => data?.screensaver_urls ?? [], [data]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['pos-screensavers', tenantID] });
    void qc.invalidateQueries({ queryKey: ['pos-settings', tenantID] });
    void qc.invalidateQueries({ queryKey: ['pos-current-outlet'] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => screensaverMediaApi.upload(tenantID, file),
    onSuccess: () => { toast.success('Screensaver uploaded'); invalidate(); },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Upload failed')),
  });

  const remove = useMutation({
    mutationFn: (url: string) => screensaverMediaApi.remove(tenantID, url),
    onSuccess: () => { toast.success('Screensaver deleted'); setDeleteTarget(null); invalidate(); },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Delete failed')),
  });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('File too large — max 8MB.');
      return;
    }
    upload.mutate(file);
  };

  const defaults = DEFAULT_SCREENSAVERS[orgSlug] ?? [];
  const legacyUrl = settings?.screensaver_url ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Screensaver slideshow</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Up to {MAX_SLOTS} images or a video shown when a terminal goes idle (PIN screen and
            terminal lock). Images rotate with a slow crossfade. To replace one, delete its slot
            first — deleting also removes the file from storage.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from({ length: MAX_SLOTS }).map((_, i) => {
              const url = urls[i];
              if (!url) {
                return (
                  <button
                    key={`empty-${i}`}
                    type="button"
                    disabled={!canEdit || upload.isPending || i > urls.length}
                    onClick={() => fileInput.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 aspect-video rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {upload.isPending && i === urls.length
                      ? <Loader2 className="h-6 w-6 animate-spin" />
                      : <ImagePlus className="h-6 w-6" />}
                    <span className="text-xs font-semibold">Add screensaver</span>
                  </button>
                );
              }
              const abs = resolveMediaUrl(url);
              return (
                <div key={url} className="relative group rounded-xl overflow-hidden border border-border aspect-video bg-black/80">
                  {isVideoUrl(url) ? (
                    <video src={abs} muted playsInline className="h-full w-full object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={abs} alt={`Screensaver ${i + 1}`} className="h-full w-full object-contain" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
                    <span className="text-[11px] font-bold text-white/90">Slot {i + 1}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(url)}
                        className="flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[11px] font-semibold text-white hover:bg-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />

          {isLoading && <p className="text-xs text-muted-foreground">Loading screensavers…</p>}

          <div className="flex items-start gap-2 rounded-lg bg-accent/40 border border-border px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {urls.length === 0
                ? defaults.length
                  ? `Nothing uploaded — terminals rotate the ${defaults.length} bundled default images for this tenant.`
                  : 'Nothing uploaded — terminals show the branded gradient screensaver.'
                : `Terminals rotate the ${urls.length} uploaded ${urls.length === 1 ? 'item' : 'items'}.`}
              {' '}A video plays exclusively (no rotation). PNG, JPEG, WebP or MP4, max 8MB each.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Legacy single-URL override (external link) — kept editable for tenants that host media
          elsewhere; uploaded slots above take precedence in the rotation. */}
      <Card>
        <CardHeader>
          <span className="font-bold text-sm">External screensaver URL (optional)</span>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className={labelClass}>Image or video URL</label>
          <input
            type="url"
            className={inputClass}
            placeholder="https://…/screensaver.mp4"
            defaultValue={legacyUrl ?? ''}
            disabled={!canEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (legacyUrl ?? '')) updateSettings.mutate({ screensaver_url: v } as never);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Used when set and no uploads exist above. The screensaver idle timeout is configured
            under Settings → Platform.
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this screensaver?"
        description="It is removed from the rotation AND the media file is permanently deleted from storage."
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
      />
    </div>
  );
}
