import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const networkSchema = z.enum(['testnet', 'mainnet']);
const EXPECTED_CHAIN_IDS = { testnet: 46_630, mainnet: 4_663 } as const;
const PLACEHOLDER = /(?:change[_-]?me|replace[_-]?me|your[_-]|example\.com|<[^>]+>|\$\{[^}]+\})/i;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const configuredString = z
  .string()
  .min(1)
  .refine(value => !PLACEHOLDER.test(value), 'placeholder value is not allowed');
const configuredUrl = z
  .string()
  .min(1)
  .url()
  .refine(value => !PLACEHOLDER.test(value), 'placeholder value is not allowed');
const optionalUrl = z.preprocess(emptyToUndefined, configuredUrl.optional());
const optionalAddress = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .refine(value => !/^0x0{40}$/i.test(value), 'zero address is not allowed')
    .optional()
);

const commonSchema = z.object({
  APP_NETWORK: networkSchema,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  CHAIN_ID: z.coerce.number().int().positive(),
  CHAIN_NAME: configuredString,
  RPC_URL: configuredUrl,
  EXPLORER_URL: configuredUrl,
  QUOTE_TOKEN_ADDRESS: optionalAddress,
  DATABASE_URL: optionalUrl,
});

function validateCommon(value: z.infer<typeof commonSchema>, context: z.RefinementCtx) {
  if (value.CHAIN_ID !== EXPECTED_CHAIN_IDS[value.APP_NETWORK]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CHAIN_ID'],
      message: 'chain ID does not match APP_NETWORK',
    });
  }
}

const databaseUrl = configuredUrl.refine(value => {
  const parsed = new URL(value);
  return (
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
    (parsed.port === '' || parsed.port === '5432')
  );
}, 'DATABASE_URL must be a PostgreSQL session-pooler URL on port 5432');

const publicOrigin = configuredUrl.refine(value => {
  const parsed = new URL(value);
  return parsed.pathname === '/' && !parsed.search && !parsed.hash;
}, 'WEB_BASE_URL must be an origin without path, query, or hash');

const apiSchema = commonSchema
  .extend({
    DATABASE_URL: databaseUrl,
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_BASE_URL: publicOrigin,
    X_CLIENT_ID: z.preprocess(emptyToUndefined, configuredString.optional()),
    X_CLIENT_SECRET: z.preprocess(emptyToUndefined, configuredString.optional()),
    X_APP_BEARER_TOKEN: z.preprocess(emptyToUndefined, configuredString.optional()),
  })
  .superRefine((value, context) => {
    validateCommon(value, context);
    if (Boolean(value.X_CLIENT_ID) !== Boolean(value.X_CLIENT_SECRET)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['X_CLIENT_SECRET'],
        message: 'X client ID and secret must be configured together',
      });
    }
    if (value.NODE_ENV === 'production' && new URL(value.WEB_BASE_URL).protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_BASE_URL'],
        message: 'production web origin must use HTTPS',
      });
    }
  });

const webSchema = z
  .object({
    APP_NETWORK: networkSchema,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    API_BASE_URL: configuredUrl,
    WEB_BASE_URL: publicOrigin,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && new URL(value.WEB_BASE_URL).protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_BASE_URL'],
        message: 'production web origin must use HTTPS',
      });
    }
  });

const indexerSchema = commonSchema
  .extend({
    DATABASE_URL: databaseUrl,
    RPC_INDEXER: configuredUrl,
    INDEXER_CONFIRMATIONS: z.coerce.number().int().min(1).max(1_024),
    INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000),
    INDEXER_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000),
  })
  .superRefine(validateCommon);

function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error('Unable to locate pnpm workspace root');
    }
    current = parent;
  }
}

function loadNetworkFile(): z.infer<typeof networkSchema> {
  const network = networkSchema.parse(process.env.APP_NETWORK);
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const envPath = resolve(workspaceRoot, `.env.${network}`);
  if (!existsSync(envPath)) return network;
  const loaded = loadDotenv({ path: envPath, override: false });
  if (loaded.error) throw loaded.error;
  if (loaded.parsed?.APP_NETWORK && loaded.parsed.APP_NETWORK !== network) {
    throw new Error(`Selected APP_NETWORK does not match .env.${network}`);
  }
  return network;
}

export function loadApiEnvironment() {
  const network = loadNetworkFile();
  return apiSchema.parse({ ...process.env, APP_NETWORK: network });
}

export function loadIndexerEnvironment() {
  const network = loadNetworkFile();
  return indexerSchema.parse({ ...process.env, APP_NETWORK: network });
}

export function loadWebEnvironment() {
  const network = loadNetworkFile();
  return webSchema.parse({ ...process.env, APP_NETWORK: network });
}

export type ApiEnvironment = ReturnType<typeof loadApiEnvironment>;
export type IndexerEnvironment = ReturnType<typeof loadIndexerEnvironment>;
export type WebEnvironment = ReturnType<typeof loadWebEnvironment>;
