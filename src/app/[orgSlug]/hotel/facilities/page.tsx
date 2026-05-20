'use client';

import { useFacilities, useBookFacility } from '@/hooks/useHotel';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { Building2, CalendarPlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const statusColors: Record<string, string> = {
  available:   'bg-green-500/10 text-green-700 dark:text-green-400',
  occupied:    'bg-red-500/10 text-red-700 dark:text-red-400',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  closed:      'bg-muted text-muted-foreground',
};

const typeEmoji: Record<string, string> = {
  pool: '🏊', gym: '🏋️', conference: '🎙️', spa: '💆', kids_area: '🧒', other: '🏠',
};

const emptyForm = { guest_name: '', phone: '', session_date: '', start_time: '', end_time: '', guests_count: '1' };

export default function FacilitiesPage() {
  const [bookingFacilityId, setBookingFacilityId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: facilities = [], isLoading } = useFacilities();
  const book = useBookFacility(bookingFacilityId ?? '');

  async function handleBook(facilityId: string) {
    try {
      await book.mutateAsync({ ...form, guests_count: parseInt(form.guests_count) });
      toast.success('Facility booked');
      setBookingFacilityId(null);
      setForm(emptyForm);
    } catch {
      toast.error('Booking failed');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Facilities</h1>
        <p className="text-sm text-muted-foreground mt-1">{facilities.length} facilities</p>
      </div>

      {facilities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Building2 className="h-12 w-12 opacity-30" />
          <p>No facilities configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((facility) => (
            <Card key={facility.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{typeEmoji[facility.facility_type] ?? '🏠'}</span>
                    <div>
                      <p className="font-semibold text-foreground">{facility.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{facility.facility_type.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', statusColors[facility.status])}>
                    {facility.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Capacity</p>
                    <p className="font-medium text-foreground">{facility.capacity} guests</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Rate</p>
                    <p className="font-medium text-primary">KES {facility.rate_per_session.toLocaleString()}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Hours</p>
                    <p className="font-medium text-foreground">{facility.opening_time} – {facility.closing_time}</p>
                  </div>
                </div>

                {facility.status === 'available' && (
                  <button
                    onClick={() => setBookingFacilityId(facility.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                  >
                    <CalendarPlus className="h-4 w-4" /> Book Session
                  </button>
                )}

                {bookingFacilityId === facility.id && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    {[
                      { key: 'guest_name', label: 'Guest Name', placeholder: 'Full name' },
                      { key: 'phone', label: 'Phone', placeholder: '+254...' },
                      { key: 'session_date', label: 'Date', type: 'date' },
                      { key: 'start_time', label: 'Start Time', type: 'time' },
                      { key: 'end_time', label: 'End Time', type: 'time' },
                      { key: 'guests_count', label: 'Guests', type: 'number', placeholder: '1' },
                    ].map(({ key, label, placeholder, type }) => (
                      <label key={key} className="block">
                        <span className="text-xs font-medium text-foreground">{label}</span>
                        <input
                          type={type ?? 'text'}
                          value={(form as any)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="mt-0.5 w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </label>
                    ))}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBookingFacilityId(null)}
                        className="flex-1 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleBook(facility.id)}
                        disabled={book.isPending}
                        className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {book.isPending ? 'Booking…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
