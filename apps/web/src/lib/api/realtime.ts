'use client';

import { ApiRealtimeEventSchema, type ApiRealtimeEvent } from '@fomeora/types';

export type ApiRealtimeMessage = ApiRealtimeEvent & {
  id: string;
  topic: string;
};

export type ApiEventStreamOptions = {
  onMessage: (message: ApiRealtimeMessage) => void;
  onError?: (error: Error) => void;
};

/** Opens an authenticated, same-origin SSE stream and returns its cleanup function. */
export function openApiEventStream(path: string, options: ApiEventStreamOptions): () => void {
  if (!path.startsWith('/v1/') || !path.endsWith('/stream')) {
    throw new Error('INVALID_API_STREAM_PATH');
  }

  const source = new EventSource(`/api${path}`, { withCredentials: true });
  const topics = [
    'callout.new', 'callout.update', 'callout.stats', 'pool.swap', 'pool.cap', 'pool.reference',
    'position.created', 'position.increased', 'position.decreased', 'position.closed', 'position.transferred',
    'launchpad.new', 'launchpad.update', 'launch.new', 'launch.progress', 'launch.revenue', 'launch.graduated',
    'notification.new',
  ];

  const handle = (event: Event) => {
    const message = event as MessageEvent<string>;
    try {
      const payload: unknown = JSON.parse(message.data);
      const parsed = ApiRealtimeEventSchema.safeParse(payload);
      if (!parsed.success) throw new Error('INVALID_REALTIME_EVENT');
      options.onMessage({ ...parsed.data, id: message.lastEventId, topic: message.type });
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('INVALID_REALTIME_EVENT'));
    }
  };

  for (const topic of topics) source.addEventListener(topic, handle);
  source.addEventListener('error', () => options.onError?.(new Error('REALTIME_STREAM_ERROR')));

  return () => {
    for (const topic of topics) source.removeEventListener(topic, handle);
    source.close();
  };
}
