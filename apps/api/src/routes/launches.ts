import {
  bondingCurveLaunchAbi,
  graduatorAbi,
  launchFactoryAbi,
  launchIdentityVerifierAbi,
  launchpadFactoryAbi,
} from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  keccak256,
  parseAbi,
  parseUnits,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import type { ApiChainClient } from '../core/chain-client.js';

const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform(value => getAddress(value));
const decimal = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .max(80);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(80);
const walletRequest = z.object({ walletAddress: address });
const createLaunchpadRequest = walletRequest
  .extend({
    feeRecipient: address,
    admins: z.array(address).max(10).default([]),
    identity: z.object({
      name: z.string().trim().min(2).max(120),
      slug,
      logoUrl: z.string().url().max(1_024),
      bannerUrl: z.string().url().max(1_024).or(z.literal('')).default(''),
      domain: z.string().trim().max(255).default(''),
      xHandle: z
        .string()
        .trim()
        .regex(/^@?[A-Za-z0-9_]{1,15}$/)
        .transform(value => value.replace(/^@/, '')),
    }),
    economics: z
      .object({
        quoteToken: address,
        tradeFeePips: z.number().int().min(1).max(999_999),
        creatorSharePips: z.number().int().min(0).max(1_000_000),
        launchpadSharePips: z.number().int().min(0).max(1_000_000),
        protocolSharePips: z.number().int().min(0).max(1_000_000),
        lpCreatorSharePips: z.number().int().min(0).max(1_000_000),
        lpLaunchpadSharePips: z.number().int().min(0).max(1_000_000),
        lpProtocolSharePips: z.number().int().min(0).max(1_000_000),
        graduationThreshold: decimal,
        curveTokenSupply: decimal,
      })
      .refine(
        value =>
          value.creatorSharePips + value.launchpadSharePips + value.protocolSharePips === 1_000_000,
        {
          message: 'fee shares must total 100%',
          path: ['protocolSharePips'],
        }
      )
      .refine(
        value =>
          value.lpCreatorSharePips + value.lpLaunchpadSharePips + value.lpProtocolSharePips ===
          1_000_000,
        {
          message: 'LP fee shares must total 100%',
          path: ['lpProtocolSharePips'],
        }
      ),
    graduation: z
      .object({
        startFeePips: z.number().int().min(1).max(999_999),
        endFeePips: z.number().int().min(1).max(999_999),
        durationSeconds: z.number().int().min(60).max(31_536_000),
        feeCurve: z.enum(['linear', 'exponential']),
      })
      .refine(value => value.startFeePips > value.endFeePips, {
        message: 'start fee must exceed end fee',
        path: ['startFeePips'],
      }),
    protection: z
      .object({
        enabled: z.boolean(),
        xRequired: z.boolean(),
        devBuyCapPips: z.number().int().min(0).max(1_000_000),
        earlyBuyCapPips: z.number().int().min(0).max(1_000_000),
        earlyBuyDurationSeconds: z.number().int().min(0).max(31_536_000),
      })
      .refine(value => value.enabled || !value.xRequired, {
        message: 'X verification requires Protected Launch',
        path: ['xRequired'],
      }),
  })
  .strict();
const tokenLaunchRequest = walletRequest
  .extend({
    name: z.string().trim().min(2).max(120),
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{2,16}$/)
      .transform(value => value.toUpperCase()),
    imageUrl: z.string().url().max(1_024),
    website: z.string().url().max(512).or(z.literal('')).default(''),
    xHandle: z
      .string()
      .trim()
      .regex(/^@?[A-Za-z0-9_]{1,15}$/)
      .or(z.literal(''))
      .transform(value => value.replace(/^@/, '')),
    totalSupply: decimal,
  })
  .strict();
const tradeQuoteRequest = z
  .object({
    side: z.enum(['buy', 'sell']),
    amountIn: decimal,
    slippageBps: z.number().int().min(1).max(1_000).default(50),
  })
  .strict();
const tradePrepareRequest = tradeQuoteRequest.extend({ walletAddress: address }).strict();
const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);

export type LaunchRouteConfig = {
  launchpadFactory?: Address;
  launchFactory?: Address;
  identityVerifier?: Address;
  graduator?: Address;
  identitySignerPrivateKey?: Hex;
};

class LaunchRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof LaunchRouteError)
    return reply.status(error.status).send({ error: error.code });
  if (error instanceof RangeError) return reply.status(400).send({ error: 'INVALID_TOKEN_AMOUNT' });
  return reply.status(500).send({ error: 'LAUNCH_REQUEST_FAILED' });
}

function transaction(chainId: number, to: Address, data: Hex, gas?: bigint) {
  return {
    chainId,
    to,
    data,
    value: '0x0' as Hex,
    ...(gas === undefined ? {} : { gas: toHex(gas) }),
  };
}

