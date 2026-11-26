'use client';

import { ApiNotificationListSchema, ApiNotificationReadSchema, type ApiNotification } from '@fomeora/types';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Bell, Close } from '@/components/ui/icons';
import { useSession } from '@/features/session/store';
import { browserApiRequest } from '@/lib/api/client';
import { openApiEventStream } from '@/lib/api/realtime';
import { useApiResource } from '@/lib/api/useApiResource';

function timeAgo(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return 'now';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function notificationCopy(notification: ApiNotification): string {
  const actor = notification.actor ? `@${notification.actor.handle}` : 'A Femeora user';
  if (notification.type === 'follow') return `${actor} followed you`;
  if (notification.type === 'tail') return `${actor} tailed your callout`;
  if (notification.type === 'callout_new') return `${actor} posted a new callout`;
  if (notification.type === 'position_out_of_range') return 'Your callout position moved out of range';
  if (notification.type === 'position_in_range') return 'Your callout position moved back in range';
  if (notification.type === 'launch_graduated') {
    const symbol = typeof notification.payload.symbol === 'string' ? notification.payload.symbol : 'A launch you hold';
    return `${symbol} graduated into a Femeora pool`;
  }
  if (notification.type === 'callout_closed') return `${actor} exited a position you tailed`;
  if (notification.type === 'callout_rebalanced') return `${actor} moved a tailed position into a new range`;
  if (notification.type === 'callout_trimmed') {
    const removalBps = typeof notification.payload.removalBps === 'number'
      ? notification.payload.removalBps
      : null;
    return removalBps === null
      ? `${actor} reduced a position you tailed`
      : `${actor} reduced a position you tailed by ${Math.round(removalBps / 100)}%`;
  }
  return 'New Femeora activity';
}

function notificationHref(notification: ApiNotification): string {
  if (notification.entityType === 'callout' && notification.entityId) return `/c/${notification.entityId}`;
  if (notification.entityType === 'launch' && notification.entityId) return `/t/${notification.entityId}`;
  return '/feed';
}

export function NotificationBell() {
  const user = useSession(state => state.user);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data, mutate } = useApiResource(
    user ? '/v1/notifications?limit=25' : null,
    ApiNotificationListSchema,
    { refreshInterval: open ? 15_000 : 60_000 },
  );
  const notifications = data?.data ?? [];
  const unread = notifications.filter(notification => notification.readAt === null).length;

  useEffect(() => {
    if (!user) return undefined;
    return openApiEventStream('/v1/notifications/stream', {
      onMessage: message => {
        if (message.topic === 'notification.new') void mutate();
      },
    });
  }, [mutate, user]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  if (!user) return null;

  const markRead = async (notification: ApiNotification) => {
    if (notification.readAt !== null) return;
    await browserApiRequest(`/v1/notifications/${notification.id}/read`, ApiNotificationReadSchema, { method: 'POST' });
    await mutate(current => current ? {
      ...current,
      data: current.data.map(item => item.id === notification.id
        ? { ...item, readAt: new Date().toISOString() }
        : item),
    } : current, { revalidate: false });
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        className="relative grid size-10 place-items-center text-muted transition-colors hover:text-fg"
      >
        <Bell aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-signal px-1 font-mono text-[0.6rem] leading-none text-bg">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <section className="glass-raised absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[2px] border border-line" aria-label="Notifications">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="t-label text-muted">Activity</p>
              <h2 className="text-base font-medium">Notifications</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="grid size-9 place-items-center text-muted hover:text-fg">
              <Close aria-hidden="true" className="size-4" />
            </button>
          </header>
          <div className="max-h-[28rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-sm text-muted">No activity yet. Tail and follow callouts to receive updates here.</div>
            ) : notifications.map(notification => (
              <Link
                key={notification.id}
                href={notificationHref(notification)}
                onClick={() => { setOpen(false); void markRead(notification); }}
                className="flex gap-3 border-b border-line px-4 py-3 transition-colors hover:bg-fg/[0.04]"
              >
                <Avatar seed={notification.actor?.handle ?? notification.id} src={notification.actor?.avatarUrl} alt="" size="sm" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block text-fg">{notificationCopy(notification)}</span>
                  <span className="t-label mt-1 block text-faint">{timeAgo(notification.createdAt)}</span>
                </span>
                {notification.readAt === null ? <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-signal" /> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
