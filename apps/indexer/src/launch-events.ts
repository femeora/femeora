import {
  bondingCurveLaunchAbi,
  graduatorAbi,
  launchFactoryAbi,
  launchpadFactoryAbi,
  launchpadRegistryAbi,
} from '@fomeora/contracts-sdk';
import type { Prisma } from '@fomeora/database';
import type { IndexerEnvironment } from '@fomeora/env';
import type { Address, Hex } from 'viem';

import type { IndexerClient } from './chain-client.js';

type LaunchIndexerConfig = {
  launchpadFactory: Address;
  launchpadRegistry: Address;
  launchFactory: Address;
  graduator: Address;
};

type Mined = {
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: Date;
};

type LaunchpadProjection = Mined & {
  eventType: 'created' | 'status';
  launchpadId: bigint;
  owner: Address;
  feeRecipient: Address;
  admins: Address[];
  name: string;
  slug: string;
  metadataUri: string;
  domain: string;
  xHandle: string;
  quoteToken: Address;
  tradeFeePips: number;
  creatorSharePips: number;
  launchpadSharePips: number;
  protocolSharePips: number;
  lpCreatorSharePips: number;
  lpLaunchpadSharePips: number;
  lpProtocolSharePips: number;
  graduationThreshold: bigint;
  curveTokenSupply: bigint;
  graduationTarget: string;
  startFeePips: number;
  endFeePips: number;
  feeDurationSeconds: number;
  feeCurve: string;
  protectionEnabled: boolean;
  xRequired: boolean;
  devBuyCapPips: number;
  earlyBuyCapPips: number;
  earlyBuyDurationSeconds: number;
  active: boolean;
};

type LaunchProjection = Mined & {
  launchId: bigint;
  launchpadId: bigint;
  creator: Address;
  token: Address;
  curve: Address;
  name: string;
  symbol: string;
  metadataUri: string;
  totalSupply: bigint;
  curveTokenSupply: bigint;
};

type TradeProjection = Mined & {
  curve: Address;
  side: 'buy' | 'sell';
  trader: Address;
  recipient: Address;
  quoteAmount: bigint;
  tokenAmount: bigint;
  feeAmount: bigint;
  quoteReserve: bigint;
  tokenInventory: bigint;
  progressPips: number;
};

type RevenueProjection = Mined & {
  curve: Address;
  recipient: Address;
  category: number;
  token?: Address;
  amount: bigint;
};

type GraduationProjection = Mined & {
  curve: Address;
  token: Address;
  pool: Address;
  positionId: bigint;
  tokenAmount: bigint;
  quoteAmount: bigint;
};

export type LaunchEventBatch = {
  launchpads: LaunchpadProjection[];
  launches: LaunchProjection[];
  trades: TradeProjection[];
  revenue: RevenueProjection[];
  graduations: GraduationProjection[];
};

function configFromEnvironment(environment: IndexerEnvironment): LaunchIndexerConfig | null {
  if (
    !environment.LAUNCHPAD_FACTORY_ADDRESS ||
    !environment.LAUNCHPAD_REGISTRY_ADDRESS ||
    !environment.LAUNCH_FACTORY_ADDRESS ||
    !environment.GRADUATOR_ADDRESS
  )
    return null;
  return {
    launchpadFactory: environment.LAUNCHPAD_FACTORY_ADDRESS as Address,
    launchpadRegistry: environment.LAUNCHPAD_REGISTRY_ADDRESS as Address,
    launchFactory: environment.LAUNCH_FACTORY_ADDRESS as Address,
    graduator: environment.GRADUATOR_ADDRESS as Address,
  };
}

function mined(
  log: { transactionHash: Hex | null; logIndex: number | null; blockNumber: bigint | null },
  timestamps: Map<bigint, Date>
): Mined {
  if (!log.transactionHash || log.logIndex === null || log.blockNumber === null)
    throw new Error('UNMINED_LAUNCH_EVENT');
  const timestamp = timestamps.get(log.blockNumber);
  if (!timestamp) throw new Error('LAUNCH_EVENT_TIMESTAMP_MISSING');
  return {
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    timestamp,
  };
}

