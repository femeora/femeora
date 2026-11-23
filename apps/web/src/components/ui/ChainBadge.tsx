import { site } from '@/content/landing';
import { cn } from '@/lib/cn';

import { RobinhoodLogo } from './icons';

interface ChainBadgeProps {
  /** Appends "· Mainnet" after the chain name. */
  showNetwork?: boolean;
  className?: string;
}

/** Robinhood mark + chain name, the single way the network is shown across the product. */
export function ChainBadge({ showNetwork = false, className }: ChainBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <RobinhoodLogo className="size-3.5 shrink-0 text-fg" />
      {site.chain}
      {showNetwork ? <span className="text-faint">· Mainnet</span> : null}
    </span>
  );
}
