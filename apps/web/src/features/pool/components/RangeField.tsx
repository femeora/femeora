'use client';

import { useId } from 'react';

import { formatPct } from '../model/format';

interface RangeFieldProps {
  label: 'Min' | 'Max';
  pct: number;
  /** Absolute value at this bound, already formatted in the chart unit. */
  valueLabel: string;
  sliderMin: number;
  sliderMax: number;
  onChange: (pct: number) => void;
}

/** One range bound: % from current price as a number input plus a slider, kept in sync. */
export function RangeField({
  label,
  pct,
  valueLabel,
  sliderMin,
  sliderMax,
  onChange,
}: RangeFieldProps) {
  const id = useId();
  const update = (raw: string) => {
    const next = Number.parseFloat(raw);
    if (Number.isFinite(next)) onChange(next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-[2px] border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="t-label text-muted">
          {label} · % from price
        </label>
        <span className="font-mono text-[0.8125rem] tabular-nums">{valueLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={1}
          value={pct}
          onChange={event => update(event.target.value)}
          className="w-20 rounded-[2px] border border-line-strong bg-transparent px-2 py-2 font-mono text-sm tabular-nums"
        />
        <input
          type="range"
          aria-label={`${label} slider`}
          aria-valuetext={formatPct(pct, 0)}
          min={sliderMin}
          max={sliderMax}
          step={1}
          value={Math.min(sliderMax, Math.max(sliderMin, pct))}
          onChange={event => update(event.target.value)}
          className="h-11 flex-1 accent-[rgb(var(--signal))]"
        />
      </div>
    </div>
  );
}
