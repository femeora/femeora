/**
 * Landing page copy, sourced from `docs/brief/femeora-dev-brie.md`.
 * Product rule (brief 13.4): no em dashes, no "guaranteed", "safe yield" or APR promises.
 * Copy describes the product as it runs in production.
 */

import type { SampleCallout } from '@/types/callout';

export interface NavLink {
  label: string;
  href: string;
}

export interface ReadoutCell {
  key: string;
  value: string;
  detail?: string;
}

export interface SystemNode {
  layer: 'Client' | 'On-chain' | 'Off-chain';
  title: string;
  detail: string;
}

export interface LoopStep {
  title: string;
  detail: string;
  tone: 'fg' | 'signal' | 'up' | 'warn';
}

export interface Stat {
  value: string;
  label: string;
}

export type SignalId = 'quick-exit' | 'opposite-side' | 'dev' | 'fresh-wallet' | 'range-honesty';

export interface IntegritySignal {
  id: SignalId;
  name: string;
  rule: string;
  badge: string;
  tone: 'down' | 'warn' | 'faint' | 'up';
}

export type MarkerTone = 'up' | 'faint' | 'down' | 'warn';

/** A callout avatar on the pool chart (brief 8.2). */
export interface ChartMarker {
  /** Position along the series, 0..1. */
  at: number;
  tone: MarkerTone;
  /** Caller initials standing in for the avatar. */
  label: string;
  /** Callout range as price fractions 0..1 (0 = bottom of the chart). */
  range: readonly [number, number];
  signals: readonly SignalId[];
}

export interface Safeguard {
  title: string;
  detail: string;
  scope: readonly string[];
}

export interface FooterColumn {
  title: string;
  items: readonly { label: string; href?: string }[];
}

export const site = {
  name: 'Fomeora',
  tagline: 'Every LP is a callout.',
  description:
    'DLMM and DAMM liquidity with a social feed where every LP position is a public, proof-backed callout.',
  /** Entry point into the app from the landing page (hero, header, CTA). */
  appCta: { label: 'Launch app', href: '/pools' },
  chain: 'Robinhood Chain',
} as const;

export const navLinks: readonly NavLink[] = [
  { label: 'App', href: '#app' },
  { label: 'Callouts', href: '#callouts' },
  { label: 'Tail', href: '#tail' },
  { label: 'Integrity', href: '#integrity' },
  { label: 'Safety', href: '#safety' },
];

export const hero = {
  readout: [
    { key: 'Network', value: 'Robinhood Chain', detail: 'Mainnet' },
    { key: 'Pools', value: 'DLMM · DAMM', detail: 'Spot · Curve · Bid-Ask' },
  ] satisfies readonly ReadoutCell[],
  note: 'The mark is a bin histogram. Twenty-four bins of a Bid-Ask range, replaying the active price as it walks.',
  titleLines: ['Every LP', 'is a callout.'],
  dek: 'DLMM and DAMM liquidity with a social feed. Open a position, post it as a callout, and let anyone tail the exact range in one tap.',
  primaryCta: { label: 'Launch app', href: '/pools' },
  secondaryCta: { label: 'Open the feed', href: '/feed' },
  foot: ['DLMM v2 · single-sided bins', 'Proof-backed callouts', 'X for login only'],
} as const;

export const statement = {
  title: 'LP strategies spread as screenshots. Here the strategy is the post.',
  body: 'Today ranges travel with no proof and no one-tap copy. In Fomeora a callout is attached to one real on-chain position owned by the poster, every number on the card is read from chain, and anyone can tail it instantly.',
} as const;

export const appPreview = {
  cue: 'Cue 01',
  label: 'The app',
  title: 'One terminal to open a range, post it and tail it.',
  body: 'The pool page carries the chart, the liquidity bins, every callout in the pool and the Create Position panel in one place. Below is the terminal as you will use it.',
  frameUrl: 'fomeora.app/pools',
  cta: { label: 'Open the terminal', href: '/pools' },
  systemTitle: 'How a callout moves through the system',
  system: [
    {
      layer: 'Client',
      title: 'You',
      detail: 'Sign in with X for identity, link a wallet with SIWE',
    },
    {
      layer: 'On-chain',
      title: 'DLMM v2',
      detail: 'PositionManagerV2 mints the range with a callout tag',
    },
    {
      layer: 'Off-chain',
      title: 'Indexer',
      detail: 'Binds the tag, tracks earned and the in-range clock',
    },
    {
      layer: 'Off-chain',
      title: 'API',
      detail: 'Feed, callouts and tail quotes, streamed over SSE',
    },
    {
      layer: 'Client',
      title: 'Feed',
      detail: 'The callout card goes live for everyone, ready to tail',
    },
  ] satisfies readonly SystemNode[],
} as const;

