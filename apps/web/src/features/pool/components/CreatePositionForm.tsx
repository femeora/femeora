'use client';

import {
  ApiCalloutIntentSchema,
  ApiPositionPreparationSchema,
  ApiPositionQuoteSchema,
  type ApiPositionQuote,
} from '@fomeora/types';
import { useEffect, useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useSession } from '@/features/session/store';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

import type { PositionDraftState } from '../hooks/usePositionDraft';
import { executePreparedPosition } from '../model/executePosition';
import { formatCompactUsd, formatUnit, toUnit, type ValueUnit } from '../model/format';
import { toContractAmounts, toContractRange } from '../model/orientation';
import type { Pool } from '../model/pool';
import { applyPct, fitRangeToBinLimit, PRESETS, pricePosition, sideLabel, snapRangeBound } from '../model/range';

import { AmountField } from './AmountField';
import { BinsPreview } from './BinsPreview';
import { CalloutComposer } from './CalloutComposer';
import { RangeField } from './RangeField';
import { TxButton } from './TxButton';

const shapeOptions = (['spot', 'curve', 'bid-ask'] as const satisfies readonly BinShape[]).map(
  value => ({
    value,
    label: SHAPE_LABEL[value],
  })
);

interface CreatePositionFormProps {
  pool: Pool;
  unit: ValueUnit;
  position: PositionDraftState;
}

