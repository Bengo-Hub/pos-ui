'use client';

/**
 * Edit an active guest's own contact/ID details, occupancy, and stay dates (extend/shorten).
 * A correction/amendment tool, not a re-billing one — see pos-api's UpdateGuest doc comment: it
 * never touches total_room_charge, even when nights or occupancy changes. Any resulting billing
 * adjustment (an extra night, an extra-adult surcharge) is posted separately via the room detail
 * page's existing "Add Folio Charge" action, the same tool used for every other ad-hoc charge.
 */

import { useEffect, useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateGuest } from '@/hooks/useHotel';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RoomGuest } from '@/lib/api/hotel';

interface EditGuestModalProps {
  roomId: string;
  guest: RoomGuest;
  open: boolean;
  onClose: () => void;
}

function formStateFromGuest(guest: RoomGuest) {
  return {
    first_name: guest.first_name ?? '',
    last_name: guest.last_name ?? '',
    email: guest.email ?? '',
    phone: guest.phone ?? '',
    nationality: guest.nationality ?? '',
    id_type: guest.id_type ?? 'national_id',
    id_number: guest.id_number ?? '',
    adults: String(guest.adults ?? 1),
    children: String(guest.children ?? 0),
    child_ages: (guest.child_ages ?? []).join(', '),
    nights: String(guest.nights ?? 1),
  };
}

export function EditGuestModal({ roomId, guest, open, onClose }: EditGuestModalProps) {
  const [form, setForm] = useState(() => formStateFromGuest(guest));

  // Reset the form whenever a DIFFERENT guest/room opens the modal (not on every guest refetch,
  // which would otherwise clobber in-progress edits the moment the query revalidates).
  useEffect(() => {
    if (!open) return;
    setForm(formStateFromGuest(guest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guest.id]);

  const update = useUpdateGuest(roomId);

  if (!open) return null;

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function parseChildAges(): number[] {
    return form.child_ages
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }

  async function handleSave() {
    if (!form.phone.trim()) { toast.error('Phone number is required'); return; }
    if (!form.id_number.trim()) { toast.error('ID number is required'); return; }
    const nights = Math.max(1, parseInt(form.nights) || 1);
    const nightsChanged = nights !== guest.nights;
    try {
      await update.mutateAsync({
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
        guest_name: `${form.first_name} ${form.last_name}`.trim() || form.first_name || guest.guest_name,
        email: form.email || undefined,
        phone: form.phone,
        nationality: form.nationality || undefined,
        id_type: form.id_type,
        id_number: form.id_number,
        adults: Math.max(1, parseInt(form.adults) || 1),
        children: Math.max(0, parseInt(form.children) || 0),
        child_ages: parseChildAges(),
        nights,
      });
      toast.success(
        nightsChanged
          ? 'Guest & stay updated — post a folio charge for any extra nights/guests owed'
          : 'Guest details updated',
      );
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update guest'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Edit Guest / Booking</h2>
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
            Corrects the guest&apos;s own details and the stay&apos;s dates/occupancy — it does not change what&apos;s already been charged. If extending the stay or adding guests should bill for more, post that separately via &quot;Add Folio Charge&quot;.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name" value={form.first_name} onChange={(v) => setField('first_name', v)} />
            <Field label="Last Name" value={form.last_name} onChange={(v) => setField('last_name', v)} />
            <Field label="Phone *" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+254..." />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
            <Field label="Nationality" value={form.nationality} onChange={(v) => setField('nationality', v)} />
            <label className="block">
              <span className="text-sm font-medium text-foreground">ID Type</span>
              <select
                value={form.id_type}
                onChange={(e) => setField('id_type', e.target.value)}
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="driving_licence">Driving Licence</option>
                <option value="other">Other</option>
              </select>
            </label>
            <Field label="ID Number *" value={form.id_number} onChange={(v) => setField('id_number', v)} />
            <Field label="Nights" type="number" value={form.nights} onChange={(v) => setField('nights', v)} />
            <Field label="Adults" type="number" value={form.adults} onChange={(v) => setField('adults', v)} />
            <Field label="Children" type="number" value={form.children} onChange={(v) => setField('children', v)} />
            <Field label="Child Ages (comma-separated)" value={form.child_ages} onChange={(v) => setField('child_ages', v)} placeholder="e.g. 4, 9" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {update.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