/** The callout used wherever a single example card is shown. */
export const featuredCallout: SampleCallout = {
  title: 'HOODIE · Bid-Ask below price',
  token: 'HOODIE',
  pool: 'DLMM',
  shape: 'bid-ask',
  side: 'Single-side USDG',
  range: ['$3.51M', '$7.02M MC'],
  bins: '36 bins',
  status: 'in-range',
  inRange: 'In range 82% of 3h',
  position: '$2.50K',
  earned: '+$41.20',
  tailers: 23,
  meta: ['DLMM', 'Single-side USDG', '36 bins'],
};

export const callouts = {
  cue: 'Cue 02',
  label: 'The callout',
  title: 'Every number is read from chain.',
  note: 'On the feed now · HOODIE / USDG',
  more: { label: 'All callouts', href: '/feed' },
  items: [
    featuredCallout,
    {
      title: 'Sell into strength',
      token: 'HOODIE',
      pool: 'DLMM',
      shape: 'bid-ask',
      side: 'Single-side HOODIE',
      range: ['+2%', '+80%'],
      bins: '48 bins',
      status: 'out-of-range',
      inRange: 'In range 41% of 9h',
      position: '$8.10K',
      earned: '+$96.40',
      tailers: 11,
      meta: ['DLMM', 'Single-side token', ['+2%', '+80%']],
    },
    {
      title: 'Fee farm · two-sided Curve',
      token: 'HOODIE',
      pool: 'DLMM',
      shape: 'curve',
      side: 'Two-sided',
      range: '±20% around price',
      bins: '40 bins',
      status: 'in-range',
      inRange: 'In range 97% of 1d',
      position: '$12.4K',
      earned: '+$212.80',
      tailers: 58,
      meta: ['DLMM', 'Two-sided', '±20%'],
    },
    {
      title: 'Spot across the range',
      token: 'HOODIE',
      pool: 'DLMM',
      shape: 'spot',
      side: 'Two-sided',
      range: ['$4.10M', '$8.00M MC'],
      bins: '30 bins',
      status: 'closed',
      inRange: 'Closed · held 3h 12m',
      position: 'Closed',
      earned: '+$412.00',
      tailers: 7,
      meta: ['DLMM', 'Rebalanced once', 'Closed'],
    },
    {
      title: 'Full range · fee decays',
      token: 'HOODIE',
      pool: 'DAMM',
      shape: 'spot',
      side: 'Two-sided',
      range: 'Full range',
      bins: 'Fee 1.00%, decaying',
      status: 'in-range',
      inRange: 'In range 100% of 6h',
      position: '$1.53K',
      earned: '+$18.75',
      tailers: 4,
      meta: ['DAMM', 'Full range', 'Fee scheduler'],
    },
  ] satisfies readonly SampleCallout[],
} as const;

export const chartMarkers: readonly ChartMarker[] = [
  { at: 0.1, tone: 'up', label: 'AK', range: [0.18, 0.42], signals: ['range-honesty'] },
  { at: 0.26, tone: 'down', label: 'MX', range: [0.3, 0.56], signals: ['quick-exit'] },
  { at: 0.42, tone: 'warn', label: 'RB', range: [0.22, 0.48], signals: ['opposite-side'] },
  { at: 0.56, tone: 'faint', label: 'DV', range: [0.55, 0.85], signals: ['dev'] },
  {
    at: 0.7,
    tone: 'up',
    label: 'LN',
    range: [0.36, 0.62],
    signals: ['fresh-wallet', 'range-honesty'],
  },
  { at: 0.86, tone: 'up', label: 'SY', range: [0.44, 0.74], signals: ['range-honesty'] },
];

export const band = {
  caption:
    'Chart callout layer · avatar markers at time posted and MC at post · ring shows range status',
} as const;

export const loop = {
  cue: 'Cue 03',
  label: 'Tail',
  title: 'From seeing a range to taking it, in one tap.',
  steps: [
    { title: 'Sign in with X', detail: 'Identity only', tone: 'fg' },
    { title: 'Link wallet', detail: 'SIWE · up to 3', tone: 'fg' },
    { title: 'Open position', detail: 'DLMM v2 · one tx', tone: 'signal' },
    { title: 'Post callout', detail: 'Your words · 280 chars', tone: 'warn' },
    { title: 'Tail', detail: 'Same range or same shape now', tone: 'up' },
  ] satisfies readonly LoopStep[],
  body: 'X gives us identity: handle, avatar and verified badge. We never post to X. Open a position with Post as callout on, write your play, and it goes live when the tx confirms. Tailers copy the exact bins, or the same shape re-anchored to the active bin, and always sign their own tx.',
  stats: [
    { value: '1 tx', label: 'For a 36-bin single-sided position on DLMM v2' },
    { value: '280', label: 'Caption characters, written by you, never generated' },
    { value: '5 s', label: 'From tx confirmed to every open feed' },
    { value: '0', label: 'X write scopes requested' },
  ] satisfies readonly Stat[],
  news: 'New · presets: Buy the dip, Sell into strength, Fee farm',
  disclaimer: 'Tailing copies a range, not a result. LP positions can lose value.',
  more: { label: 'Open the feed', href: '/feed' },
} as const;

