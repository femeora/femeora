'use client';

import { useEffect, useId, useState } from 'react';

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
  const [input, setInput] = useState(String(Math.round(pct)));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setInput(String(Math.round(pct)));
  }, [editing, pct]);

  const commit = () => {
    const next = Number.parseInt(input, 10);
    setEditing(false);
    if (Number.isFinite(next)) onChange(next);
    else setInput(String(Math.round(pct)));
  };

  return (
    <div className="glass flex flex-col gap-2 rounded-[2px] p-3">
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
          inputMode="numeric"
          step={1}
          value={input}
          onFocus={event => {
            setEditing(true);
            event.currentTarget.select();
          }}
          onChange={event => {
            if (/^-?\d*$/.test(event.target.value)) setInput(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setInput(String(Math.round(pct)));
              event.currentTarget.blur();
            }
          }}
          className="glass-control w-20 rounded-[2px] px-2 py-2 font-mono text-sm tabular-nums"
        />
        <input
          type="range"
          aria-label={`${label} slider`}
          aria-valuetext={formatPct(pct, 0)}
          min={sliderMin}
          max={sliderMax}
          step={1}
          value={Math.min(sliderMax, Math.max(sliderMin, Math.round(pct)))}
          onChange={event => onChange(Number.parseInt(event.target.value, 10))}
          className="h-11 flex-1 accent-[rgb(var(--signal))]"
        />
      </div>
    </div>
  );
}
