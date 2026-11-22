/**
 * Market activity for the terminal strips and bottom tabs.
 * Each export maps to an API resource in brief 11 (stats, trades, lps, callouts).
 */

export type ActivityWindow = '5m' | '1h' | '6h' | '1d';

export interface ActivityStats {
  volumeUsd: number;
  buys: number;
  buysUsd: number;
  sells: number;
  sellsUsd: number;
}

export const ACTIVITY_WINDOWS: readonly ActivityWindow[] = ['5m', '1h', '6h', '1d'];

export const activityByWindow: Record<ActivityWindow, ActivityStats> = {
  '5m': { volumeUsd: 18_400, buys: 23, buysUsd: 11_200, sells: 14, sellsUsd: 7_200 },
  '1h': { volumeUsd: 164_000, buys: 212, buysUsd: 92_500, sells: 171, sellsUsd: 71_500 },
  '6h': { volumeUsd: 702_000, buys: 940, buysUsd: 381_000, sells: 812, sellsUsd: 321_000 },
  '1d': {
    volumeUsd: 2_310_000,
    buys: 3_104,
    buysUsd: 1_240_000,
    sells: 2_870,
    sellsUsd: 1_070_000,
  },
};

/** Social strip (brief 8.1). */
export const socialStats = {
  callouts24h: 38,
  callersInRange: 27,
  /** Share of callout USD that is single-side quote below price. */
  buySidePct: 64,
  topCaller: '@lpwizard',
} as const;

export interface Trade {
  id: string;
  side: 'buy' | 'sell';
  amountUsd: number;
  amountBase: number;
  trader: string;
  age: string;
}

export const recentTrades: readonly Trade[] = [
  { id: 't1', side: 'buy', amountUsd: 412.5, amountBase: 84_310, trader: '0x8f…21ac', age: '12s' },
  { id: 't2', side: 'sell', amountUsd: 120.0, amountBase: 24_530, trader: '0x1b…9e04', age: '41s' },
  {
    id: 't3',
    side: 'buy',
    amountUsd: 2_240.0,
    amountBase: 457_800,
    trader: '0xa3…77d2',
    age: '1m',
  },
  { id: 't4', side: 'buy', amountUsd: 86.2, amountBase: 17_620, trader: '0x5c…0b13', age: '2m' },
  {
    id: 't5',
    side: 'sell',
    amountUsd: 1_030.4,
    amountBase: 210_590,
    trader: '0xe0…4fa8',
    age: '4m',
  },
];

export interface TopLp {
  rank: number;
  handle: string;
  valueUsd: number;
  earnedUsd: number;
  inRangePct: number;
}

export const topLps: readonly TopLp[] = [
  { rank: 1, handle: '@binbaron', valueUsd: 48_200, earnedUsd: 1_904, inRangePct: 96 },
  { rank: 2, handle: '@lpwizard', valueUsd: 21_700, earnedUsd: 812, inRangePct: 88 },
  { rank: 3, handle: '@ceilingcat', valueUsd: 19_300, earnedUsd: 640, inRangePct: 47 },
  { rank: 4, handle: '@quietquote', valueUsd: 9_850, earnedUsd: 301, inRangePct: 91 },
];
