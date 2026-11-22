'use client';

import { useId } from 'react';

import { cn } from '@/lib/cn';

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  className?: string;
}

/** Labelled on/off switch built on a native checkbox for keyboard and screen readers. */
export function Switch({ label, checked, onChange, hint, className }: SwitchProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-4', className)}
    >
      <span className="flex flex-col">
        <span className="text-[0.9375rem]">{label}</span>
        {hint ? <span className="t-label text-muted">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="h-5 w-9 rounded-full bg-fg/15 transition-colors duration-fast peer-checked:bg-signal peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal"
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 size-4 rounded-full bg-fg transition-transform duration-fast peer-checked:translate-x-4 peer-checked:bg-on-signal"
        />
      </span>
    </label>
  );
}
