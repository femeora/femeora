'use client';

import { CalloutCaptionSchema } from '@fomeora/types';
import { useEffect, useMemo, useReducer } from 'react';

import type { BinShape } from '@/types/callout';

import { fromContractBinBounds, toContractBinBounds } from '../model/orientation';
import type { Pool } from '../model/pool';
import {
  binCount,
  DEFAULT_POSITION_PRESET_ID,
  fitRangeToBinLimit,
  PRESETS,
  rangeError,
  rangeSide,
  type Preset,
  type RangeSide,
} from '../model/range';

export const CAPTION_MAX = 280;
/** Counter turns amber here (brief 5.4.1). */
export const CAPTION_WARN = 260;

export interface PositionDraft {
  shape: BinShape;
  minPct: number;
  maxPct: number;
  lowerBin: number;
  upperBin: number;
  presetId: Preset['id'] | null;
  quoteAmount: string;
  baseAmount: string;
  postAsCallout: boolean;
  caption: string;
  showSize: boolean;
}

type Action =
  | { type: 'shape'; shape: BinShape }
  | { type: 'range'; minPct: number; maxPct: number; lowerBin: number; upperBin: number }
  | {
      type: 'apply';
      shape: BinShape;
      minPct: number;
      maxPct: number;
      lowerBin: number;
      upperBin: number;
      presetId: Preset['id'] | null;
    }
  | { type: 'amount'; token: 'quoteAmount' | 'baseAmount'; value: string }
  | { type: 'postAsCallout'; value: boolean }
  | { type: 'caption'; value: string }
  | { type: 'showSize'; value: boolean }
  | { type: 'rebase'; minPct: number; maxPct: number }
  | { type: 'submitted' };

const defaultPreset = PRESETS.find(preset => preset.id === DEFAULT_POSITION_PRESET_ID);

const initialDraft: PositionDraft = {
  shape: defaultPreset?.shape ?? 'bid-ask',
  minPct: defaultPreset?.minPct ?? -20,
  maxPct: defaultPreset?.maxPct ?? 20,
  lowerBin: 0,
  upperBin: 0,
  presetId: defaultPreset?.id ?? null,
  quoteAmount: '',
  baseAmount: '',
  postAsCallout: false,
  caption: '',
  showSize: true,
};

export function positionDraftReducer(draft: PositionDraft, action: Action): PositionDraft {
  switch (action.type) {
    case 'shape':
      // A preset owns the range/strategy anchor; shape remains independently editable.
      return { ...draft, shape: action.shape };
    case 'range':
      // MIN/MAX customize the selected strategy; they do not deselect it.
      return {
        ...draft,
        minPct: action.minPct,
        maxPct: action.maxPct,
        lowerBin: action.lowerBin,
        upperBin: action.upperBin,
      };
    case 'apply': {
      // Presets and tails both replace the whole range in one step.
      const { shape, minPct, maxPct, lowerBin, upperBin, presetId } = action;
      return { ...draft, shape, minPct, maxPct, lowerBin, upperBin, presetId };
    }
    case 'amount':
      return { ...draft, [action.token]: action.value };
    case 'postAsCallout':
      return { ...draft, postAsCallout: action.value };
    case 'caption':
      // Typing past the limit is blocked rather than reported (brief 5.4.1).
      return { ...draft, caption: action.value.slice(0, CAPTION_MAX) };
    case 'showSize':
      return { ...draft, showSize: action.value };
    case 'rebase':
      return { ...draft, minPct: action.minPct, maxPct: action.maxPct };
    case 'submitted':
      // Keep the range so the user can open the same position again.
      return { ...draft, quoteAmount: '', baseAmount: '', caption: '' };
  }
}

const toAmount = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function requiredTokens(side: RangeSide): { quote: boolean; base: boolean } {
  return { quote: side !== 'base', base: side !== 'quote' };
}

/**
 * Form state for Create Position plus everything derived from it: side, bins,
 * deposit value and the first blocking error. Pure derivations live in `model/`.
 */
export function usePositionDraft(pool: Pool) {
  const fittedInitialRange = fitRangeToBinLimit(initialDraft, pool.binStepBps);
  const initialBins =
    pool.type === 'DLMM'
      ? toContractBinBounds(
          pool.baseIsTokenX,
          pool.activeBinId,
          fittedInitialRange,
          pool.binStepBps
        )
      : { lowerBin: 0, upperBin: 0 };
  const [draft, dispatch] = useReducer(positionDraftReducer, {
    ...initialDraft,
    ...fittedInitialRange,
    ...initialBins,
  });

  useEffect(() => {
    if (pool.type !== 'DLMM') return;
    const visible = fromContractBinBounds(
      pool.baseIsTokenX,
      pool.activeBinId,
      draft,
      pool.binStepBps
    );
    dispatch({ type: 'rebase', ...visible });
  }, [
    draft.lowerBin,
    draft.upperBin,
    pool.activeBinId,
    pool.baseIsTokenX,
    pool.binStepBps,
    pool.type,
  ]);

  const derived = useMemo(() => {
    const side = rangeSide(draft);
    const needs = pool.type === 'DAMM' ? { quote: true, base: true } : requiredTokens(side);
    const quote = needs.quote ? toAmount(draft.quoteAmount) : 0;
    const base = needs.base ? toAmount(draft.baseAmount) : 0;
    const depositUsd = quote + base * pool.priceUsd;
    const hasRequiredAmounts =
      pool.type === 'DAMM'
        ? quote > 0 && base > 0
        : (!needs.quote || quote > 0) && (!needs.base || base > 0);

    const caption = CalloutCaptionSchema.safeParse(draft.caption);
    const captionError =
      draft.postAsCallout && !caption.success
        ? (caption.error.issues[0]?.message ?? 'Invalid caption')
        : null;

    const error =
      (pool.type === 'DAMM' ? null : rangeError(draft, pool.binStepBps)) ??
      (!hasRequiredAmounts
        ? pool.type === 'DAMM' || (needs.quote && needs.base)
          ? 'Enter both token amounts'
          : `Enter ${needs.quote ? pool.quote : pool.base} amount`
        : null) ??
      captionError;

    return {
      side,
      needs,
      bins:
        pool.type === 'DLMM'
          ? draft.upperBin - draft.lowerBin + 1
          : binCount(draft, pool.binStepBps),
      depositUsd,
      captionError,
      error,
    };
  }, [draft, pool]);

  return { draft, dispatch, ...derived };
}

export type PositionDraftState = ReturnType<typeof usePositionDraft>;
