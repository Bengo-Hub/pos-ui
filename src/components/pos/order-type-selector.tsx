'use client';

import { cn } from '@/lib/utils';
import { type OrderSubtype } from '@/hooks/usePOS';
import { UtensilsCrossed, ShoppingBag, BedDouble, Bike, GlassWater } from 'lucide-react';

interface OrderTypeSelectorProps {
  value: OrderSubtype | null;
  onChange: (subtype: OrderSubtype) => void;
  tableName?: string;
  onSelectTable?: () => void;
  useCase?: string;
  className?: string;
}

const HOSPITALITY_USE_CASES = ['hospitality', 'hotel', 'bar', 'cafe', 'restaurant', 'quick_service'];

function isHospitalityUseCase(useCase?: string) {
  return HOSPITALITY_USE_CASES.some((uc) => (useCase ?? '').toLowerCase().includes(uc));
}

interface SubtypeOption {
  value: OrderSubtype;
  label: string;
  icon: React.ReactNode;
  useCases?: string[]; // if set, only show for these use cases
}

const OPTIONS: SubtypeOption[] = [
  {
    value: 'dine_in',
    label: 'Dine-In',
    icon: <UtensilsCrossed className="h-4 w-4" />,
    useCases: ['hospitality', 'hotel', 'bar', 'cafe', 'restaurant', 'quick_service'],
  },
  {
    value: 'takeaway',
    label: 'Takeaway',
    icon: <ShoppingBag className="h-4 w-4" />,
    useCases: ['hospitality', 'hotel', 'bar', 'cafe', 'restaurant', 'quick_service', 'retail'],
  },
  {
    value: 'room_service',
    label: 'Room Service',
    icon: <BedDouble className="h-4 w-4" />,
    useCases: ['hotel'],
  },
  {
    value: 'delivery',
    label: 'Delivery',
    icon: <Bike className="h-4 w-4" />,
  },
  {
    value: 'bar_tab',
    label: 'Bar Tab',
    icon: <GlassWater className="h-4 w-4" />,
    useCases: ['bar', 'hospitality', 'hotel'],
  },
];

export function OrderTypeSelector({
  value,
  onChange,
  tableName,
  onSelectTable,
  useCase,
  className,
}: OrderTypeSelectorProps) {
  const uc = (useCase ?? '').toLowerCase();
  const visibleOptions = OPTIONS.filter((opt) => {
    if (!opt.useCases) return true;
    return opt.useCases.some((u) => uc.includes(u));
  });

  if (visibleOptions.length <= 1) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-1.5 flex-wrap">
        {visibleOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all',
              value === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table context — shown when dine_in is selected */}
      {value === 'dine_in' && (
        <div className="flex items-center gap-2 text-sm">
          {tableName ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/20">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Table {tableName}
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelectTable}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Select a table →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
