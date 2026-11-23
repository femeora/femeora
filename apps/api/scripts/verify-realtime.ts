import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createServer } = await import('../src/index.js');

const app = await createServer(environment);
const dedupKeys: string[] = [];

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
  controller: AbortController,
): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    while (!received.includes(expected)) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('VERIFY_STREAM_ENDED_EARLY');
      received += decoder.decode(chunk.value, { stream: true });
    }
    return received;
  } finally {
    clearTimeout(timeout);
  }
}

async function insertVerificationEvent(sequence: number) {
  const dedupKey = `verify:realtime:${randomUUID()}`;
  dedupKeys.push(dedupKey);
  return prisma.outboxEvent.create({
    data: {
      dedupKey,
      topic: 'callout.new',
      aggregateId: `verify-${sequence}`,
      chainId: environment.CHAIN_ID,
      payload: { verification: true, sequence },
    },
    select: { id: true },
  });
}

try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('VERIFY_SERVER_ADDRESS_MISSING');
  const url = `http://127.0.0.1:${address.port}/v1/feed/stream`;

  const liveController = new AbortController();
  const liveResponse = await fetch(url, { signal: liveController.signal });
  if (!liveResponse.body) throw new Error('VERIFY_STREAM_BODY_MISSING');
  const liveReader = liveResponse.body.getReader();
  await readUntil(liveReader, ': connected', liveController);
  await new Promise(resolve => setTimeout(resolve, 500));
  const first = await insertVerificationEvent(1);
  const notifyStartedAt = Date.now();
  const liveBody = await readUntil(liveReader, `id: ${first.id.toString()}`, liveController);
  const notifyLatencyMs = Date.now() - notifyStartedAt;
  await liveReader.cancel();
  liveController.abort();

  const missed = await insertVerificationEvent(2);
  const replayController = new AbortController();
  const replayResponse = await fetch(url, {
    headers: { 'Last-Event-ID': first.id.toString() },
    signal: replayController.signal,
  });
  if (!replayResponse.body) throw new Error('VERIFY_REPLAY_BODY_MISSING');
  const replayReader = replayResponse.body.getReader();
  const replayBody = await readUntil(replayReader, `id: ${missed.id.toString()}`, replayController);
  await replayReader.cancel();
  replayController.abort();

  const result = {
    notifyWakeup:
      liveResponse.status === 200 && liveBody.includes('event: callout.new') && notifyLatencyMs < 1_500,
    notifyLatencyUnderFallback: notifyLatencyMs < 1_500,
    replayAfterReconnect: replayResponse.status === 200 && replayBody.includes('event: callout.new'),
    lastEventIdAdvanced: missed.id > first.id,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('REALTIME_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'REALTIME_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (dedupKeys.length > 0) await prisma.outboxEvent.deleteMany({ where: { dedupKey: { in: dedupKeys } } });
  await app.close();
  await prisma.$disconnect();
}
