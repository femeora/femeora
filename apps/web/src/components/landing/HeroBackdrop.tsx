'use client';

import GhostFibers from '@/components/react-bits/GhostFibers/GhostFibers';

/**
 * Full-bleed hero background: React Bits GhostFibers (WebGL), with a scrim so the
 * headline and controls keep their contrast. GhostFibers honours reduced motion itself.
 * The glow is the metal `--signal` token (200 205 212) as hex, since the canvas needs one.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <GhostFibers
        glowColor="#c8cdd4"
        layers={3}
        twist={1.2}
        threads={72}
        fiberStyle="dots"
        depthOfField={0.85}
        hoverEffect="focus"
        intro
        mouseInteraction
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/60 via-transparent to-transparent" />
    </div>
  );
}
