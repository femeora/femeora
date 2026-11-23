'use client';

import type { CSSProperties, ReactNode } from 'react';

import SpotlightCard from '@/components/react-bits/SpotlightCard/SpotlightCard';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
}

/** Design-token overrides applied inline so they win over the vendor stylesheet. */
const tokens = {
  padding: 0,
  borderRadius: 2,
  '--spotlight-card-surface': 'rgb(var(--fg) / 0.035)',
  '--spotlight-card-border': 'rgb(var(--fg) / 0.16)',
  '--spotlight-card-shadow': 'inset 0 1px 0 rgb(var(--fg) / 0.06)',
  backdropFilter: 'blur(18px) saturate(150%)',
  WebkitBackdropFilter: 'blur(18px) saturate(150%)',
} as CSSProperties;

/**
 * Card surface with a pointer-following spotlight and rim light (React Bits
 * SpotlightCard), retuned to the design tokens: panel surface, hairline border,
 * signal-colored light and the 2px radius used across the product.
 */
export function GlowCard({ children, className }: GlowCardProps) {
  return (
    <SpotlightCard
      spotlightColor="rgb(var(--signal))"
      intensity={0.35}
      borderGlow={0.9}
      spotlightSize={420}
      grain={0}
      className={className}
      style={tokens}
    >
      {children}
    </SpotlightCard>
  );
}
