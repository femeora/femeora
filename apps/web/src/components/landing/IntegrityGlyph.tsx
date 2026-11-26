import type { SignalId } from '@/content/landing';

/**
 * One small chart per anti-shill signal, drawn in strokes that trace in when the
 * card reveals (`.glyph-draw` in globals.css). Red marks the losing behaviour,
 * green the honest one, everything else stays monochrome.
 */
export function IntegrityGlyph({ id }: { id: SignalId }) {
  return (
    <svg
      viewBox="0 0 240 64"
      className="h-16 w-full"
      aria-hidden="true"
      fill="none"
      strokeWidth="1.5"
    >
      <line x1="0" y1="63.5" x2="240" y2="63.5" stroke="currentColor" strokeOpacity="0.12" />
      {GLYPHS[id]}
    </svg>
  );
}

const ticks = Array.from({ length: 12 }, (_, index) => index * 20 + 10);

const GLYPHS: Record<SignalId, JSX.Element> = {
  // Position size: posted, then more than half pulled minutes later.
  'quick-exit': (
    <>
      <line
        x1="40"
        y1="4"
        x2="40"
        y2="62"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeDasharray="2 3"
      />
      <path
        className="glyph-draw"
        pathLength={1}
        d="M0 18 H40 L46 18 H96 L104 46 H240"
        stroke="rgb(var(--down))"
      />
      <circle cx="40" cy="18" r="3" fill="currentColor" />
      <circle className="glyph-pop" cx="100" cy="32" r="3" fill="rgb(var(--down))" />
    </>
  ),
  // Single-side quote below price while selling token above it.
  'opposite-side': (
    <>
      <line
        x1="0"
        y1="32"
        x2="240"
        y2="32"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeDasharray="4 4"
      />
      {ticks.map((x, index) => (
        <rect
          key={x}
          className="glyph-grow"
          x={x - 6}
          width="12"
          y={index < 6 ? 36 : 32 - (index - 5) * 4}
          height={index < 6 ? 6 + index * 3 : (index - 5) * 4}
          fill={index < 6 ? 'currentColor' : 'rgb(var(--down))'}
          fillOpacity={index < 6 ? 0.35 : 0.8}
          style={{ animationDelay: `${index * 40}ms` }}
        />
      ))}
    </>
  ),
  // Caller wallet linked to the token deployer.
  dev: (
    <>
      <path
        className="glyph-draw"
        pathLength={1}
        d="M34 32 C90 4 150 60 206 32"
        stroke="currentColor"
        strokeOpacity="0.6"
      />
      <circle cx="30" cy="32" r="10" stroke="currentColor" strokeOpacity="0.7" />
      <rect x="198" y="22" width="20" height="20" stroke="currentColor" strokeOpacity="0.7" />
      <circle cx="30" cy="32" r="3" fill="currentColor" />
      <rect x="205" y="29" width="6" height="6" fill="currentColor" />
    </>
  ),
  // Wallet age in days against the seven-day line.
  'fresh-wallet': (
    <>
      {Array.from({ length: 7 }, (_, index) => (
        <rect
          key={index}
          className="glyph-grow"
          x={8 + index * 33}
          y="14"
          width="26"
          height="36"
          stroke="currentColor"
          strokeOpacity="0.25"
          fill="currentColor"
          fillOpacity={index < 3 ? 0.55 : 0.04}
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </>
  ),
  // Time in range since the post, segment by segment.
  'range-honesty': (
    <>
      {[
        [0, 70, true],
        [74, 20, false],
        [98, 92, true],
        [194, 10, false],
        [208, 32, true],
      ].map(([x, width, inRange], index) => (
        <rect
          key={index}
          className="glyph-grow"
          x={x as number}
          y="26"
          width={width as number}
          height="12"
          fill={inRange ? 'rgb(var(--up))' : 'currentColor'}
          fillOpacity={inRange ? 0.75 : 0.15}
          style={{ animationDelay: `${index * 70}ms` }}
        />
      ))}
    </>
  ),
};
