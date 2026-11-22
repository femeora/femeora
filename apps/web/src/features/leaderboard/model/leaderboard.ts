/** Leaderboard rows. Maps to `GET /v1/leaderboard?window=&sort=` (brief 11). */
export type LeaderboardWindow = '24h' | '7d' | '30d' | 'all';
export type LeaderboardSort = 'score' | 'earned' | 'tailers' | 'inRange';

export interface LeaderRow {
  handle: string;
  initials: string;
  verified: boolean;
  callouts: number;
  earnedUsd: number;
  tailers: number;
  inRangePct: number;
  quickExits: number;
  score: number;
}

export const WINDOWS: readonly { value: LeaderboardWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

export const SORTS: readonly { value: LeaderboardSort; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'earned', label: 'Earned' },
  { value: 'tailers', label: 'Tailers' },
  { value: 'inRange', label: 'In range' },
];

const base: readonly LeaderRow[] = [
  {
    handle: '@binbaron',
    initials: 'BB',
    verified: true,
    callouts: 14,
    earnedUsd: 1904,
    tailers: 212,
    inRangePct: 96,
    quickExits: 0,
    score: 0.91,
  },
  {
    handle: '@lpwizard',
    initials: 'LW',
    verified: true,
    callouts: 22,
    earnedUsd: 812,
    tailers: 340,
    inRangePct: 88,
    quickExits: 0,
    score: 0.84,
  },
  {
    handle: '@quietquote',
    initials: 'QQ',
    verified: false,
    callouts: 6,
    earnedUsd: 301,
    tailers: 41,
    inRangePct: 91,
    quickExits: 0,
    score: 0.62,
  },
  {
    handle: '@ceilingcat',
    initials: 'CC',
    verified: false,
    callouts: 11,
    earnedUsd: 640,
    tailers: 96,
    inRangePct: 47,
    quickExits: 1,
    score: 0.44,
  },
  {
    handle: '@slowcurve',
    initials: 'SC',
    verified: true,
    callouts: 4,
    earnedUsd: 118,
    tailers: 12,
    inRangePct: 99,
    quickExits: 0,
    score: 0.39,
  },
  {
    handle: '@fastexit',
    initials: 'FX',
    verified: false,
    callouts: 9,
    earnedUsd: 77,
    tailers: 30,
    inRangePct: 34,
    quickExits: 4,
    score: 0,
  },
];

const WINDOW_FACTOR: Record<LeaderboardWindow, number> = {
  '24h': 1,
  '7d': 5.2,
  '30d': 19,
  all: 41,
};

const sortValue: Record<LeaderboardSort, (row: LeaderRow) => number> = {
  score: row => row.score,
  earned: row => row.earnedUsd,
  tailers: row => row.tailers,
  inRange: row => row.inRangePct,
};

export function leaderboard(period: LeaderboardWindow, sort: LeaderboardSort): LeaderRow[] {
  const factor = WINDOW_FACTOR[period];
  return base
    .map(row => ({
      ...row,
      callouts: Math.round(row.callouts * factor),
      earnedUsd: row.earnedUsd * factor,
      tailers: Math.round(row.tailers * factor),
    }))
    .sort((a, b) => sortValue[sort](b) - sortValue[sort](a));
}
