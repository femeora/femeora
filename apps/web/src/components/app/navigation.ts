import {
  BookOpen,
  CandlestickChart,
  LayoutList,
  Rocket,
  Trophy,
  Wallet,
  type Icon,
} from '@/components/ui/icons';

export interface AppNavItem {
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel: string;
  href: string;
  icon: Icon;
}

/** App navigation (brief 3): top tabs on desktop, bottom bar on mobile. */
export const appNav: readonly AppNavItem[] = [
  { label: 'Feed', shortLabel: 'Feed', href: '/feed', icon: LayoutList },
  { label: 'Pools', shortLabel: 'Pools', href: '/pools', icon: CandlestickChart },
  { label: 'Launch', shortLabel: 'Launch', href: '/launchpads', icon: Rocket },
  { label: 'Leaderboard', shortLabel: 'Ranks', href: '/leaderboard', icon: Trophy },
  { label: 'Portfolio', shortLabel: 'Wallet', href: '/portfolio', icon: Wallet },
  { label: 'Docs', shortLabel: 'Docs', href: '/docs', icon: BookOpen },
];