async function linkedSession(cookies: Record<string, string | undefined>, walletAddress: Address) {
  const session = await resolveSession(cookies[SESSION_COOKIE_NAME]);
  if (!session) throw new LaunchRouteError(401, 'AUTHENTICATION_REQUIRED');
  if (
    !session.user.wallets.some(
      wallet => wallet.address.toLowerCase() === walletAddress.toLowerCase()
    )
  ) {
    throw new LaunchRouteError(403, 'LINKED_WALLET_REQUIRED');
  }
  if (session.user.banned) throw new LaunchRouteError(403, 'ACCOUNT_UNAVAILABLE');
  return session;
}

async function optionalLinkedSession(
  cookies: Record<string, string | undefined>,
  walletAddress: Address
) {
  const session = await resolveSession(cookies[SESSION_COOKIE_NAME]);
  if (!session) return null;
  if (session.user.banned) throw new LaunchRouteError(403, 'ACCOUNT_UNAVAILABLE');
  return session.user.wallets.some(
    wallet => wallet.address.toLowerCase() === walletAddress.toLowerCase()
  )
    ? session
    : null;
}

function requireDeployment(config: LaunchRouteConfig) {
  if (
    !config.launchpadFactory ||
    !config.launchFactory ||
    !config.identityVerifier ||
    !config.graduator
  ) {
    throw new LaunchRouteError(503, 'LAUNCH_PROTOCOL_NOT_DEPLOYED');
  }
  return {
    launchpadFactory: config.launchpadFactory,
    launchFactory: config.launchFactory,
    identityVerifier: config.identityVerifier,
    graduator: config.graduator,
  };
}

function launchpadJson(
  record: Awaited<ReturnType<typeof findLaunchpad>>,
  profiles: ReadonlyMap<string, CreatorProfile> = new Map()
) {
  if (!record) return null;
  const metadata = decodeLaunchpadMetadata(record.metadataUri);
  return {
    id: record.launchpadId.toString(),
    owner: getAddress(record.owner),
    feeRecipient: getAddress(record.feeRecipient),
    admins: record.admins.map(value => getAddress(value)),
    name: record.name,
    slug: record.slug,
    metadataUri: record.metadataUri,
    logoUrl: metadata.logoUrl,
    bannerUrl: metadata.bannerUrl,
    domain: record.domain,
    xHandle: record.xHandle,
    ownerProfile: profiles.get(record.owner.toLowerCase()) ?? null,
    quoteToken: getAddress(record.quoteToken),
    tradeFeePips: record.tradeFeePips,
    creatorSharePips: record.creatorSharePips,
    launchpadSharePips: record.launchpadSharePips,
    protocolSharePips: record.protocolSharePips,
    lpCreatorSharePips: record.lpCreatorSharePips,
    lpLaunchpadSharePips: record.lpLaunchpadSharePips,
    lpProtocolSharePips: record.lpProtocolSharePips,
    graduationThresholdRaw: record.graduationThreshold.toFixed(0),
    curveTokenSupplyRaw: record.curveTokenSupply.toFixed(0),
    graduationTarget: 'DAMM' as const,
    startFeePips: record.startFeePips,
    endFeePips: record.endFeePips,
    feeDurationSeconds: record.feeDurationSeconds,
    feeCurve:
      record.feeCurve.toLowerCase() === 'exponential'
        ? ('exponential' as const)
        : ('linear' as const),
    protection: {
      enabled: record.protectionEnabled,
      xRequired: record.xRequired,
      devBuyCapPips: record.devBuyCapPips,
      earlyBuyCapPips: record.earlyBuyCapPips,
      earlyBuyDurationSeconds: record.earlyBuyDurationSeconds,
    },
    active: record.active,
    launchCount: record._count.launches,
    createdAt: record.createdAt.toISOString(),
  };
}

