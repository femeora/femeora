'use client';

import { ApiSwapPreparationSchema, ApiSwapQuoteSchema, type ApiSwapQuote } from '@fomeora/types';
import { useState } from 'react';
import { formatUnits } from 'viem';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { ArrowUpDown } from '@/components/ui/icons';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';

import { executePreparedSwap } from '../model/executeSwap';
import type { Pool } from '../model/pool';
import type { SwapDirection } from '../model/swap';

import { AmountField } from './AmountField';
import { TxButton } from './TxButton';

const SLIPPAGE_BPS = 50;
const MAXIMUM_BIN_CROSSINGS = 32;

// Explicit states keep quote, approval, swap and receipt failures visible to the user.
// eslint-disable-next-line complexity
export function SwapForm({ pool }: { pool: Pool }) {
  const [direction, setDirection] = useState<SwapDirection>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<ApiSwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const { account, config } = useWallet();

  const tokenIn = direction === 'buy' ? pool.quote : pool.base;
  const tokenOut = direction === 'buy' ? pool.base : pool.quote;
  const tokenInAddress = direction === 'buy' ? pool.quoteAddress : pool.baseAddress;
  const tokenInDecimals = tokenInAddress.toLowerCase() === pool.tokenX.toLowerCase()
    ? pool.tokenXDecimals
    : pool.tokenYDecimals;
  const amountIn = Number.parseFloat(amount) || 0;

  const requestBody = () => ({
    tokenIn: tokenInAddress,
    amountIn: amount,
    slippageBps: SLIPPAGE_BPS,
    maximumBinCrossings: MAXIMUM_BIN_CROSSINGS,
  });

  const requestQuote = async () => {
    if (amountIn <= 0) return;
    setQuoting(true);
    setQuoteError(null);
    setTransactionHash(null);
    try {
      const next = await browserApiRequest(
        `/v1/pools/${pool.address}/swap-quote`,
        ApiSwapQuoteSchema,
        { method: 'POST', body: requestBody() },
      );
      setQuote(next);
    } catch (error) {
      setQuote(null);
      setQuoteError(friendlyErrorMessage(error instanceof Error ? error.message : 'QUOTE_FAILED'));
    } finally {
      setQuoting(false);
    }
  };

  const executeSwap = async () => {
    if (!account || !quote) throw new Error('WALLET_OR_QUOTE_REQUIRED');
    const prepare = () => browserApiRequest(
      `/v1/pools/${pool.address}/swap-prepare`,
      ApiSwapPreparationSchema,
      { method: 'POST', body: { ...requestBody(), walletAddress: account } },
    );
    const preparation = await prepare();
    const hash = await executePreparedSwap({
      account,
      preparation,
      refreshPreparation: prepare,
    });
    setTransactionHash(hash);
    setQuote(null);
    setAmount('');
    return hash;
  };

  const updateAmount = (value: string) => {
    setAmount(value);
    setQuote(null);
    setQuoteError(null);
    setTransactionHash(null);
  };
  const flip = () => {
    setDirection(current => current === 'buy' ? 'sell' : 'buy');
    updateAmount('');
  };

  const rows = quote ? [
    { label: 'Expected output', value: `${quote.amountOut} ${tokenOut}` },
    { label: 'Minimum received', value: `${quote.minimumAmountOut} ${tokenOut}` },
    {
      label: `Fee ${tokenIn}`,
      value: tokenInDecimals === null
        ? 'Unavailable'
        : `${formatUnits(BigInt(quote.totalFeeRaw), tokenInDecimals)} ${tokenIn}`,
    },
    { label: 'Bins crossed', value: String(quote.binCrossings) },
    { label: 'Slippage limit', value: `${quote.slippageBps / 100}%` },
  ] : [];

  return (
    <form className="flex flex-col gap-3" onSubmit={event => event.preventDefault()} noValidate>
      <AmountField
        token={`You pay · ${tokenIn}`}
        tokenAddress={tokenInAddress}
        value={amount}
        usdPerToken={direction === 'buy' ? 1 : pool.priceUsd}
        enabled
        onChange={updateAmount}
      />
      <button
        type="button"
        onClick={flip}
        aria-label={`Switch to ${direction === 'buy' ? 'sell' : 'buy'} ${pool.base}`}
        className="glass-control t-label mx-auto inline-flex min-h-11 items-center gap-2 rounded-[2px] px-4 text-muted hover:text-fg"
      >
        <ArrowUpDown aria-hidden="true" className="size-3.5" strokeWidth={2} /> Flip
      </button>
      <div className="glass rounded-[2px] p-3">
        <span className="t-label text-muted">You receive · {tokenOut}</span>
        <output className="mt-1 block break-all font-mono text-xl tabular-nums">
          {quote?.amountOut ?? 'Request a live quote'}
        </output>
      </div>

      {rows.length > 0 ? (
        <dl className="grid gap-1.5">
          {rows.map(row => (
            <div key={row.label} className="t-label flex justify-between gap-4">
              <dt className="text-muted">{row.label}</dt>
              <dd className={cn('break-all text-right text-fg')}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <Button type="button" block onClick={() => void requestQuote()} disabled={amountIn <= 0 || quoting}>
        {quoting ? 'Reading canonical liquidity…' : 'Review live quote'}
      </Button>
      <p role="alert" className="t-label min-h-4 text-down">{quoteError}</p>
      <TxButton
        label={`${direction === 'buy' ? 'Buy' : 'Sell'} ${pool.base}`}
        error={amountIn <= 0 ? 'Enter an amount' : quote ? null : 'Request a live quote'}
        onExecute={executeSwap}
      />
      {transactionHash && config ? (
        <a
          href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${transactionHash}`}
          target="_blank"
          rel="noreferrer"
          className="t-label break-all text-signal hover:underline"
        >
          View confirmed transaction {transactionHash}
        </a>
      ) : null}
    </form>
  );
}
