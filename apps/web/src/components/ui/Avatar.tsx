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
 * Generative avatar: a seven-bar histogram in black, white and metal, derived from
 * the handle (see `lib/avatar.ts`). Stands in until X profile images are served.
 */
export function Avatar({ seed, size = 'md', self = false, className }: AvatarProps) {
  const { bars, accent, background, barTone } = avatarSpec(seed);

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden="true"
      className={cn(
        'shrink-0 rounded-full',
        self ? 'ring-2 ring-signal ring-offset-2 ring-offset-bg' : 'ring-1 ring-fg/15',
        sizes[size],
        className
      )}
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
