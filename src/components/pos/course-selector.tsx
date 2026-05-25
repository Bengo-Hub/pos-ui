'use client';

import { ChefHat } from 'lucide-react';

export const COURSES = [
  { value: 0, label: 'No course', short: '—' },
  { value: 1, label: 'Starter',   short: 'S1' },
  { value: 2, label: 'Main',      short: 'S2' },
  { value: 3, label: 'Dessert',   short: 'S3' },
  { value: 4, label: 'Bar',       short: 'Bar' },
] as const;

export type CourseValue = (typeof COURSES)[number]['value'];

interface CourseSelectorProps {
  value: CourseValue;
  onChange: (v: CourseValue) => void;
  compact?: boolean;
}

export function CourseSelector({ value, onChange, compact = false }: CourseSelectorProps) {
  const current = COURSES.find((c) => c.value === value) ?? COURSES[0];

  if (compact) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as CourseValue)}
        onClick={(e) => e.stopPropagation()}
        className="h-6 text-[10px] font-semibold rounded-md border border-border bg-card px-1 pr-5 cursor-pointer focus:ring-1 focus:ring-primary outline-none text-muted-foreground"
        title="Course"
      >
        {COURSES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <ChefHat className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as CourseValue)}
        onClick={(e) => e.stopPropagation()}
        className="text-xs font-semibold rounded-lg border border-border bg-card px-2 py-1 cursor-pointer focus:ring-1 focus:ring-primary outline-none text-foreground"
      >
        {COURSES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Badge shown on a cart item once a course is assigned */
export function CourseBadge({ course }: { course: CourseValue }) {
  if (course === 0) return null;
  const c = COURSES.find((x) => x.value === course)!;
  const colors: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    3: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    4: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${colors[course] ?? 'bg-muted text-muted-foreground'}`}>
      {c.short}
    </span>
  );
}
