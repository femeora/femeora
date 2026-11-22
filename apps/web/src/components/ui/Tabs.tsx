'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

interface TabsProps<T extends string> {
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
  className?: string;
  listClassName?: string;
  /** Extra controls rendered at the end of the tab row (filters, sort). */
  trailing?: ReactNode;
}

/**
 * Underlined tab list with a single panel for the selected tab. Only the active
 * panel is rendered, so callers pass the content for `value` as children.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  children,
  className,
  listClassName,
  trailing,
}: TabsProps<T>) {
  const baseId = useId();
  const tabId = (tab: T) => `${baseId}-tab-${tab}`;
  const panelId = `${baseId}-panel`;

  return (
    <div className={className}>
      <div className={cn('flex items-center gap-4 border-b border-line', listClassName)}>
        <div role="tablist" aria-label={label} className="flex gap-5 sm:gap-6">
          {items.map(item => {
            const selected = item.value === value;
            return (
              <button
                key={item.value}
                id={tabId(item.value)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(item.value)}
                className={cn(
                  '-mb-px min-h-11 whitespace-nowrap border-b-2 text-[0.9375rem] transition-colors duration-fast',
                  selected ? 'border-signal text-fg' : 'border-transparent text-muted hover:text-fg'
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {trailing}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(value)}>
        {children}
      </div>
    </div>
  );
}