/** Create Position panel (brief 8.3): shape, presets, range, amounts, callout, CTA. */
export function CreatePositionForm({ pool, unit, position }: CreatePositionFormProps) {
  const { draft, dispatch, side, needs, bins, depositUsd, captionError, error } = position;
  const [quote, setQuote] = useState<ApiPositionQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [transactionStage, setTransactionStage] = useState('Preparing transaction…');
  const { account, config } = useWallet();
  const { user, openSignIn } = useSession();
  const damm = pool.type === 'DAMM';

  const at = (pct: number) => formatUnit(toUnit(applyPct(pool.priceUsd, pct), unit, pool), unit);
  const invalidateQuote = () => {
    setQuote(null);
    setQuoteError(null);
    setTransactionHash(null);
  };
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    setTransactionHash(null);
  }, [draft.minPct, draft.maxPct, draft.shape]);
  const updateRange = (bound: 'minPct' | 'maxPct', value: number) => {
    invalidateQuote();
    dispatch({
      type: 'range',
      bound,
      value: snapRangeBound(draft, bound, value, pool.binStepBps),
    });
  };
  const requestBody = () => {
    const amounts = toContractAmounts(
      pool.baseIsTokenX,
      damm || needs.base ? draft.baseAmount : '0',
      damm || needs.quote ? draft.quoteAmount : '0',
    );
    const range = toContractRange(pool.baseIsTokenX, draft);
    return {
      shape: draft.shape,
      minPct: range.minPct,
      maxPct: range.maxPct,
      ...amounts,
      slippageBps: 50,
    };
  };
  const setPostAsCallout = (value: boolean) => {
    if (value && (!user || !user.wallet)) {
      openSignIn();
      return;
    }
    dispatch({ type: 'postAsCallout', value });
  };
  const requestQuote = async () => {
    if (error) return;
    setQuoting(true);
    setQuoteError(null);
    setTransactionHash(null);
    try {
      setQuote(await browserApiRequest(`/v1/pools/${pool.address}/position-quote`, ApiPositionQuoteSchema, {
        method: 'POST', body: requestBody(),
      }));
    } catch (cause) {
      setQuote(null);
      const raw = cause instanceof Error ? cause.message : 'POSITION_QUOTE_FAILED';
      const depositToken = needs.quote && !needs.base ? pool.quote : needs.base && !needs.quote ? pool.base : `${pool.base} and ${pool.quote}`;
      setQuoteError(raw.toUpperCase().includes('DEPOSIT_TOO_SMALL')
        ? `The ${depositToken} amount is too small to distribute across ${bins} bins. Narrow the range or increase the amount, then review again.`
        : friendlyErrorMessage(raw));
    } finally {
      setQuoting(false);
    }
  };
  const executePosition = async () => {
    if (!account || !config || !quote) throw new Error('WALLET_OR_QUOTE_REQUIRED');
    setTransactionStage(draft.postAsCallout ? 'Creating callout intent…' : 'Preparing approvals…');
    const intent = draft.postAsCallout ? await browserApiRequest('/v1/callouts/intent', ApiCalloutIntentSchema, {
      method: 'POST',
      body: { chainId: config.chainId, pool: pool.address, caption: draft.caption, showSize: draft.showSize },
    }) : null;
    const prepare = () => browserApiRequest(
      `/v1/pools/${pool.address}/position-prepare`,
      ApiPositionPreparationSchema,
      { method: 'POST', body: { ...requestBody(), walletAddress: account, intentId: intent?.intentId ?? null } },
    );
    setTransactionStage('Preparing approvals…');
    const hash = await executePreparedPosition({
      account,
      preparation: await prepare(),
      refreshPreparation: prepare,
      onStage: setTransactionStage,
    });
    setTransactionHash(hash);
    setQuote(null);
    dispatch({ type: 'submitted' });
    window.dispatchEvent(
      new CustomEvent('fomeora:position-confirmed', {
        detail: {
          pool: pool.address,
          transactionHash: hash,
          expectsCallout: draft.postAsCallout,
        },
      })
    );
    return hash;
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={event => event.preventDefault()} noValidate>
      {!damm ? <><div className="flex flex-col gap-2">
        <span className="t-label text-muted">Presets</span>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={draft.presetId === preset.id}
              onClick={() => {
                const fitted = fitRangeToBinLimit(preset, pool.binStepBps);
                invalidateQuote();
                dispatch({
                  type: 'apply',
                  shape: preset.shape,
                  minPct: fitted.minPct,
                  maxPct: fitted.maxPct,
                  presetId: preset.id,
                });
              }}
              className={cn(
                'glass-control flex min-h-11 flex-col items-start gap-1 rounded-[2px] p-2 text-left',
                draft.presetId === preset.id && 'border-signal bg-signal/10 hover:border-signal'
              )}
            >
              <span className="text-[0.8125rem] font-medium">{preset.label}</span>
              <span className="t-label text-[0.625rem] text-muted">{preset.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <SegmentedControl
        label="Shape"
        size="md"
        className="w-full"
        options={shapeOptions}
        value={draft.shape}
        onChange={shape => { invalidateQuote(); dispatch({ type: 'shape', shape }); }}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <RangeField
          label="Min"
          pct={draft.minPct}
          valueLabel={at(draft.minPct)}
          sliderMin={-90}
          sliderMax={100}
          onChange={value => updateRange('minPct', value)}
        />
        <RangeField
          label="Max"
          pct={draft.maxPct}
          valueLabel={at(draft.maxPct)}
          sliderMin={-90}
          sliderMax={200}
          onChange={value => updateRange('maxPct', value)}
        />
      </div>

      <p className="t-label text-faint">Type an exact percentage or drag the MIN and MAX handles directly on the chart.</p>

      <p className="t-label flex items-center justify-between text-muted">
        <span className="text-fg">{sideLabel(side, pool)}</span>
        <span>
          {SHAPE_LABEL[draft.shape]} · {bins} bins
        </span>
      </p>

      <BinsPreview
        shape={draft.shape}
        bins={bins}
        pricePosition={pricePosition(draft)}
        priceLabel={`${unit === 'mcap' ? 'MC' : 'price'} ${at(0)}`}
      />
      </> : <div className="glass rounded-[2px] p-3 text-sm text-muted">DAMM initial liquidity requires both tokens. The deposited ratio establishes the pool&apos;s starting price.</div>}

      <div className="grid gap-2">
        <AmountField
          token={pool.quote}
          tokenAddress={pool.quoteAddress}
          tokenName={pool.quoteName}
          tokenLogoUrl={pool.quoteLogoUrl}
          value={draft.quoteAmount}
          usdPerToken={1}
          enabled={damm || needs.quote}
          onChange={value => { invalidateQuote(); dispatch({ type: 'amount', token: 'quoteAmount', value }); }}
        />
        <AmountField
          token={pool.base}
          tokenAddress={pool.baseAddress}
          tokenName={pool.baseName}
          tokenLogoUrl={pool.baseLogoUrl}
          value={draft.baseAmount}
          usdPerToken={pool.priceUsd}
          enabled={damm || needs.base}
          onChange={value => { invalidateQuote(); dispatch({ type: 'amount', token: 'baseAmount', value }); }}
        />
        <p className="t-label flex justify-between text-muted">
          <span>Deposit value</span>
          <span className="text-fg">{formatCompactUsd(depositUsd)}</span>
        </p>
      </div>

      <CalloutComposer
        enabled={draft.postAsCallout}
        caption={draft.caption}
        showSize={draft.showSize}
        error={captionError}
        onEnabledChange={setPostAsCallout}
        onCaptionChange={value => dispatch({ type: 'caption', value })}
        onShowSizeChange={value => dispatch({ type: 'showSize', value })}
      />

      {quote ? (
        <dl className="glass grid gap-1.5 rounded-[2px] p-3">
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">{damm ? 'Liquidity model' : 'Canonical bins'}</dt><dd>{damm ? 'DAMM · both tokens' : `${quote.bins[0]} to ${quote.bins.at(-1)} · ${quote.bins.length}`}</dd></div>
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">Deposit</dt><dd>{pool.baseIsTokenX ? quote.amountX : quote.amountY} {pool.base} + {pool.baseIsTokenX ? quote.amountY : quote.amountX} {pool.quote}</dd></div>
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">Slippage limit</dt><dd>{quote.slippageBps / 100}%</dd></div>
        </dl>
      ) : null}
      <p role="alert" className="t-label min-h-4 text-down">{error}</p>
      <Button type="button" block onClick={() => void requestQuote()} disabled={Boolean(error) || quoting}>
        {quoting ? (damm ? 'Reading pool state…' : 'Reading canonical bins…') : 'Review live position'}
      </Button>
      <p role="alert" className="t-label min-h-4 text-down">{quoteError}</p>
      <TxButton
        label={draft.postAsCallout ? 'Create position & post callout' : 'Create position'}
        error={error ?? (quote ? null : 'Review live position first')}
        onExecute={executePosition}
        pendingLabel={transactionStage}
      />
      {transactionHash && config ? (
        <a href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${transactionHash}`} target="_blank" rel="noreferrer" className="t-label break-all text-signal hover:underline">
          View confirmed transaction {transactionHash}
        </a>
      ) : null}
      <p className="t-label text-faint">
        Approvals are for exact amounts. LP positions can lose value.
      </p>
    </form>
  );
}
