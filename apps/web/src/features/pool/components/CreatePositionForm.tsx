'use client';

import {
  ApiCalloutIntentSchema,
  ApiPositionPreparationSchema,
  ApiPositionQuoteSchema,
  type ApiPositionQuote,
} from '@fomeora/types';
import { useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

import type { PositionDraftState } from '../hooks/usePositionDraft';
import { executePreparedPosition } from '../model/executePosition';
import { formatCompactUsd, formatUnit, toUnit, type ValueUnit } from '../model/format';
import type { Pool } from '../model/pool';
import { applyPct, PRESETS, pricePosition, sideLabel } from '../model/range';

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
  const showToast = useToast(state => state.show);

  const at = (pct: number) => formatUnit(toUnit(applyPct(pool.priceUsd, pct), unit, pool), unit);
  const invalidateQuote = () => {
    setQuote(null);
    setQuoteError(null);
    setTransactionHash(null);
  };
  const requestBody = () => ({
    shape: draft.shape,
    minPct: draft.minPct,
    maxPct: draft.maxPct,
    amountX: needs.base ? draft.baseAmount : '0',
    amountY: needs.quote ? draft.quoteAmount : '0',
    slippageBps: 50,
  });
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
      setQuoteError(cause instanceof Error ? cause.message : 'POSITION_QUOTE_FAILED');
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
    showToast(draft.postAsCallout ? 'Position confirmed; callout will appear after indexing' : 'Position confirmed on-chain');
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={event => event.preventDefault()} noValidate>
      <div className="flex flex-col gap-2">
        <span className="t-label text-muted">Presets</span>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={draft.presetId === preset.id}
              onClick={() =>
                (invalidateQuote(), dispatch({
                  type: 'apply',
                  shape: preset.shape,
                  minPct: preset.minPct,
                  maxPct: preset.maxPct,
                  presetId: preset.id,
                }))
              }
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
          onChange={value => { invalidateQuote(); dispatch({ type: 'range', bound: 'minPct', value }); }}
        />
        <RangeField
          label="Max"
          pct={draft.maxPct}
          valueLabel={at(draft.maxPct)}
          sliderMin={-90}
          sliderMax={200}
          onChange={value => { invalidateQuote(); dispatch({ type: 'range', bound: 'maxPct', value }); }}
        />
      </div>

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

      <div className="grid gap-2">
        <AmountField
          token={pool.quote}
          tokenAddress={pool.tokenY}
          value={draft.quoteAmount}
          usdPerToken={1}
          enabled={needs.quote}
          onChange={value => { invalidateQuote(); dispatch({ type: 'amount', token: 'quoteAmount', value }); }}
        />
        <AmountField
          token={pool.base}
          tokenAddress={pool.tokenX}
          value={draft.baseAmount}
          usdPerToken={pool.priceUsd}
          enabled={needs.base}
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
        onEnabledChange={value => dispatch({ type: 'postAsCallout', value })}
        onCaptionChange={value => dispatch({ type: 'caption', value })}
        onShowSizeChange={value => dispatch({ type: 'showSize', value })}
      />

      {quote ? (
        <dl className="glass grid gap-1.5 rounded-[2px] p-3">
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">Canonical bins</dt><dd>{quote.bins[0]} to {quote.bins.at(-1)} · {quote.bins.length}</dd></div>
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">Deposit</dt><dd>{quote.amountX} {pool.base} + {quote.amountY} {pool.quote}</dd></div>
          <div className="t-label flex justify-between gap-4"><dt className="text-muted">Slippage limit</dt><dd>{quote.slippageBps / 100}%</dd></div>
        </dl>
      ) : null}
      <Button type="button" block onClick={() => void requestQuote()} disabled={Boolean(error) || quoting}>
        {quoting ? 'Reading canonical bins…' : 'Review live position'}
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
