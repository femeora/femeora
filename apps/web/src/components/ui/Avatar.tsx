import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

const sizes: Record<Size, string> = {
  sm: 'size-7 text-[0.625rem]',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
};

interface AvatarProps {
  initials: string;
  size?: Size;
  /** Highlighted ring for the signed-in user. */
  self?: boolean;
  className?: string;
}

/** Initials avatar. Stands in for the X profile image until the profile service serves it. */
export function Avatar({ initials, size = 'md', self = false, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-mono',
        self ? 'bg-signal text-on-signal' : 'bg-fg/10 text-fg',
        sizes[size],
        className
      )}
    >
      {initials}
    </span>
  );
}
