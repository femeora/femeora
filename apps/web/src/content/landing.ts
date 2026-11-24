/** Public product copy. Do not use yield guarantees or present test fixtures as live data. */

export interface NavLink {
  label: string;
  href: string;
}

export interface ReadoutCell {
  key: string;
  value: string;
  detail?: string;
  /** Prefix the value with the Robinhood mark. */
  chainMark?: boolean;
}

export interface SystemNode {
  layer: 'Client' | 'On-chain' | 'Indexing layer' | 'Delivery layer';
  title: string;
  detail: string;
}

export interface LoopStep {
  title: string;
  detail: string;
  tone: 'fg' | 'signal' | 'up';
}

export type SignalId = 'quick-exit' | 'opposite-side' | 'dev' | 'fresh-wallet' | 'range-honesty';

export interface IntegritySignal {
  id: SignalId;
  name: string;
  rule: string;
  badge: string;
  tone: 'down' | 'faint' | 'up';
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
  x: { handle: 'femeoraApp', href: 'https://x.com/femeoraApp' },
} as const;

export const navLinks: readonly NavLink[] = [
  { label: 'App', href: '/#app' },
  { label: 'Callouts', href: '/#callouts' },
  { label: 'Tail', href: '/#tail' },
  { label: 'Integrity', href: '/#integrity' },
  { label: 'Safety', href: '/#safety' },
];

export const hero = {
  readout: [
    { key: 'Network', value: 'Robinhood Chain', detail: 'Active network', chainMark: true },
    { key: 'Pools', value: 'DLMM · DAMM', detail: 'Spot · Curve · Bid-Ask' },
  ] satisfies readonly ReadoutCell[],
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
  body: 'The pool page carries indexed candles, liquidity bins, canonical callouts and the Create Position panel in one place. Empty market data stays empty instead of being replaced with a demo market.',
  cta: { label: 'Open the terminal', href: '/pools' },
  systemTitle: 'How a callout moves through the system',
  system: [
    {
      layer: 'Client',
      title: 'You',
      detail: 'Sign in with X for identity, link a wallet with one EIP-191 signature',
    },
    {
      layer: 'On-chain',
      title: 'DLMM v2',
      detail: 'PositionManagerV2 mints the range with a callout tag',
    },
    {
      layer: 'Indexing layer',
      title: 'Canonical Indexer',
      detail: 'Reads verified on-chain events to bind tags, fees and time in range; never holds user funds',
    },
    {
      layer: 'Delivery layer',
      title: 'Realtime API',
      detail: 'Delivers indexed feed data and transaction quotes over SSE; never signs or holds user funds',
    },
    {
      layer: 'Client',
      title: 'Feed',
      detail: 'The callout card goes live for everyone, ready to tail',
    },
  ] satisfies readonly SystemNode[],
} as const;

export const callouts = {
  cue: 'Cue 02',
  label: 'The callout',
  title: 'Every number is read from chain.',
  more: { label: 'All callouts', href: '/feed' },
  facts: [
    {
      title: 'Bound to a position',
      detail:
        'A callout becomes canonical only after the indexer matches its one-time tag to an on-chain position owned by the linked wallet.',
    },
    {
      title: 'Measured continuously',
      detail:
        'Range state, earned quote value, position updates and anti-shill signals come from canonical indexed events.',
    },
    {
      title: 'Copied with consent',
      detail:
        'Tail prepares the same range or shape, but the tailer reviews amounts and signs every approval and position transaction.',
    },
  ],
} as const;

export const loop = {
  cue: 'Cue 03',
  label: 'Tail',
  title: 'From seeing a range to taking it, in one tap.',
  steps: [
    { title: 'Sign in with X', detail: 'Identity only', tone: 'fg' },
    { title: 'Link wallet', detail: 'EIP-191 · up to 3', tone: 'fg' },
    { title: 'Open position', detail: 'DLMM v2 · one tx', tone: 'signal' },
    { title: 'Post callout', detail: 'Your words · 280 chars', tone: 'signal' },
    { title: 'Tail', detail: 'Same range or same shape now', tone: 'up' },
  ] satisfies readonly LoopStep[],
  body: 'X gives us identity: handle, avatar and verified badge. We never post to X. Open a position with Post as callout on, write your play, and it goes live when the tx confirms. Tailers copy the exact bins, or the same shape re-anchored to the active bin, and always sign their own tx.',
  news: 'Position state and feed updates are delivered from the canonical indexer through the API.',
  disclaimer: 'Tailing copies a range, not a result. LP positions can lose value.',
  more: { label: 'Open the feed', href: '/feed' },
} as const;

export const marquee: readonly { label: string; ours?: boolean }[] = [
  { label: 'Spot' },
  { label: 'Curve' },
  { label: 'Bid-Ask' },
  { label: 'Buy the dip', ours: true },
  { label: 'Single-side quote' },
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
  footnote: 'All badges are computed server-side from chain data. Users cannot hide them.',
  signals: [
    quickExitSignal,
    {
      id: 'opposite-side',
      name: 'Opposite side',
      rule: 'Caller holds single-side token liquidity above price while calling single-side quote, or the reverse.',
      badge: 'Also selling above',
      tone: 'down',
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
      { label: 'Testnet guide', href: '/testnet-guide' },
    ],
  },
  {
    title: 'On this page',
    items: [
      { label: 'Callouts', href: '/#callouts' },
      { label: 'Tail', href: '/#tail' },
      { label: 'Integrity', href: '/#integrity' },
      { label: 'Safety', href: '/#safety' },
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
