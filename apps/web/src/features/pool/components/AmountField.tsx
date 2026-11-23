'use client';

import { useId } from 'react';

import { TokenIcon } from '@/components/ui/TokenPair';

import { formatCompactUsd } from '../model/format';

interface AmountFieldProps {
  token: string;
  tokenAddress: string;
  value: string;
  usdPerToken: number;
  enabled: boolean;
  onChange: (value: string) => void;
}

const DECIMAL = /^\d*\.?\d*$/;

/** Deposit amount for one token. Disabled, with a reason, when the range does not use it. */
export function AmountField({ token, tokenAddress, value, usdPerToken, enabled, onChange }: AmountFieldProps) {
  const id = useId();
  const amount = Number.parseFloat(value);
  const usd = Number.isFinite(amount) ? amount * usdPerToken : 0;

  return (
    <div className="glass rounded-[2px] p-3 focus-within:border-fg/40 has-[:disabled]:opacity-50">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="t-label inline-flex items-center gap-2 text-muted">
          <TokenIcon token={tokenAddress} className="size-5" />
          {token}
        </label>
        <span className="t-label text-faint">
          {enabled ? formatCompactUsd(usd) : 'Not needed for this range'}
        </span>
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        disabled={!enabled}
        value={enabled ? value : ''}
        onChange={event => DECIMAL.test(event.target.value) && onChange(event.target.value)}
        className="mt-1 w-full bg-transparent py-1 font-mono text-xl tabular-nums outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
    </div>
  );
}
