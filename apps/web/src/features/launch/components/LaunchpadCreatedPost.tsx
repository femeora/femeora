'use client';

import type { ApiLaunchpad, ApiPoolAsset } from '@fomeora/types';
import Link from 'next/link';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import {
  BadgeCheck,
  ArrowRight,
  Eye,
  Heart,
  MessageCircle,
  MessageSquareQuote,
  Repeat2,
  Share2,
} from '@/components/ui/icons';

function elapsedLabel(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

const actionClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[2px] px-1.5 text-muted transition-colors hover:text-fg';

export function LaunchpadCreatedPost({
  launchpad,
  quoteAsset,
}: {
  launchpad: ApiLaunchpad;
  quoteAsset?: ApiPoolAsset | undefined;
}) {
  const showToast = useToast(state => state.show);
  const profile = launchpad.ownerProfile;
  const handle = (profile?.handle ?? launchpad.xHandle).replace(/^@/, '');
  const name = profile?.name ?? launchpad.name;
  const href = `/lp/${encodeURIComponent(launchpad.slug)}`;
  const tradeFee = (launchpad.tradeFeePips / 10_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });

  const share = async () => {
    const url = `${window.location.origin}${href}`;
    const text = `${name} created a new launchpad on Femeora.`;
    const intent = new URL('https://x.com/intent/tweet');
    intent.searchParams.set('text', text);
    intent.searchParams.set('url', url);
    const popup = window.open(
      intent.toString(),
      '_blank',
      'noopener,noreferrer,width=720,height=640'
    );
    if (!popup) {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      showToast('The public launchpad link was copied.', {
        title: 'Launchpad link copied',
        userFacing: true,
      });
    }
  };

  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-line px-gutter py-5">
      <Avatar
        seed={handle || launchpad.owner}
        src={profile?.avatarUrl ?? launchpad.logoUrl}
        alt={`${name} avatar`}
        size="lg"
      />
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-1.5 text-[0.9375rem]">
          <span className="font-medium">{name}</span>
          {profile?.xVerified ? (
            <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
          ) : null}
          <span className="t-label text-faint">
            @{handle} · {elapsedLabel(launchpad.createdAt)}
          </span>
        </header>

        <p className="mt-1">Created a new launchpad</p>

        <Link
          href={href}
          className="glass group mt-3 block overflow-hidden rounded-[2px] transition-colors hover:border-line-strong"
        >
          <div className="relative aspect-[3/1] min-h-28 overflow-hidden border-b border-line bg-panel-2">
            {launchpad.bannerUrl ? (
              <img
                src={launchpad.bannerUrl}
                alt={`${launchpad.name} launchpad banner`}
                referrerPolicy="no-referrer"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
              />
            ) : (
              <div
                aria-hidden="true"
                className="size-full bg-[radial-gradient(circle_at_50%_120%,rgb(var(--signal)/0.18),transparent_55%),linear-gradient(135deg,rgb(var(--panel-2)),rgb(var(--bg)))]"
              />
            )}
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-panel-2">
              {launchpad.logoUrl ? (
                <img
                  src={launchpad.logoUrl}
                  alt={`${launchpad.name} logo`}
                  referrerPolicy="no-referrer"
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <span className="font-mono text-sm">{launchpad.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium">{launchpad.name}</h3>
              <p className="t-label mt-1 truncate text-muted">
                {launchpad.protection.enabled ? 'Protected launch' : 'Open launch'} ·{' '}
                {quoteAsset?.symbol ?? 'Quote token'}
              </p>
              <p className="t-label mt-1 text-faint">{tradeFee}% trading fee</p>
            </div>
            <span className="t-label inline-flex shrink-0 items-center gap-1 text-fg">
              Open <ArrowRight aria-hidden="true" className="size-3.5" />
            </span>
          </div>
        </Link>

        <div className="t-label mt-2 flex flex-wrap items-center gap-0.5 text-muted sm:gap-1">
          <button type="button" onClick={() => void share()} className={actionClass} aria-label="Share launchpad to X">
            <Share2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
          <Link href={href} className={actionClass} aria-label="Quote launchpad">
            <MessageSquareQuote aria-hidden="true" className="size-4" strokeWidth={1.75} />0
          </Link>
          <Link href={href} className={actionClass} aria-label="Like launchpad">
            <Heart aria-hidden="true" className="size-4" strokeWidth={1.75} />0
          </Link>
          <Link href={href} className={actionClass} aria-label="Repost launchpad">
            <Repeat2 aria-hidden="true" className="size-4" strokeWidth={1.75} />0
          </Link>
          <Link href={href} className={actionClass} aria-label="Reply to launchpad">
            <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />0
          </Link>
          <span className="inline-flex items-center gap-1.5 px-1.5">
            <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />0
          </span>
        </div>
      </div>
    </article>
  );
}
