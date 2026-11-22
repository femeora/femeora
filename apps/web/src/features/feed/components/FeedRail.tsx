import Link from 'next/link';

import { ArrowRight } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

import { topCallers, trendingPools } from '../model/feed';

/** Desktop right rail: pools by callout count and the day's top callers. */
export function FeedRail() {
  return (
    <aside aria-label="Trending" className="hidden flex-col gap-8 py-6 pr-gutter xl:flex">
      <section>
        <h2 className="t-label mb-3 text-muted">Trending by callouts</h2>
        <ol className="border-t border-line">
          {trendingPools.map((pool, index) => (
            <li key={pool.pair}>
              <Link
                href="/pools"
                className="flex min-h-12 items-center gap-3 border-b border-line transition-colors hover:text-signal"
              >
                <span className="t-label w-5 text-faint">{index + 1}</span>
                <span className="flex-1">{pool.pair}</span>
                <span className="t-label text-muted">{pool.callouts24h}</span>
                <span
                  className={cn(
                    't-label w-14 text-right',
                    pool.change.startsWith('-') ? 'text-down' : 'text-up'
                  )}
                >
                  {pool.change}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="t-label mb-3 text-muted">Top callers 24h</h2>
        <ol className="border-t border-line">
          {topCallers.map((caller, index) => (
            <li
              key={caller.handle}
              className="flex min-h-12 items-center gap-3 border-b border-line"
            >
              <span className="t-label w-5 text-faint">{index + 1}</span>
              <span className="flex-1">{caller.handle}</span>
              <span className="t-label text-up">+{caller.earned}</span>
              <span className="t-label w-10 text-right text-muted">{caller.inRange}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/leaderboard"
          className="t-label mt-3 inline-flex min-h-11 items-center gap-1.5 hover:text-signal"
        >
          Full leaderboard <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
        </Link>
      </section>

      <p className="t-label text-faint">
        Tailing copies a range, not a result. LP positions can lose value.
      </p>
    </aside>
  );
}
