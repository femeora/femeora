/**
 * Fixed film-grain overlay generated from an SVG turbulence filter (no bitmap asset).
 * Static on small screens and under reduced motion.
 */
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed -inset-1/2 z-[80] opacity-[0.05] md:animate-grain"
      style={{ backgroundImage: NOISE, backgroundSize: '160px 160px' }}
    />
  );
}