function launchpadMetadataUri(identity: z.infer<typeof createLaunchpadRequest>['identity']) {
  const metadata = {
    name: identity.name,
    logo: identity.logoUrl,
    ...(identity.bannerUrl ? { banner: identity.bannerUrl } : {}),
    ...(identity.domain ? { external_url: identity.domain } : {}),
    x_handle: identity.xHandle,
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64')}`;
}

function decodeLaunchpadMetadata(uri: string): {
  logoUrl: string | null;
  bannerUrl: string | null;
} {
  try {
    if (!uri.startsWith('data:application/json;base64,')) return { logoUrl: null, bannerUrl: null };
    const parsed = JSON.parse(
      Buffer.from(uri.slice('data:application/json;base64,'.length), 'base64').toString('utf8')
    ) as { logo?: unknown; banner?: unknown };
    return {
      logoUrl: typeof parsed.logo === 'string' ? parsed.logo : null,
      bannerUrl: typeof parsed.banner === 'string' ? parsed.banner : null,
    };
  } catch {
    return { logoUrl: null, bannerUrl: null };
  }
}

const launchpadInclude = { _count: { select: { launches: true } } } as const;
async function findLaunchpad(chainId: number, selector: { slug: string } | { id: bigint }) {
  return prisma.launchpad.findFirst({
    where: {
      chainId,
      canonical: true,
      ...('slug' in selector ? { slug: selector.slug } : { launchpadId: selector.id }),
    },
    include: launchpadInclude,
  });
}

type CreatorProfile = {
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  xVerified: boolean;
};

async function creatorProfiles(addresses: readonly string[]) {
  const wallets = await prisma.wallet.findMany({
    where: { address: { in: [...new Set(addresses.map(value => value.toLowerCase()))] } },
    include: { user: { select: { handle: true, name: true, avatarUrl: true, xVerified: true } } },
  });
  return new Map<string, CreatorProfile>(
    wallets.map(wallet => [wallet.address.toLowerCase(), wallet.user])
  );
}

function launchJson(
  record: Awaited<ReturnType<typeof findLaunch>>,
  profiles: ReadonlyMap<string, CreatorProfile> = new Map()
) {
  if (!record) return null;
  const totalSupply = BigInt(record.totalSupply.toFixed(0));
  const curveSupply = BigInt(record.launchpad.curveTokenSupply.toFixed(0));
  const devHoldingsPips =
    totalSupply === 0n ? 0 : Number(((totalSupply - curveSupply) * 1_000_000n) / totalSupply);
  const metadata = decodeLaunchMetadata(record.metadataUri);
  return {
    id: record.launchId.toString(),
    chainId: record.chainId,
    launchpadId: record.launchpadId.toString(),
    creator: getAddress(record.creator),
    token: getAddress(record.token),
    curve: getAddress(record.curve),
    name: record.name,
    symbol: record.symbol,
    metadataUri: record.metadataUri,
    totalSupplyRaw: record.totalSupply.toFixed(0),
    imageUrl: metadata.imageUrl,
    website: metadata.website,
    xHandle: metadata.xHandle,
    quoteReserveRaw: record.quoteReserve.toFixed(0),
    tokenInventoryRaw: record.tokenInventory.toFixed(0),
    progressPips: record.progressPips,
    status: record.status === 'graduated' ? ('graduated' as const) : ('curve' as const),
    createdAt: record.createdAt.toISOString(),
    creatorProfile: profiles.get(record.creator.toLowerCase()) ?? null,
    devHoldingsPips,
    launchpad: {
      id: record.launchpad.launchpadId.toString(),
      name: record.launchpad.name,
      slug: record.launchpad.slug,
      quoteToken: getAddress(record.launchpad.quoteToken),
      tradeFeePips: record.launchpad.tradeFeePips,
      graduationThresholdRaw: record.launchpad.graduationThreshold.toFixed(0),
      curveTokenSupplyRaw: record.launchpad.curveTokenSupply.toFixed(0),
      protectionEnabled: record.launchpad.protectionEnabled,
      xRequired: record.launchpad.xRequired,
    },
    graduation: record.graduation
      ? {
          pool: getAddress(record.graduation.pool),
          positionId: record.graduation.positionId.toString(),
          tokenAmountRaw: record.graduation.tokenAmount.toFixed(0),
          quoteAmountRaw: record.graduation.quoteAmount.toFixed(0),
          timestamp: record.graduation.timestamp.toISOString(),
        }
      : null,
  };
}

function launchMetadataUri(input: z.infer<typeof tokenLaunchRequest>) {
  const metadata = {
    name: input.name,
    symbol: input.symbol,
    image: input.imageUrl,
    ...(input.website ? { external_url: input.website } : {}),
    ...(input.xHandle ? { properties: { x_handle: input.xHandle } } : {}),
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64')}`;
}

function decodeLaunchMetadata(uri: string): {
  imageUrl: string | null;
  website: string | null;
  xHandle: string | null;
} {
  try {
    if (!uri.startsWith('data:application/json;base64,'))
      return { imageUrl: null, website: null, xHandle: null };
    const parsed = JSON.parse(
      Buffer.from(uri.slice('data:application/json;base64,'.length), 'base64').toString('utf8')
    ) as {
      image?: unknown;
      external_url?: unknown;
      properties?: { x_handle?: unknown };
    };
    return {
      imageUrl: typeof parsed.image === 'string' ? parsed.image : null,
      website: typeof parsed.external_url === 'string' ? parsed.external_url : null,
      xHandle: typeof parsed.properties?.x_handle === 'string' ? parsed.properties.x_handle : null,
    };
  } catch {
    return { imageUrl: null, website: null, xHandle: null };
  }
}

async function findLaunch(chainId: number, token: Address) {
  return prisma.launch.findFirst({
    where: { chainId, token: token.toLowerCase(), canonical: true },
    include: { launchpad: true, graduation: true },
  });
}

async function buildCurveQuote(
  client: ApiChainClient,
  record: NonNullable<Awaited<ReturnType<typeof findLaunch>>>,
  input: z.infer<typeof tradeQuoteRequest>
) {
  if (record.status !== 'curve') throw new LaunchRouteError(409, 'LAUNCH_ALREADY_GRADUATED');
  const quoteDecimals = Number(
    await client.readContract({
      address: getAddress(record.launchpad.quoteToken),
      abi: erc20Abi,
      functionName: 'decimals',
    })
  );
  const inputDecimals = input.side === 'buy' ? quoteDecimals : 18;
  const outputDecimals = input.side === 'buy' ? 18 : quoteDecimals;
  const amountInRaw = parseUnits(input.amountIn, inputDecimals);
  if (amountInRaw <= 0n) throw new LaunchRouteError(400, 'INVALID_TOKEN_AMOUNT');
  const [amountOutRaw, feeRaw] =
    input.side === 'buy'
      ? await client.readContract({
          address: getAddress(record.curve),
          abi: bondingCurveLaunchAbi,
          functionName: 'quoteBuy',
          args: [amountInRaw],
        })
      : await client.readContract({
          address: getAddress(record.curve),
          abi: bondingCurveLaunchAbi,
          functionName: 'quoteSell',
          args: [amountInRaw],
        });
  const minimumAmountOutRaw = (amountOutRaw * BigInt(10_000 - input.slippageBps)) / 10_000n;
  const progressPips = await client.readContract({
    address: getAddress(record.curve),
    abi: bondingCurveLaunchAbi,
    functionName: 'progressPips',
  });
  return {
    side: input.side,
    amountIn: formatUnits(amountInRaw, inputDecimals),
    amountInRaw: amountInRaw.toString(),
    amountOut: formatUnits(amountOutRaw, outputDecimals),
    amountOutRaw: amountOutRaw.toString(),
    minimumAmountOut: formatUnits(minimumAmountOutRaw, outputDecimals),
    minimumAmountOutRaw: minimumAmountOutRaw.toString(),
    feeRaw: feeRaw.toString(),
    progressPips,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
}

export async function registerLaunchRoutes(
  app: FastifyInstance,
  chainId: number,
  client: ApiChainClient,
  config: LaunchRouteConfig
) {
  app.get('/v1/launchpads', async request => {
    const query = z
      .object({ owner: address.optional(), active: z.coerce.boolean().optional() })
      .safeParse(request.query);
    if (!query.success) throw new LaunchRouteError(400, 'INVALID_LAUNCHPAD_FILTER');
    const records = await prisma.launchpad.findMany({
      where: {
        chainId,
        canonical: true,
        ...(query.data.owner ? { owner: query.data.owner.toLowerCase() } : {}),
        ...(query.data.active === undefined ? {} : { active: query.data.active }),
      },
      include: launchpadInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const profiles = await creatorProfiles(records.map(record => record.owner));
    return { data: records.map(record => launchpadJson(record, profiles)) };
  });

  app.get('/v1/launchpads/:slug', async (request, reply) => {
    const params = z.object({ slug }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_LAUNCHPAD_SLUG' });
    const record = await findLaunchpad(chainId, { slug: params.data.slug });
    if (!record) return reply.status(404).send({ error: 'LAUNCHPAD_NOT_FOUND' });
    const ownerProfiles = await creatorProfiles([record.owner]);
    const launches = await prisma.launch.findMany({
      where: { chainId, launchpadId: record.launchpadId, canonical: true },
      include: { launchpad: true, graduation: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const profiles = await creatorProfiles(launches.map(item => item.creator));
    const launchIds = launches.map(item => item.launchId);
    const [volume, revenue] = await Promise.all([
      prisma.curveTrade.aggregate({
        where: { chainId, launchId: { in: launchIds }, canonical: true },
        _sum: { quoteAmount: true },
      }),
      prisma.launchpadRevenue.groupBy({
        where: { chainId, launchId: { in: launchIds }, canonical: true },
        by: ['token', 'category'],
        _sum: { amount: true },
      }),
    ]);
    const revenueByToken = new Map<
      string,
      { creator: bigint; launchpad: bigint; protocol: bigint }
    >();
    for (const item of revenue) {
      const token = item.token.toLowerCase();
      const totals = revenueByToken.get(token) ?? { creator: 0n, launchpad: 0n, protocol: 0n };
      const amount = BigInt(item._sum.amount?.toFixed(0) ?? '0');
      if (item.category === 'creator') totals.creator += amount;
      if (item.category === 'launchpad') totals.launchpad += amount;
      if (item.category === 'protocol') totals.protocol += amount;
      revenueByToken.set(token, totals);
    }
    const quoteRevenue = revenueByToken.get(record.quoteToken.toLowerCase()) ?? {
      creator: 0n,
      launchpad: 0n,
      protocol: 0n,
    };
    return {
      ...launchpadJson(record, ownerProfiles),
      launches: launches.map(item => launchJson(item, profiles)),
      dashboard: {
        launches: launches.length,
        liveCurves: launches.filter(item => item.status === 'curve').length,
        graduations: launches.filter(item => item.status === 'graduated').length,
        volumeQuoteRaw: volume._sum.quoteAmount?.toFixed(0) ?? '0',
        creatorRevenueRaw: quoteRevenue.creator.toString(),
        launchpadRevenueRaw: quoteRevenue.launchpad.toString(),
        protocolRevenueRaw: quoteRevenue.protocol.toString(),
        revenueByToken: [...revenueByToken.entries()].map(([token, totals]) => ({
          token,
          creatorRaw: totals.creator.toString(),
          launchpadRaw: totals.launchpad.toString(),
          protocolRaw: totals.protocol.toString(),
        })),
      },
    };
  });

  app.get('/v1/launches', async request => {
    const query = z
      .object({ launchpad: slug.optional(), status: z.enum(['curve', 'graduated']).optional() })
      .safeParse(request.query);
    if (!query.success) throw new LaunchRouteError(400, 'INVALID_LAUNCH_FILTER');
    const records = await prisma.launch.findMany({
      where: {
        chainId,
        canonical: true,
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.launchpad ? { launchpad: { slug: query.data.launchpad } } : {}),
      },
      include: { launchpad: true, graduation: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const profiles = await creatorProfiles(records.map(record => record.creator));
    return { data: records.map(record => launchJson(record, profiles)) };
  });

  app.get('/v1/launches/:token', async (request, reply) => {
    const params = z.object({ token: address }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_TOKEN_ADDRESS' });
    const record = await findLaunch(chainId, params.data.token);
    if (!record) return reply.status(404).send({ error: 'LAUNCH_NOT_FOUND' });
    const trades = await prisma.curveTrade.findMany({
      where: { chainId, launchId: record.launchId, canonical: true },
      orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
      take: 100,
    });
    const profiles = await creatorProfiles([record.creator]);
    return {
      ...launchJson(record, profiles),
      trades: trades.map(trade => ({
        transactionHash: trade.transactionHash,
        logIndex: trade.logIndex,
        side: trade.side,
        trader: getAddress(trade.trader),
        recipient: getAddress(trade.recipient),
        quoteAmountRaw: trade.quoteAmount.toFixed(0),
        tokenAmountRaw: trade.tokenAmount.toFixed(0),
        feeAmountRaw: trade.feeAmount.toFixed(0),
        progressPips: trade.progressPips,
        timestamp: trade.timestamp.toISOString(),
      })),
    };
  });

  app.post(
    '/v1/launchpads/prepare',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = createLaunchpadRequest.safeParse(request.body);
      if (!body.success)
        return reply.status(400).send({ error: 'INVALID_LAUNCHPAD_CONFIGURATION' });
      try {
        const deployment = requireDeployment(config);
        const session = await linkedSession(request.cookies, body.data.walletAddress);
        if (
          session.user.handle.replace(/^@/, '').toLowerCase() !==
          body.data.identity.xHandle.toLowerCase()
        ) {
          throw new LaunchRouteError(403, 'LAUNCHPAD_X_IDENTITY_MISMATCH');
        }
        const normalizedAdmins = new Set(body.data.admins.map(value => value.toLowerCase()));
        if (
          normalizedAdmins.size !== body.data.admins.length ||
          normalizedAdmins.has(body.data.walletAddress.toLowerCase())
        ) {
          throw new LaunchRouteError(400, 'INVALID_LAUNCHPAD_ADMINS');
        }
        const existing = await prisma.launchpad.findFirst({
          where: { chainId, slug: body.data.identity.slug, canonical: true },
        });
        if (existing) throw new LaunchRouteError(409, 'LAUNCHPAD_SLUG_UNAVAILABLE');
        const launchpadMetadata = launchpadMetadataUri(body.data.identity);
        if (launchpadMetadata.length > 2_048)
          throw new LaunchRouteError(400, 'LAUNCHPAD_METADATA_TOO_LARGE');
        const supportedQuote = await client.readContract({
          address: deployment.launchpadFactory,
          abi: launchpadFactoryAbi,
          functionName: 'supportedQuoteToken',
          args: [body.data.economics.quoteToken],
        });
        if (!supportedQuote) throw new LaunchRouteError(400, 'UNSUPPORTED_LAUNCH_QUOTE_TOKEN');
        const quoteTokenDecimals = Number(
          await client.readContract({
            address: body.data.economics.quoteToken,
            abi: erc20Abi,
            functionName: 'decimals',
          })
        );
        if (quoteTokenDecimals > 36) throw new LaunchRouteError(400, 'INVALID_QUOTE_TOKEN');
        const graduationThreshold = parseUnits(
          body.data.economics.graduationThreshold,
          quoteTokenDecimals
        );
        const curveTokenSupply = parseUnits(body.data.economics.curveTokenSupply, 18);
        if (graduationThreshold <= 0n || curveTokenSupply <= 0n)
          throw new LaunchRouteError(400, 'INVALID_LAUNCHPAD_CONFIGURATION');
        const data = encodeFunctionData({
          abi: launchpadFactoryAbi,
          functionName: 'createLaunchpad',
          args: [
            body.data.walletAddress,
            body.data.feeRecipient,
            body.data.admins,
            {
              name: body.data.identity.name,
              slug: body.data.identity.slug,
              metadataURI: launchpadMetadata,
              domain: body.data.identity.domain,
              xHandle: body.data.identity.xHandle,
            },
            {
              quoteToken: body.data.economics.quoteToken,
              tradeFeePips: body.data.economics.tradeFeePips,
              creatorSharePips: body.data.economics.creatorSharePips,
              launchpadSharePips: body.data.economics.launchpadSharePips,
              protocolSharePips: body.data.economics.protocolSharePips,
              lpCreatorSharePips: body.data.economics.lpCreatorSharePips,
              lpLaunchpadSharePips: body.data.economics.lpLaunchpadSharePips,
              lpProtocolSharePips: body.data.economics.lpProtocolSharePips,
              graduationThreshold,
              curveTokenSupply,
            },
            {
              target: 0,
              startFeePips: body.data.graduation.startFeePips,
              endFeePips: body.data.graduation.endFeePips,
              durationSeconds: body.data.graduation.durationSeconds,
              feeCurve: body.data.graduation.feeCurve === 'exponential' ? 1 : 0,
              dlmmBinStepBps: 0,
              dlmmSeedShape: 0,
            },
            body.data.protection,
          ],
        });
        const gas = await client
          .estimateGas({
            account: body.data.walletAddress,
            to: deployment.launchpadFactory,
            data,
            value: 0n,
          })
          .catch(() => undefined);
        return {
          launchpadFactory: deployment.launchpadFactory,
          transaction: transaction(chainId, deployment.launchpadFactory, data, gas),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  app.post(
    '/v1/launchpads/:id/launch-prepare',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.bigint().positive() }).safeParse(request.params);
      const body = tokenLaunchRequest.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: 'INVALID_TOKEN_LAUNCH' });
      try {
        const deployment = requireDeployment(config);
        const launchpad = await findLaunchpad(chainId, { id: params.data.id });
        if (!launchpad || !launchpad.active) throw new LaunchRouteError(404, 'LAUNCHPAD_NOT_FOUND');
        // Wallet-only creation remains permissionless unless this launchpad
        // explicitly requires X. Graduation can still publish its Launch LP
        // through the launchpad owner's profile when the creator has no profile.
        const session = launchpad.xRequired
          ? await linkedSession(request.cookies, body.data.walletAddress)
          : await optionalLinkedSession(request.cookies, body.data.walletAddress);
        if (
          body.data.xHandle &&
          (!session ||
            session.user.handle.replace(/^@/, '').toLowerCase() !== body.data.xHandle.toLowerCase())
        ) {
          throw new LaunchRouteError(403, 'TOKEN_X_IDENTITY_MISMATCH');
        }
        const metadataUri = launchMetadataUri(body.data);
        if (metadataUri.length > 2_048) throw new LaunchRouteError(400, 'TOKEN_METADATA_TOO_LARGE');
        const totalSupply = parseUnits(body.data.totalSupply, 18);
        const curveTokenSupply = BigInt(launchpad.curveTokenSupply.toFixed(0));
        if (totalSupply < curveTokenSupply)
          throw new LaunchRouteError(400, 'TOTAL_SUPPLY_BELOW_CURVE_ALLOCATION');
        if (launchpad.protectionEnabled) {
          const developerAllocation = totalSupply - curveTokenSupply;
          const developerCap = (curveTokenSupply * BigInt(launchpad.devBuyCapPips)) / 1_000_000n;
          if (developerAllocation > developerCap)
            throw new LaunchRouteError(400, 'DEVELOPER_ALLOCATION_EXCEEDS_CAP');
        }
        if (launchpad.protectionEnabled) {
          const normalizedName = body.data.name.toLowerCase();
          const normalizedSymbol = body.data.symbol.toLowerCase();
          const [catalogConflicts, launchConflicts] = await Promise.all([
            prisma.assetCatalog.findMany({
              where: {
                chainId,
                OR: [
                  { symbol: { equals: body.data.symbol, mode: 'insensitive' } },
                  { name: { equals: body.data.name, mode: 'insensitive' } },
                ],
              },
              select: { address: true, name: true, symbol: true },
            }),
            prisma.launch.findMany({
              where: {
                chainId,
                canonical: true,
                OR: [
                  { symbol: { equals: body.data.symbol, mode: 'insensitive' } },
                  { name: { equals: body.data.name, mode: 'insensitive' } },
                ],
              },
              select: { token: true, creator: true, name: true, symbol: true },
            }),
          ]);
          const conflictingCatalog = catalogConflicts.filter(
            item =>
              item.name.toLowerCase() === normalizedName ||
              item.symbol.toLowerCase() === normalizedSymbol
          );
          const conflictingLaunches = launchConflicts.filter(
            item =>
              item.name.toLowerCase() === normalizedName ||
              item.symbol.toLowerCase() === normalizedSymbol
          );
          if (conflictingCatalog.length > 0 || conflictingLaunches.length > 0) {
            const [officialCatalogIdentity, previousCreator] = session
              ? await Promise.all([
                  prisma.protectedTokenIdentity.findFirst({
                    where: {
                      chainId,
                      token: { in: conflictingCatalog.map(item => item.address.toLowerCase()) },
                      officialXId: session.user.xId,
                    },
                  }),
                  prisma.wallet.findFirst({
                    where: {
                      address: { in: conflictingLaunches.map(item => item.creator.toLowerCase()) },
                      user: { xId: session.user.xId },
                    },
                  }),
                ])
              : [null, null];
            if (!officialCatalogIdentity && !previousCreator)
              throw new LaunchRouteError(409, 'PROTECTED_IDENTITY_CONFLICT');
          }
        }
        const identityDeadline = launchpad.xRequired
          ? BigInt(Math.floor(Date.now() / 1_000) + 10 * 60)
          : 0n;
        let identityProof: Hex = '0x';
        if (launchpad.xRequired) {
          if (!session?.user.xId) throw new LaunchRouteError(403, 'X_ACCOUNT_REQUIRED');
          if (!config.identitySignerPrivateKey)
            throw new LaunchRouteError(503, 'IDENTITY_PROOF_UNAVAILABLE');
          const nameHash = keccak256(toBytes(body.data.name.toLowerCase()));
          const symbolHash = keccak256(toBytes(body.data.symbol.toLowerCase()));
          const payload = await client.readContract({
            address: deployment.identityVerifier,
            abi: launchIdentityVerifierAbi,
            functionName: 'verificationPayload',
            args: [body.data.walletAddress, nameHash, symbolHash, identityDeadline],
          });
          identityProof = await privateKeyToAccount(config.identitySignerPrivateKey).signMessage({
            message: { raw: payload },
          });
        }
        const data = encodeFunctionData({
          abi: launchFactoryAbi,
          functionName: 'launchToken',
          args: [
            params.data.id,
            body.data.name,
            body.data.symbol,
            metadataUri,
            totalSupply,
            identityDeadline,
            identityProof,
          ],
        });
        const gas = await client
          .estimateGas({
            account: body.data.walletAddress,
            to: deployment.launchFactory,
            data,
            value: 0n,
          })
          .catch(() => undefined);
        return {
          launchFactory: deployment.launchFactory,
          identityRequired: launchpad.xRequired,
          identityDeadline: identityDeadline.toString(),
          transaction: transaction(chainId, deployment.launchFactory, data, gas),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  app.post(
    '/v1/launchpads/:id/status-prepare',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.bigint().positive() }).safeParse(request.params);
      const body = walletRequest.extend({ active: z.boolean() }).strict().safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: 'INVALID_LAUNCHPAD_STATUS_REQUEST' });
      try {
        const deployment = requireDeployment(config);
        await linkedSession(request.cookies, body.data.walletAddress);
        const launchpad = await findLaunchpad(chainId, { id: params.data.id });
        if (!launchpad) throw new LaunchRouteError(404, 'LAUNCHPAD_NOT_FOUND');
        const authorized =
          launchpad.owner.toLowerCase() === body.data.walletAddress.toLowerCase() ||
          launchpad.admins.some(
            admin => admin.toLowerCase() === body.data.walletAddress.toLowerCase()
          );
        if (!authorized) throw new LaunchRouteError(403, 'LAUNCHPAD_ADMIN_REQUIRED');
        const data = encodeFunctionData({
          abi: launchpadFactoryAbi,
          functionName: 'setLaunchpadStatus',
          args: [params.data.id, body.data.active],
        });
        const gas = await client
          .estimateGas({
            account: body.data.walletAddress,
            to: deployment.launchpadFactory,
            data,
            value: 0n,
          })
          .catch(() => undefined);
        return {
          transaction: transaction(chainId, deployment.launchpadFactory, data, gas),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  app.post('/v1/launches/:token/quote', async (request, reply) => {
    const params = z.object({ token: address }).safeParse(request.params);
    const body = tradeQuoteRequest.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: 'INVALID_CURVE_QUOTE' });
    try {
      const record = await findLaunch(chainId, params.data.token);
      if (!record) throw new LaunchRouteError(404, 'LAUNCH_NOT_FOUND');
      return await buildCurveQuote(client, record, body.data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/v1/launches/:token/trade-prepare',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = z.object({ token: address }).safeParse(request.params);
      const body = tradePrepareRequest.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: 'INVALID_CURVE_TRADE' });
      try {
        const record = await findLaunch(chainId, params.data.token);
        if (!record) throw new LaunchRouteError(404, 'LAUNCH_NOT_FOUND');
        const quote = await buildCurveQuote(client, record, body.data);
        const curve = getAddress(record.curve);
        const inputToken =
          body.data.side === 'buy'
            ? getAddress(record.launchpad.quoteToken)
            : getAddress(record.token);
        const amountInRaw = BigInt(quote.amountInRaw);
        const allowance = await client.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [body.data.walletAddress, curve],
        });
        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [curve, amountInRaw],
        });
        const approval =
          allowance >= amountInRaw
            ? null
            : transaction(
                chainId,
                inputToken,
                approvalData,
                await client
                  .estimateGas({
                    account: body.data.walletAddress,
                    to: inputToken,
                    data: approvalData,
                    value: 0n,
                  })
                  .catch(() => undefined)
              );
        const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
        const data =
          body.data.side === 'buy'
            ? encodeFunctionData({
                abi: bondingCurveLaunchAbi,
                functionName: 'buy',
                args: [
                  amountInRaw,
                  BigInt(quote.minimumAmountOutRaw),
                  body.data.walletAddress,
                  deadline,
                ],
              })
            : encodeFunctionData({
                abi: bondingCurveLaunchAbi,
                functionName: 'sell',
                args: [
                  amountInRaw,
                  BigInt(quote.minimumAmountOutRaw),
                  body.data.walletAddress,
                  deadline,
                ],
              });
        const gas = await client
          .estimateGas({ account: body.data.walletAddress, to: curve, data, value: 0n })
          .catch(() => undefined);
        return { ...quote, approval, transaction: transaction(chainId, curve, data, gas) };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  app.post(
    '/v1/launches/:token/graduation-prepare',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = z.object({ token: address }).safeParse(request.params);
      const body = walletRequest.strict().safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: 'INVALID_GRADUATION_REQUEST' });
      try {
        const record = await findLaunch(chainId, params.data.token);
        if (!record) throw new LaunchRouteError(404, 'LAUNCH_NOT_FOUND');
        if (record.status !== 'curve' || record.progressPips < 1_000_000)
          throw new LaunchRouteError(409, 'GRADUATION_NOT_READY');
        const curve = getAddress(record.curve);
        const data = encodeFunctionData({ abi: bondingCurveLaunchAbi, functionName: 'graduate' });
        const gas = await client
          .estimateGas({ account: body.data.walletAddress, to: curve, data, value: 0n })
          .catch(() => undefined);
        return {
          transaction: transaction(chainId, curve, data, gas),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  app.post(
    '/v1/launches/:token/fees-claim-prepare',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const params = z.object({ token: address }).safeParse(request.params);
      const body = walletRequest.strict().safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: 'INVALID_FEE_CLAIM_REQUEST' });
      try {
        const deployment = requireDeployment(config);
        const record = await findLaunch(chainId, params.data.token);
        if (!record) throw new LaunchRouteError(404, 'LAUNCH_NOT_FOUND');
        if (record.status !== 'graduated') throw new LaunchRouteError(409, 'LAUNCH_NOT_GRADUATED');
        const data = encodeFunctionData({
          abi: graduatorAbi,
          functionName: 'claimLaunchFees',
          args: [getAddress(record.curve)],
        });
        const gas = await client
          .estimateGas({
            account: body.data.walletAddress,
            to: deployment.graduator,
            data,
            value: 0n,
          })
          .catch(() => undefined);
        return {
          transaction: transaction(chainId, deployment.graduator, data, gas),
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );
}
