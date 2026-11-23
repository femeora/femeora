/** Leaderboard rows. Maps to `GET /v1/leaderboard?window=&sort=` (brief 11). */
export type LeaderboardWindow = '24h' | '7d' | '30d' | 'all';
export type LeaderboardSort = 'score' | 'earned' | 'tailers' | 'inRange';

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
