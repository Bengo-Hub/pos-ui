'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 py-4 border-b border-border bg-accent/5", className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'default',
  ...props
}: {
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  [key: string]: any;
}) {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };

  const sizes = {
    default: 'px-4 py-2',
    sm: 'px-3 py-1.5 text-xs',
    lg: 'px-6 py-3',
    icon: 'h-10 w-10 p-0',
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, className, variant = 'default' }: { children: ReactNode; className?: string; variant?: 'default' | 'success' | 'warning' | 'error' | 'outline' }) {
  const variants = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
    outline: 'bg-transparent text-muted-foreground border-border',
  };

  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
}
