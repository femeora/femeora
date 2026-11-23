import { Client } from 'pg';

process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');

const tables = [
  'bins',
  'bin_fee_accruals',
  'callout_intents',
  'callout_updates',
  'callouts',
  'candles',
  'canonical_blocks',
  'chain_cursors',
  'follows',
  'indexer_health',
  'likes',
  'notifications',
  'oauth_states',
  'outbox_events',
  'pools',
  'position_bins',
  'position_events',
  'position_fee_credits',
  'position_share_checkpoints',
  'positions',
  'replies',
  'reports',
  'reposts',
  'sessions',
  'swaps',
  'tails',
  'user_stats',
  'users',
  'views_daily',
  'wallet_link_challenges',
  'wallets',
] as const;

async function roleCannotRead(role: 'anon' | 'authenticated'): Promise<boolean> {
  const client = new Client({ connectionString: environment.DATABASE_URL, application_name: 'fomeora-security-verifier' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    try {
      await client.query('SELECT id FROM public.users LIMIT 1');
      return false;
    } catch {
      return true;
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();
  }
}

try {
  const tableList = tables.map(table => `'${table}'`).join(',');
  const [rlsRows, grants, routineGrants, ownerRead, anonDenied, authenticatedDenied] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ relname: string }>>(
      `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN (${tableList}) AND NOT relrowsecurity`,
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN (${tableList}) AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    ),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM information_schema.routine_privileges WHERE routine_schema = 'public' AND routine_name = 'notify_fomeora_outbox_event' AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    ),
    prisma.pool.count(),
    roleCannotRead('anon'),
    roleCannotRead('authenticated'),
  ]);

  const result = {
    allTablesRlsEnabled: rlsRows.length === 0,
    clientTableGrantsRevoked: grants[0]?.count === 0n,
    outboxFunctionExecuteRevoked: routineGrants[0]?.count === 0n,
    databaseOwnerStillReads: Number.isInteger(ownerRead),
    anonReadDenied: anonDenied,
    authenticatedReadDenied: authenticatedDenied,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('DATABASE_SECURITY_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'DATABASE_SECURITY_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