export const marquee: readonly { label: string; ours?: boolean }[] = [
  { label: 'Spot' },
  { label: 'Curve' },
  { label: 'Bid-Ask' },
  { label: 'Buy the dip', ours: true },
  { label: 'Single-side USDG' },
  { label: 'Sell into strength', ours: true },
  { label: 'Two-sided' },
  { label: 'Fee farm', ours: true },
  { label: 'Full range' },
  { label: 'Tail', ours: true },
];

export const quickExitSignal: IntegritySignal = {
  id: 'quick-exit',
  name: 'Quick exit',
  rule: 'Caller removes 50% or more within 30 min of posting. Excluded from Best.',
  badge: 'Exited 14m after call',
  tone: 'down',
};

export const integrity = {
  cue: 'Cue 04',
  label: 'Integrity',
  title: 'Anti-shill is a feature, not an afterthought.',
  body: 'Feed cards show when a caller exits soon after posting, when they hold opposite-side liquidity, and how long their range actually stayed in range. Deleting a callout cannot hide a bad call.',
  hint: 'Hover or tap a signal to see it on the chart',
  footnote: 'All badges are computed server-side from chain data. Users cannot hide them.',
  signals: [
    quickExitSignal,
    {
      id: 'opposite-side',
      name: 'Opposite side',
      rule: 'Caller holds single-side token liquidity above price while calling single-side quote, or the reverse.',
      badge: 'Also selling above',
      tone: 'warn',
    },
    {
      id: 'dev',
      name: 'Dev or team',
      rule: 'Caller wallet is the token deployer or a top-10 holder.',
      badge: 'Dev · Top holder',
      tone: 'faint',
    },
    {
      id: 'fresh-wallet',
      name: 'Fresh wallet',
      rule: 'Linked wallet is younger than 7 days.',
      badge: 'New wallet',
      tone: 'faint',
    },
    {
      id: 'range-honesty',
      name: 'Range honesty',
      rule: 'In-range share since the post, always shown on the card.',
      badge: 'In range 82% of 3h',
      tone: 'up',
    },
  ] satisfies readonly IntegritySignal[],
} as const;

export const safety = {
  cue: 'Cue 05',
  label: 'Safety',
  title: 'Your keys, your range, your signature.',
  items: [
    {
      title: 'No admin key moves funds',
      detail: 'Treasury and upgrades sit behind a Safe and a timelock.',
      scope: ['Safe', 'Timelock', 'Per-pool TVL caps'],
    },
    {
      title: 'Exact approvals',
      detail: 'Every deposit approves the amount you enter, never unlimited.',
      scope: ['Exact amounts', 'Per transaction'],
    },
    {
      title: 'Tail never auto-executes',
      detail: 'Tailing prefills a range. You size it and sign your own tx.',
      scope: ['Same range', 'Same shape now', 'Your signature'],
    },
    {
      title: 'X is read only',
      detail: 'We read your handle, name and avatar. We cannot post, like or DM.',
      scope: ['users.read', 'No write scope'],
    },
    {
      title: 'Clean captions',
      detail: 'Links, wallet and contract addresses are blocked before a callout goes live.',
      scope: ['Anti-phishing', '280 characters'],
    },
  ] satisfies readonly Safeguard[],
  footnote: 'LP positions can lose value. Tailing copies a range, not a result.',
} as const;

export const cta = {
  title: 'Tail the range, not the result.',
  body: 'Browse and tail with a wallet. Posting, liking and replying need Sign in with X.',
  primary: { label: 'Launch app', href: '/pools' },
  secondary: { label: 'Open the feed', href: '/feed' },
} as const;

const footerColumns: readonly FooterColumn[] = [
  {
    title: 'Product',
    items: [
      { label: 'Feed', href: '/feed' },
      { label: 'Pools', href: '/pools' },
      { label: 'Leaderboard', href: '/leaderboard' },
      { label: 'Portfolio', href: '/portfolio' },
    ],
  },
  {
    title: 'On this page',
    items: [
      { label: 'Callouts', href: '#callouts' },
      { label: 'Tail', href: '#tail' },
      { label: 'Integrity', href: '#integrity' },
      { label: 'Safety', href: '#safety' },
    ],
  },
  {
    title: 'Engine',
    items: [
      { label: 'DLMM v2' },
      { label: 'PositionManagerV2' },
      { label: 'DAMM' },
      { label: 'DlmmLens' },
    ],
  },
  {
    title: 'Principles',
    items: [
      { label: 'Proof-backed callouts' },
      { label: 'X for login only' },
      { label: 'Tail never auto-executes' },
      { label: 'Exact approvals by default' },
    ],
  },
];

export const footer = {
  columns: footerColumns,
  legal: ['Fomeora', 'Built on Robinhood Chain', '2026'],
  disclaimer: 'No guaranteed yield. LP positions can lose value.',
} as const;
