
import { site } from '@/content/landing';
import { cn } from '@/lib/cn';

import { RobinhoodLogo } from './icons';

interface ChainBadgeProps {
  network?: 'testnet' | 'mainnet';
  className?: string;
}

/** Robinhood mark + chain name, the single way the network is shown across the product. */
export function ChainBadge({ network, className }: ChainBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <RobinhoodLogo className="size-3.5 shrink-0 text-fg" />
      {site.chain}
      {network ? (
        <span className={cn('uppercase', network === 'testnet' ? 'text-signal' : 'text-up')}>
          · {network}
        </span>
      ) : null}
    </span>
  );
}
