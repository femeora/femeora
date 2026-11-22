'use client';

import { CalloutCaptionSchema } from '@fomeora/types';
import { useMemo, useReducer } from 'react';

import type { BinShape } from '@/types/callout';

import type { Pool } from '../model/pool';
import {
  binCount,
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
  presetId: Preset['id'] | null;
  quoteAmount: string;
  baseAmount: string;
  postAsCallout: boolean;
  caption: string;
  showSize: boolean;
}

type Action =
  | { type: 'shape'; shape: BinShape }
  | { type: 'range'; bound: 'minPct' | 'maxPct'; value: number }
  | {
      type: 'apply';
      shape: BinShape;
      minPct: number;
      maxPct: number;
      presetId: Preset['id'] | null;
    }
  | { type: 'amount'; token: 'quoteAmount' | 'baseAmount'; value: string }
  | { type: 'postAsCallout'; value: boolean }
  | { type: 'caption'; value: string }
  | { type: 'showSize'; value: boolean }
  | { type: 'submitted' };

const [defaultPreset] = PRESETS;

const initialDraft: PositionDraft = {
  shape: defaultPreset?.shape ?? 'bid-ask',
  minPct: defaultPreset?.minPct ?? -35,
  maxPct: defaultPreset?.maxPct ?? -1,
  presetId: defaultPreset?.id ?? null,
  quoteAmount: '',
  baseAmount: '',
  postAsCallout: true,
  caption: '',
  showSize: true,
};

function reducer(draft: PositionDraft, action: Action): PositionDraft {
  switch (action.type) {
    case 'shape':
      return { ...draft, shape: action.shape, presetId: null };
    case 'range':
      return { ...draft, [action.bound]: action.value, presetId: null };
    case 'apply': {
      // Presets and tails both replace the whole range in one step.
      const { shape, minPct, maxPct, presetId } = action;
      return { ...draft, shape, minPct, maxPct, presetId };
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
  const [draft, dispatch] = useReducer(reducer, initialDraft);

  const derived = useMemo(() => {
    const side = rangeSide(draft);
    const needs = requiredTokens(side);
    const quote = needs.quote ? toAmount(draft.quoteAmount) : 0;
    const base = needs.base ? toAmount(draft.baseAmount) : 0;
    const depositUsd = quote + base * pool.priceUsd;

    const caption = CalloutCaptionSchema.safeParse(draft.caption);
    const captionError =
      draft.postAsCallout && !caption.success
        ? (caption.error.issues[0]?.message ?? 'Invalid caption')
        : null;

    const error =
      rangeError(draft, pool.binStepBps) ??
      (depositUsd <= 0 ? 'Enter an amount' : null) ??
      captionError;

    return {
      side,
      needs,
      bins: binCount(draft, pool.binStepBps),
      depositUsd,
      captionError,
      error,
    };
  }, [draft, pool]);

  return { draft, dispatch, ...derived };
}

export type PositionDraftState = ReturnType<typeof usePositionDraft>;
