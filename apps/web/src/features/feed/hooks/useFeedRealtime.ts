'use client';

import { useCallback, useEffect, useState } from 'react';

import { openApiEventStream } from '@/lib/api/realtime';

export function useFeedRealtime(refresh: () => Promise<unknown>) {
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  useEffect(() => openApiEventStream('/v1/feed/stream', {
    onMessage: message => {
      if (message.topic === 'callout.new' && message.aggregateId) {
        setPendingIds(current => current.includes(message.aggregateId!) ? current : [message.aggregateId!, ...current]);
        return;
      }
      if (message.topic === 'callout.update' || message.topic === 'callout.stats') void refresh();
    },
    onError: error => setStreamError(error.message),
  }), [refresh]);
  const release = useCallback(async () => {
    await refresh();
    setPendingIds([]);
    setStreamError(null);
  }, [refresh]);
  return { pendingCount: pendingIds.length, streamError, release };
}
