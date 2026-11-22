import type { Metadata } from 'next';

import { LeaderboardScreen } from '@/features/leaderboard/components/LeaderboardScreen';

export const metadata: Metadata = { title: 'Leaderboard · Fomeora' };

export default function LeaderboardPage() {
  return <LeaderboardScreen />;
}
