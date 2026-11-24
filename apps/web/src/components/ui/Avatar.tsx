import { avatarSpec, BAR_COUNT } from '@/lib/avatar';
import { cn } from '@/lib/cn';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<Size, string> = {
  xs: 'size-5',
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
  xl: 'size-12',
};

interface AvatarProps {
  /** Stable identity to draw from, usually the X handle. */
  seed: string;
  /** Canonical X profile image. The generated avatar remains the fallback. */
  src?: string | null | undefined;
  alt?: string;
  size?: Size;
  /** Metal ring for the signed-in user. */
  self?: boolean;
  className?: string;
}

const VIEW = 32;
const BAR_WIDTH = 2.4;
const GAP = 1.2;
const LEFT = (VIEW - (BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * GAP)) / 2;
const FLOOR = 24;
const MAX_BAR = 15;

/**
 * X profile image with a deterministic seven-bar fallback when X has no image.
 */
export function Avatar({ seed, src = null, alt = '', size = 'md', self = false, className }: AvatarProps) {
  const { bars, accent, background, barTone } = avatarSpec(seed);
  const frame = cn(
    'inline-flex aspect-square shrink-0 overflow-hidden rounded-full bg-panel-2 align-middle',
    self ? 'ring-2 ring-signal ring-offset-2 ring-offset-bg' : 'ring-1 ring-fg/15',
    sizes[size],
    className
  );

  if (src) {
    return (
      <span className={frame}>
        {/* X profile media is remote and intentionally rendered without optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} referrerPolicy="no-referrer" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden="true"
      className={frame}
    >
      <circle cx={VIEW / 2} cy={VIEW / 2} r={VIEW / 2} fill={`rgb(${background})`} />
      {bars.map((height, index) => {
        const barHeight = height * MAX_BAR;
        return (
          <rect
            key={index}
            x={LEFT + index * (BAR_WIDTH + GAP)}
            y={FLOOR - barHeight}
            width={BAR_WIDTH}
            height={barHeight}
            rx={0.8}
            fill={index === accent ? 'rgb(var(--metal-hi))' : `rgb(${barTone})`}
          />
        );
      })}
    </svg>
  );
}