export async function collectLaunchEvents(
  client: IndexerClient,
  environment: IndexerEnvironment,
  existingCurves: readonly Address[],
  fromBlock: bigint,
  toBlock: bigint
): Promise<LaunchEventBatch> {
  const config = configFromEnvironment(environment);
  if (!config) return { launchpads: [], launches: [], trades: [], revenue: [], graduations: [] };
  const [launchpadLogs, launchpadStatusLogs, launchLogs, graduationLogs, launchFeeLogs] =
    await Promise.all([
      client.getContractEvents({
        address: config.launchpadFactory,
        abi: launchpadFactoryAbi,
        eventName: 'LaunchpadCreated',
        fromBlock,
        toBlock,
        strict: true,
      }),
      client.getContractEvents({
        address: config.launchpadRegistry,
        abi: launchpadRegistryAbi,
        eventName: 'LaunchpadStatusUpdated',
        fromBlock,
        toBlock,
        strict: true,
      }),
      client.getContractEvents({
        address: config.launchFactory,
        abi: launchFactoryAbi,
        eventName: 'TokenLaunched',
        fromBlock,
        toBlock,
        strict: true,
      }),
      client.getContractEvents({
        address: config.graduator,
        abi: graduatorAbi,
        eventName: 'LaunchGraduated',
        fromBlock,
        toBlock,
        strict: true,
      }),
      client.getContractEvents({
        address: config.graduator,
        abi: graduatorAbi,
        eventName: 'LaunchFeesDistributed',
        fromBlock,
        toBlock,
        strict: true,
      }),
    ]);
  const curves = [
    ...new Set(
      [...existingCurves, ...launchLogs.map(log => log.args.curve)].map(value =>
        value.toLowerCase()
      )
    ),
  ] as Address[];
  const [buyLogs, sellLogs, feeLogs] =
    curves.length === 0
      ? [[], [], []]
      : await Promise.all([
          client.getContractEvents({
            address: curves,
            abi: bondingCurveLaunchAbi,
            eventName: 'Bought',
            fromBlock,
            toBlock,
            strict: true,
          }),
          client.getContractEvents({
            address: curves,
            abi: bondingCurveLaunchAbi,
            eventName: 'Sold',
            fromBlock,
            toBlock,
            strict: true,
          }),
          client.getContractEvents({
            address: curves,
            abi: bondingCurveLaunchAbi,
            eventName: 'FeePaid',
            fromBlock,
            toBlock,
            strict: true,
          }),
        ]);
  const blockNumbers = new Set<bigint>();
  for (const log of [
    ...launchpadLogs,
    ...launchpadStatusLogs,
    ...launchLogs,
    ...graduationLogs,
    ...launchFeeLogs,
    ...buyLogs,
    ...sellLogs,
    ...feeLogs,
  ]) {
    if (log.blockNumber !== null) blockNumbers.add(log.blockNumber);
  }
  const timestamps = new Map<bigint, Date>();
  await Promise.all(
    [...blockNumbers].map(async blockNumber => {
      const block = await client.getBlock({ blockNumber });
      timestamps.set(blockNumber, new Date(Number(block.timestamp) * 1_000));
    })
  );

  const launchpads: LaunchpadProjection[] = [];
  const launchpadStateLogs = [
    ...launchpadLogs.map(log => ({ log, eventType: 'created' as const })),
    ...launchpadStatusLogs.map(log => ({ log, eventType: 'status' as const })),
  ].sort((left, right) => {
    const blockOrder = Number((left.log.blockNumber ?? 0n) - (right.log.blockNumber ?? 0n));
    return blockOrder || (left.log.logIndex ?? 0) - (right.log.logIndex ?? 0);
  });
  for (const { log, eventType } of launchpadStateLogs) {
    if (log.blockNumber === null) throw new Error('UNMINED_LAUNCHPAD_EVENT');
    const [record, admins] = await Promise.all([
      client.readContract({
        address: config.launchpadRegistry,
        abi: launchpadRegistryAbi,
        functionName: 'launchpad',
        args: [log.args.launchpadId],
        blockNumber: log.blockNumber,
      }),
      client.readContract({
        address: config.launchpadRegistry,
        abi: launchpadRegistryAbi,
        functionName: 'launchpadAdmins',
        args: [log.args.launchpadId],
        blockNumber: log.blockNumber,
      }),
    ]);
    launchpads.push({
      ...mined(log, timestamps),
      eventType,
      launchpadId: log.args.launchpadId,
      owner: record.owner,
      feeRecipient: record.feeRecipient,
      admins: [...admins],
      name: record.identity.name,
      slug: record.identity.slug,
      metadataUri: record.identity.metadataURI,
      domain: record.identity.domain,
      xHandle: record.identity.xHandle,
      quoteToken: record.economics.quoteToken,
      tradeFeePips: record.economics.tradeFeePips,
      creatorSharePips: record.economics.creatorSharePips,
      launchpadSharePips: record.economics.launchpadSharePips,
      protocolSharePips: record.economics.protocolSharePips,
      lpCreatorSharePips: record.economics.lpCreatorSharePips,
      lpLaunchpadSharePips: record.economics.lpLaunchpadSharePips,
      lpProtocolSharePips: record.economics.lpProtocolSharePips,
      graduationThreshold: record.economics.graduationThreshold,
      curveTokenSupply: record.economics.curveTokenSupply,
      graduationTarget: Number(record.graduation.target) === 0 ? 'DAMM' : 'DLMM',
      startFeePips: record.graduation.startFeePips,
      endFeePips: record.graduation.endFeePips,
      feeDurationSeconds: record.graduation.durationSeconds,
      feeCurve: Number(record.graduation.feeCurve) === 0 ? 'linear' : 'exponential',
      protectionEnabled: record.protection.enabled,
      xRequired: record.protection.xRequired,
      devBuyCapPips: record.protection.devBuyCapPips,
      earlyBuyCapPips: record.protection.earlyBuyCapPips,
      earlyBuyDurationSeconds: record.protection.earlyBuyDurationSeconds,
      active: record.active,
    });
  }
  const supplyByLaunchpad = new Map(
    launchpads.map(value => [value.launchpadId, value.curveTokenSupply])
  );
  return {
    launchpads,
    launches: launchLogs.map(log => ({
      ...mined(log, timestamps),
      launchId: log.args.launchId,
      launchpadId: log.args.launchpadId,
      creator: log.args.creator,
      token: log.args.token,
      curve: log.args.curve,
      name: log.args.name,
      symbol: log.args.symbol,
      metadataUri: log.args.metadataURI,
      totalSupply: log.args.totalSupply,
      curveTokenSupply: supplyByLaunchpad.get(log.args.launchpadId) ?? 0n,
    })),
    trades: [
      ...buyLogs.map(log => ({
        ...mined(log, timestamps),
        curve: log.address,
        side: 'buy' as const,
        trader: log.args.buyer,
        recipient: log.args.recipient,
        quoteAmount: log.args.quoteIn,
        tokenAmount: log.args.tokenOut,
        feeAmount: log.args.fee,
        quoteReserve: log.args.quoteReserve,
        tokenInventory: log.args.tokenInventory,
        progressPips: log.args.progressPips,
      })),
      ...sellLogs.map(log => ({
        ...mined(log, timestamps),
        curve: log.address,
        side: 'sell' as const,
        trader: log.args.seller,
        recipient: log.args.recipient,
        quoteAmount: log.args.quoteOut,
        tokenAmount: log.args.tokenIn,
        feeAmount: log.args.fee,
        quoteReserve: log.args.quoteReserve,
        tokenInventory: log.args.tokenInventory,
        progressPips: log.args.progressPips,
      })),
    ],
    revenue: [
      ...feeLogs.map(log => ({
        ...mined(log, timestamps),
        curve: log.address,
        recipient: log.args.recipient,
        category: log.args.category,
        amount: log.args.amount,
      })),
      ...launchFeeLogs.flatMap(log => [
        {
          ...mined(log, timestamps),
          curve: log.args.curve,
          recipient: log.args.creatorRecipient,
          category: 0,
          token: log.args.token,
          amount: log.args.creatorAmount,
        },
        {
          ...mined(log, timestamps),
          curve: log.args.curve,
          recipient: log.args.launchpadRecipient,
          category: 1,
          token: log.args.token,
          amount: log.args.launchpadAmount,
        },
        {
          ...mined(log, timestamps),
          curve: log.args.curve,
          recipient: log.args.protocolRecipient,
          category: 2,
          token: log.args.token,
          amount: log.args.protocolAmount,
        },
      ]),
    ],
    graduations: graduationLogs.map(log => ({
      ...mined(log, timestamps),
      curve: log.args.curve,
      token: log.args.token,
      pool: log.args.pool,
      positionId: log.args.positionId,
      tokenAmount: log.args.tokenAmount,
      quoteAmount: log.args.quoteAmount,
    })),
  };
}

