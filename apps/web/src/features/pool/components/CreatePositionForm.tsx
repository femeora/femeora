'use client';

import { useToast } from '@/components/feedback/toast';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { usePortfolio } from '@/features/portfolio/store';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

import type { PositionDraftState } from '../hooks/usePositionDraft';
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
  const addPosition = usePortfolio(state => state.addPosition);
  const showToast = useToast(state => state.show);

  const openPosition = () => {
    addPosition({
      pool: `${pool.base} / ${pool.quote}`,
      shape: draft.shape,
      minPct: draft.minPct,
      maxPct: draft.maxPct,
      side: sideLabel(side, pool),
      bins,
      depositUsd,
      callout: draft.postAsCallout ? { caption: draft.caption, showSize: draft.showSize } : null,
    });
    showToast(draft.postAsCallout ? 'Position opened and callout posted' : 'Position opened');
    dispatch({ type: 'submitted' });
  };

  const at = (pct: number) => formatUnit(toUnit(applyPct(pool.priceUsd, pct), unit, pool), unit);

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
                dispatch({
                  type: 'apply',
                  shape: preset.shape,
                  minPct: preset.minPct,
                  maxPct: preset.maxPct,
                  presetId: preset.id,
                })
              }
              className={cn(
                'flex min-h-11 flex-col items-start gap-1 rounded-[2px] border p-2 text-left transition-colors duration-fast',
                draft.presetId === preset.id
                  ? 'border-signal'
                  : 'border-line hover:border-line-strong'
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
        onChange={shape => dispatch({ type: 'shape', shape })}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <RangeField
          label="Min"
          pct={draft.minPct}
          valueLabel={at(draft.minPct)}
          sliderMin={-90}
          sliderMax={100}
          onChange={value => dispatch({ type: 'range', bound: 'minPct', value })}
        />
        <RangeField
          label="Max"
          pct={draft.maxPct}
          valueLabel={at(draft.maxPct)}
          sliderMin={-90}
          sliderMax={200}
          onChange={value => dispatch({ type: 'range', bound: 'maxPct', value })}
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
          value={draft.quoteAmount}
          usdPerToken={1}
          enabled={needs.quote}
          onChange={value => dispatch({ type: 'amount', token: 'quoteAmount', value })}
        />
        <AmountField
          token={pool.base}
          value={draft.baseAmount}
          usdPerToken={pool.priceUsd}
          enabled={needs.base}
          onChange={value => dispatch({ type: 'amount', token: 'baseAmount', value })}
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

      <TxButton
        label={draft.postAsCallout ? 'Create position & post callout' : 'Create position'}
        error={error}
        onConfirmed={openPosition}
      />
      <p className="t-label text-faint">
        Approvals are for exact amounts. LP positions can lose value.
      </p>
    </form>
  );
}
