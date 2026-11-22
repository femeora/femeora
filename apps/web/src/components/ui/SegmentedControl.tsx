'use client';

import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** A row of mutually exclusive toggle buttons (interval, unit, shape...). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex rounded-[2px] border border-line', className)}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              't-label flex-1 whitespace-nowrap transition-colors duration-fast',
              size === 'sm' ? 'min-h-8 px-2.5' : 'min-h-11 px-4',
              selected ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