const revenueCategory = ['creator', 'launchpad', 'protocol'] as const;

function launchImage(metadataUri: string): string | null {
  try {
    const prefix = 'data:application/json;base64,';
    if (!metadataUri.startsWith(prefix)) return null;
    const metadata = JSON.parse(
      Buffer.from(metadataUri.slice(prefix.length), 'base64').toString('utf8')
    ) as { image?: unknown };
    return typeof metadata.image === 'string' ? metadata.image : null;
  } catch {
    return null;
  }
}

export async function persistLaunchEvents(
  transaction: Prisma.TransactionClient,
  chainId: number,
  batch: LaunchEventBatch
): Promise<void> {
  for (const event of batch.launchpads) {
    await transaction.launchpad.upsert({
      where: { chainId_launchpadId: { chainId, launchpadId: event.launchpadId } },
      create: {
        chainId,
        launchpadId: event.launchpadId,
        owner: event.owner.toLowerCase(),
        feeRecipient: event.feeRecipient.toLowerCase(),
        admins: event.admins.map(admin => admin.toLowerCase()),
        name: event.name,
        slug: event.slug,
        metadataUri: event.metadataUri,
        domain: event.domain,
        xHandle: event.xHandle,
        quoteToken: event.quoteToken.toLowerCase(),
        tradeFeePips: event.tradeFeePips,
        creatorSharePips: event.creatorSharePips,
        launchpadSharePips: event.launchpadSharePips,
        protocolSharePips: event.protocolSharePips,
        lpCreatorSharePips: event.lpCreatorSharePips,
        lpLaunchpadSharePips: event.lpLaunchpadSharePips,
        lpProtocolSharePips: event.lpProtocolSharePips,
        graduationThreshold: event.graduationThreshold.toString(),
        curveTokenSupply: event.curveTokenSupply.toString(),
        graduationTarget: event.graduationTarget,
        startFeePips: event.startFeePips,
        endFeePips: event.endFeePips,
        feeDurationSeconds: event.feeDurationSeconds,
        feeCurve: event.feeCurve,
        protectionEnabled: event.protectionEnabled,
        xRequired: event.xRequired,
        devBuyCapPips: event.devBuyCapPips,
        earlyBuyCapPips: event.earlyBuyCapPips,
        earlyBuyDurationSeconds: event.earlyBuyDurationSeconds,
        active: event.active,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        createdAt: event.timestamp,
      },
      update: {
        active: event.active,
        admins: event.admins.map(admin => admin.toLowerCase()),
        canonical: true,
      },
    });
    if (event.eventType === 'status') {
      await transaction.launchpadStatusEvent.upsert({
        where: {
          chainId_transactionHash_logIndex: {
            chainId,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
          },
        },
        create: {
          chainId,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          launchpadId: event.launchpadId,
          active: event.active,
          blockNumber: event.blockNumber,
          timestamp: event.timestamp,
        },
        update: { active: event.active, canonical: true },
      });
    }
    const topic = event.eventType === 'created' ? 'launchpad.new' : 'launchpad.update';
    const dedupKey = `${chainId}:${event.transactionHash}:${event.logIndex}:${topic}`;
    await transaction.outboxEvent.upsert({
      where: { dedupKey },
      create: {
        dedupKey,
        topic,
        aggregateId: event.slug,
        chainId,
        blockNumber: event.blockNumber,
        payload: {
          launchpadId: event.launchpadId.toString(),
          slug: event.slug,
          owner: event.owner.toLowerCase(),
          active: event.active,
        },
      },
      update: { canonical: true },
    });
  }

  for (const event of batch.launches) {
    const launchpad = await transaction.launchpad.findUnique({
      where: { chainId_launchpadId: { chainId, launchpadId: event.launchpadId } },
    });
    if (!launchpad) throw new Error('LAUNCHPAD_INDEX_MISSING');
    const curveTokenSupply =
      event.curveTokenSupply === 0n
        ? BigInt(launchpad.curveTokenSupply.toFixed(0))
        : event.curveTokenSupply;
    await transaction.launch.upsert({
      where: { chainId_launchId: { chainId, launchId: event.launchId } },
      create: {
        chainId,
        launchId: event.launchId,
        launchpadId: event.launchpadId,
        creator: event.creator.toLowerCase(),
        token: event.token.toLowerCase(),
        curve: event.curve.toLowerCase(),
        name: event.name,
        symbol: event.symbol,
        metadataUri: event.metadataUri,
        totalSupply: event.totalSupply.toString(),
        tokenInventory: curveTokenSupply.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        createdAt: event.timestamp,
      },
      update: { canonical: true },
    });
    await transaction.assetCatalog.upsert({
      where: { chainId_address: { chainId, address: event.token.toLowerCase() } },
      create: {
        chainId,
        address: event.token.toLowerCase(),
        source: 'launchpad',
        sourceAssetId: event.launchId.toString(),
        symbol: event.symbol,
        name: event.name,
        decimals: 18,
        logoUrl: launchImage(event.metadataUri),
        category: 'crypto',
        status: 'ASSET_STATUS_ACTIVE',
        sourceUpdatedAt: event.timestamp,
      },
      update: {
        source: 'launchpad',
        sourceAssetId: event.launchId.toString(),
        symbol: event.symbol,
        name: event.name,
        decimals: 18,
        logoUrl: launchImage(event.metadataUri),
        category: 'crypto',
        status: 'ASSET_STATUS_ACTIVE',
        sourceUpdatedAt: event.timestamp,
      },
    });
    const dedupKey = `${chainId}:${event.transactionHash}:${event.logIndex}:launch.new`;
    await transaction.outboxEvent.upsert({
      where: { dedupKey },
      create: {
        dedupKey,
        topic: 'launch.new',
        aggregateId: event.token.toLowerCase(),
        chainId,
        blockNumber: event.blockNumber,
        payload: {
          launchId: event.launchId.toString(),
          launchpadId: event.launchpadId.toString(),
          token: event.token.toLowerCase(),
          curve: event.curve.toLowerCase(),
          creator: event.creator.toLowerCase(),
        },
      },
      update: { canonical: true },
    });
  }

  const launchByCurve = new Map(
    (
      await transaction.launch.findMany({
        where: { chainId, canonical: true },
        include: { launchpad: { select: { owner: true } } },
      })
    ).map(launch => [launch.curve, launch])
  );
  for (const event of batch.trades) {
    const launch = launchByCurve.get(event.curve.toLowerCase());
    if (!launch) throw new Error('CURVE_LAUNCH_INDEX_MISSING');
    await transaction.curveTrade.upsert({
      where: {
        chainId_transactionHash_logIndex: {
          chainId,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
        },
      },
      create: {
        chainId,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        launchId: launch.launchId,
        side: event.side,
        trader: event.trader.toLowerCase(),
        recipient: event.recipient.toLowerCase(),
        quoteAmount: event.quoteAmount.toString(),
        tokenAmount: event.tokenAmount.toString(),
        feeAmount: event.feeAmount.toString(),
        quoteReserve: event.quoteReserve.toString(),
        tokenInventory: event.tokenInventory.toString(),
        progressPips: event.progressPips,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
      },
      update: { canonical: true },
    });
    await transaction.launch.update({
      where: { chainId_launchId: { chainId, launchId: launch.launchId } },
      data: {
        quoteReserve: event.quoteReserve.toString(),
        tokenInventory: event.tokenInventory.toString(),
        progressPips: event.progressPips,
      },
    });
    const dedupKey = `${chainId}:${event.transactionHash}:${event.logIndex}:launch.progress`;
    await transaction.outboxEvent.upsert({
      where: { dedupKey },
      create: {
        dedupKey,
        topic: 'launch.progress',
        aggregateId: launch.token,
        chainId,
        blockNumber: event.blockNumber,
        payload: {
          launchId: launch.launchId.toString(),
          launchpadId: launch.launchpadId.toString(),
          token: launch.token,
          side: event.side,
          trader: event.trader.toLowerCase(),
          quoteAmountRaw: event.quoteAmount.toString(),
          tokenAmountRaw: event.tokenAmount.toString(),
          progressPips: event.progressPips,
        },
      },
      update: { canonical: true },
    });
  }

  for (const event of batch.revenue) {
    const launch = launchByCurve.get(event.curve.toLowerCase());
    if (!launch) throw new Error('CURVE_LAUNCH_INDEX_MISSING');
    const launchpad = await transaction.launchpad.findUniqueOrThrow({
      where: { chainId_launchpadId: { chainId, launchpadId: launch.launchpadId } },
    });
    const category = revenueCategory[event.category];
    if (!category) throw new Error('INVALID_LAUNCH_REVENUE_CATEGORY');
    await transaction.launchpadRevenue.upsert({
      where: {
        chainId_transactionHash_logIndex_category: {
          chainId,
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          category,
        },
      },
      create: {
        chainId,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        launchId: launch.launchId,
        recipient: event.recipient.toLowerCase(),
        category,
        token: event.token?.toLowerCase() ?? launchpad.quoteToken,
        amount: event.amount.toString(),
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
      },
      update: { canonical: true },
    });
    const revenueDedupKey = `${chainId}:${event.transactionHash}:${event.logIndex}:${category}:launch.revenue`;
    await transaction.outboxEvent.upsert({
      where: { dedupKey: revenueDedupKey },
      create: {
        dedupKey: revenueDedupKey,
        topic: 'launch.revenue',
        aggregateId: launch.token,
        chainId,
        blockNumber: event.blockNumber,
        payload: {
          launchId: launch.launchId.toString(),
          launchpadId: launch.launchpadId.toString(),
          token: launch.token,
          feeToken: event.token?.toLowerCase() ?? launchpad.quoteToken,
          category,
          amountRaw: event.amount.toString(),
        },
      },
      update: { canonical: true },
    });
  }

  for (const event of batch.graduations) {
    const launch = launchByCurve.get(event.curve.toLowerCase());
    if (!launch) throw new Error('CURVE_LAUNCH_INDEX_MISSING');
    const existingGraduation = await transaction.graduation.findUnique({
      where: { chainId_launchId: { chainId, launchId: launch.launchId } },
      select: { launchId: true },
    });
    await transaction.graduation.upsert({
      where: { chainId_launchId: { chainId, launchId: launch.launchId } },
      create: {
        chainId,
        launchId: launch.launchId,
        pool: event.pool.toLowerCase(),
        positionId: event.positionId,
        tokenAmount: event.tokenAmount.toString(),
        quoteAmount: event.quoteAmount.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
      },
      update: { canonical: true },
    });
    await transaction.launch.update({
      where: { chainId_launchId: { chainId, launchId: launch.launchId } },
      data: {
        status: 'graduated',
        progressPips: 1_000_000,
        quoteReserve: '0',
        tokenInventory: '0',
      },
    });
    const creatorWallet = await transaction.wallet.findUnique({
      where: { address: launch.creator },
      select: { userId: true },
    });
    const wallet =
      creatorWallet ??
      (await transaction.wallet.findUnique({
        where: { address: launch.launchpad.owner },
        select: { userId: true },
      }));
    const position = await transaction.position.findUnique({
      where: { chainId_id: { chainId, id: event.positionId } },
    });
    if (wallet && position) {
      const callout = await transaction.callout.upsert({
        where: { chainId_positionId: { chainId, positionId: event.positionId } },
        create: {
          userId: wallet.userId,
          kind: 'launch_lp',
          launchId: launch.launchId,
          chainId,
          positionId: event.positionId,
          poolId: position.poolId,
          caption: `${launch.symbol} graduated. Launch liquidity is permanently locked.`,
          showSize: true,
          shape: position.shape,
          lowerBin: position.lowerBin,
          upperBin: position.upperBin,
          createdAt: event.timestamp,
          status: 'live',
        },
        update: { kind: 'launch_lp', launchId: launch.launchId, canonical: true },
      });
      const calloutKey = `${chainId}:${event.transactionHash}:${event.logIndex}:callout.new`;
      await transaction.outboxEvent.upsert({
        where: { dedupKey: calloutKey },
        create: {
          dedupKey: calloutKey,
          topic: 'callout.new',
          aggregateId: event.pool.toLowerCase(),
          chainId,
          blockNumber: event.blockNumber,
          payload: {
            id: callout.id,
            kind: 'launch_lp',
            launchId: launch.launchId.toString(),
            positionId: event.positionId.toString(),
            pool: event.pool.toLowerCase(),
          },
        },
        update: { canonical: true },
      });
    }
    const dedupKey = `${chainId}:${event.transactionHash}:${event.logIndex}:launch.graduated`;
    await transaction.outboxEvent.upsert({
      where: { dedupKey },
      create: {
        dedupKey,
        topic: 'launch.graduated',
        aggregateId: launch.token,
        chainId,
        blockNumber: event.blockNumber,
        payload: {
          launchId: launch.launchId.toString(),
          launchpadId: launch.launchpadId.toString(),
          token: launch.token,
          pool: event.pool.toLowerCase(),
          positionId: event.positionId.toString(),
          locked: true,
        },
      },
      update: { canonical: true },
    });
    if (!existingGraduation) {
      const trades = await transaction.curveTrade.findMany({
        where: { chainId, launchId: launch.launchId, canonical: true },
        select: { side: true, trader: true, recipient: true, tokenAmount: true },
      });
      const balances = new Map<string, bigint>();
      for (const trade of trades) {
        const address = (trade.side === 'buy' ? trade.recipient : trade.trader).toLowerCase();
        const delta = BigInt(trade.tokenAmount.toFixed(0)) * (trade.side === 'buy' ? 1n : -1n);
        balances.set(address, (balances.get(address) ?? 0n) + delta);
      }
      for (const [address, balance] of balances) {
        if (balance <= 0n) continue;
        const holder = await transaction.wallet.findUnique({ where: { address }, select: { userId: true } });
        if (!holder) continue;
        const notification = await transaction.notification.create({
          data: {
            userId: holder.userId,
            type: 'launch_graduated',
            entityType: 'launch',
            entityId: launch.token,
            payload: { token: launch.token, symbol: launch.symbol, pool: event.pool.toLowerCase() },
          },
        });
        await transaction.outboxEvent.create({
          data: {
            dedupKey: `notification:${notification.id}`,
            topic: 'notification.new',
            aggregateId: holder.userId,
            chainId,
            blockNumber: event.blockNumber,
            payload: { notificationId: notification.id, userId: holder.userId, type: 'launch_graduated' },
          },
        });
      }
    }
  }
}
