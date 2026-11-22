'use client';

import { useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { ArrowUpDown } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

import { formatCompactUsd, formatTokenAmount } from '../model/format';
import type { Pool } from '../model/pool';
import { quoteSwap, SLIPPAGE_PCT, type SwapDirection } from '../model/swap';

import { AmountField } from './AmountField';
import { TxButton } from './TxButton';

/** Swap panel: one input, a live estimate, and the same wallet gate as Create Position. */
export function SwapForm({ pool }: { pool: Pool }) {
  const [direction, setDirection] = useState<SwapDirection>('buy');
  const [amount, setAmount] = useState('');

  const tokenIn = direction === 'buy' ? pool.quote : pool.base;
  const tokenOut = direction === 'buy' ? pool.base : pool.quote;
  const amountIn = Number.parseFloat(amount) || 0;
  const quote = quoteSwap(pool, direction, amountIn);

  const showToast = useToast(state => state.show);

  const swap = () => {
    showToast(
      `Swapped ${formatTokenAmount(amountIn)} ${tokenIn} for ${formatTokenAmount(quote.amountOut)} ${tokenOut}`
    );
    setAmount('');
  };

  const flip = () => {
    setDirection(current => (current === 'buy' ? 'sell' : 'buy'));
    setAmount('');
  };

  const rows = [
    { label: 'Min received', value: `${formatTokenAmount(quote.minReceived)} ${tokenOut}` },
    { label: 'Fee', value: formatCompactUsd(quote.feeUsd) },
    {
      label: 'Price impact',
      value: `${quote.priceImpactPct.toFixed(2)}%`,
      warn: quote.priceImpactPct > 3,
    },
    { label: 'Slippage', value: `${SLIPPAGE_PCT}%` },
  ];

  return (
    <form className="flex flex-col gap-3" onSubmit={event => event.preventDefault()} noValidate>
      <AmountField
        token={`You pay · ${tokenIn}`}
        value={amount}
        usdPerToken={direction === 'buy' ? 1 : pool.priceUsd}
        enabled
        onChange={setAmount}
      />
      <button
        type="button"
        onClick={flip}
        aria-label={`Switch to ${direction === 'buy' ? 'sell' : 'buy'} ${pool.base}`}
        className="t-label mx-auto inline-flex min-h-11 items-center gap-2 rounded-[2px] border border-line px-4 text-muted transition-colors hover:border-fg hover:text-fg"
      >
        <ArrowUpDown aria-hidden="true" className="size-3.5" strokeWidth={2} />
        Flip
      </button>
      <div className="rounded-[2px] border border-line p-3">
        <span className="t-label text-muted">You receive · {tokenOut}</span>
        <output className="mt-1 block font-mono text-xl tabular-nums">
          {amountIn > 0 ? formatTokenAmount(quote.amountOut) : '0.00'}
        </output>
      </div>

      <dl className="grid gap-1.5">
        {rows.map(row => (
          <div key={row.label} className="t-label flex justify-between">
            <dt className="text-muted">{row.label}</dt>
            <dd className={cn(row.warn ? 'text-warn' : 'text-fg')}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <TxButton
        label={`${direction === 'buy' ? 'Buy' : 'Sell'} ${pool.base}`}
        error={amountIn > 0 ? null : 'Enter an amount'}
        onConfirmed={swap}
      />
    </form>
  );
}
