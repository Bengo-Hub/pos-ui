import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared "nothing here yet" block for non-table surfaces (DataTable has its own `emptyState`
 * prop). Extracted because every list page hand-rolled the same centred icon + message + optional
 * call-to-action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center gap-2', className)}>
      <Icon className="h-10 w-10 opacity-30 text-muted-foreground" />
      <p className="font-medium text-muted-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
