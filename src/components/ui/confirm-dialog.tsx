'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LucideIcon, TriangleAlert, Trash2, ShieldAlert, Info } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title — keep short */
  title: string;
  /** Descriptive body text — explain consequences */
  description?: string;
  /** Label for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Visual style of the confirm action */
  variant?: ConfirmVariant;
  /** Disable the confirm button (e.g. while async operation is in progress) */
  loading?: boolean;
}

const VARIANT_ICONS: Record<ConfirmVariant, LucideIcon> = {
  danger: Trash2,
  warning: TriangleAlert,
  info: Info,
};

const VARIANT_ICON_CLASSES: Record<ConfirmVariant, string> = {
  danger: 'bg-destructive/10 text-destructive',
  warning: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  info: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
};

const VARIANT_CONFIRM_CLASSES: Record<ConfirmVariant, string> = {
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
  info: '',
};

/**
 * Reusable confirmation dialog for destructive/sensitive actions.
 * Wraps shadcn AlertDialog with a consistent layout.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete item?" onConfirm={handleDelete} variant="danger" />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'info',
  loading = false,
}: ConfirmDialogProps) {
  const Icon = VARIANT_ICONS[variant];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className={VARIANT_ICON_CLASSES[variant]}>
            <Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={VARIANT_CONFIRM_CLASSES[variant]}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'Processing…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
