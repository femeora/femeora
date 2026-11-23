import { prisma, type Prisma } from '@fomeora/database';
import { Client } from 'pg';

const CHANNEL = 'fomeora_outbox';
const RECONNECT_MAX_MS = 30_000;

export const OUTBOX_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_POLL_FALLBACK_MS = 2_000;
export const SSE_CONNECTIONS_PER_IP = 5;
export const SSE_BATCH_SIZE = 200;

export type RealtimeEvent = {
  id: bigint;
  topic: string;
  aggregateId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

export type EventFilter = {
  chainId: number;
  topics: string[];
  aggregateId?: string;
};

export function parseLastEventId(value: string | undefined): bigint | null {
  if (value === undefined || !/^[0-9]+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= 0n ? parsed : null;
}

export function formatSseEvent(event: RealtimeEvent): string {
  return `id: ${event.id.toString()}\nevent: ${event.topic}\ndata: ${JSON.stringify({
    aggregateId: event.aggregateId,
    createdAt: event.createdAt.toISOString(),
    payload: event.payload,
  })}\n\n`;
}

export class ConnectionLimiter {
  readonly #counts = new Map<string, number>();

  acquire(ip: string): boolean {
    const current = this.#counts.get(ip) ?? 0;
    if (current >= SSE_CONNECTIONS_PER_IP) return false;
    this.#counts.set(ip, current + 1);
    return true;
  }

  release(ip: string): void {
    const current = this.#counts.get(ip) ?? 0;
    if (current <= 1) this.#counts.delete(ip);
    else this.#counts.set(ip, current - 1);
  }
}

export class OutboxWakeup {
  readonly #databaseUrl: string;
  readonly #listeners = new Set<() => void>();
  #client: Client | null = null;
  #stopped = false;
  #reconnectDelay = 1_000;
  #reconnectTimer: NodeJS.Timeout | null = null;

  constructor(databaseUrl: string) {
    this.#databaseUrl = databaseUrl;
  }

  async start(): Promise<void> {
    await this.#connect();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    const client = this.#client;
    this.#client = null;
    if (client) await client.end().catch(() => undefined);
    this.#wakeAll();
  }

  wait(signal: AbortSignal, timeoutMs = SSE_POLL_FALLBACK_MS): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        this.#listeners.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.#listeners.add(finish);
      signal.addEventListener('abort', finish, { once: true });
    });
  }

  async #connect(): Promise<void> {
    if (this.#stopped) return;
    const client = new Client({ connectionString: this.#databaseUrl, application_name: 'fomeora-api-outbox-listener' });
    this.#client = client;
    client.on('notification', message => {
      if (message.channel === CHANNEL) this.#wakeAll();
    });
    client.on('error', () => this.#scheduleReconnect(client));
    client.on('end', () => this.#scheduleReconnect(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.#reconnectDelay = 1_000;
    } catch {
      this.#scheduleReconnect(client);
    }
  }

  #scheduleReconnect(client: Client): void {
    if (this.#stopped || this.#client !== client || this.#reconnectTimer) return;
    this.#client = null;
    void client.end().catch(() => undefined);
    const delay = this.#reconnectDelay;
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, RECONNECT_MAX_MS);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#connect();
    }, delay);
  }

  #wakeAll(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

export async function readOutboxEvents(afterId: bigint, filter: EventFilter): Promise<RealtimeEvent[]> {
  return prisma.outboxEvent.findMany({
    where: {
      id: { gt: afterId },
      chainId: filter.chainId,
      canonical: true,
      topic: { in: filter.topics },
      ...(filter.aggregateId ? { aggregateId: filter.aggregateId } : {}),
    },
    select: { id: true, topic: true, aggregateId: true, payload: true, createdAt: true },
    orderBy: { id: 'asc' },
    take: SSE_BATCH_SIZE,
  });
}

export async function pruneOutboxEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
  const result = await prisma.outboxEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
