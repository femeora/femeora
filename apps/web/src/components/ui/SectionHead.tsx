import type { ReactNode } from 'react';

import { ScrollScene } from '@/components/motion/ScrollScene';
import { cn } from '@/lib/cn';

import { Reveal } from './Reveal';

interface SectionHeadProps {
  cue: string;
  label: string;
  title: ReactNode;
  id: string;
  className?: string;
}

/**
 * "CUE 01 · LABEL  Title" row that opens each numbered section.
 * The title is the section's h2 and is wired to `aria-labelledby` via `id`.
 * The top rule draws itself across as the head scrolls into view.
 */
export function SectionHead({ cue, label, title, id, className }: SectionHeadProps) {
  return (
    <ScrollScene start={0.95} end={0.45} className={cn('scroll-rule', className)}>
      <Reveal className="grid-12 items-baseline gap-y-4 pt-6 md:pt-8">
        <p className="t-label col-span-12 flex gap-6 text-muted md:col-span-3 lg:col-span-2">
          <span>{cue}</span>
          <span className="text-fg">{label}</span>
        </p>
        <h2 id={id} className="col-span-12 text-h2 font-medium md:col-span-9 lg:col-span-10">
          {title}
        </h2>
      </Reveal>
    </ScrollScene>
  );
}
