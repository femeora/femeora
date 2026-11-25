'use client';

import {
  ApiLaunchpadDetailSchema,
  ApiLaunchpadStatusPreparationSchema,
  ApiGraduationPreparationSchema,
  ApiPoolAssetListSchema,
  type ApiLaunch,
  type ApiLaunchpadDetail,
  type ApiLaunchpadStatusPreparation,
} from '@fomeora/types';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { openApiEventStream } from '@/lib/api/realtime';
import { useApiResource } from '@/lib/api/useApiResource';

import { LaunchCard } from './LaunchCard';
import { LaunchTokenForm } from './LaunchTokenForm';

export function LaunchpadSurface({ initial }: { initial: ApiLaunchpadDetail }) {
  const wallet = useWallet();
  const [statusPreparation, setStatusPreparation] = useState<ApiLaunchpadStatusPreparation | null>(
    null
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmedStatus, setConfirmedStatus] = useState<{
    active: boolean;
    expiresAt: number;
  } | null>(null);
  const resource = useApiResource(
    `/v1/launchpads/${encodeURIComponent(initial.slug)}`,
    ApiLaunchpadDetailSchema,
    {
      fallbackData: initial,
    }
  );
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const refreshLaunchpad = resource.mutate;
  const pad = resource.data ?? initial;
  const assetsByAddress = new Map(
    (assets.data?.data ?? []).map(asset => [asset.address.toLowerCase(), asset])
  );
  const quoteAsset = assetsByAddress.get(pad.quoteToken.toLowerCase());
  const quoteDecimals = quoteAsset?.decimals ?? 18;
  const quoteSymbol = quoteAsset?.symbol ?? 'quote';
  const formatRaw = (value: string, decimals = quoteDecimals) =>
    Number(formatUnits(BigInt(value), decimals)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  const canManage = Boolean(
    wallet.account &&
    (wallet.account.toLowerCase() === pad.owner.toLowerCase() ||
      pad.admins.some(admin => admin.toLowerCase() === wallet.account?.toLowerCase()))
  );
  const prepareStatus = async () => {
    if (!wallet.account) return void wallet.connect();
    if (wallet.config && wallet.chainId !== wallet.config.chainId)
      return void wallet.switchNetwork();
    setStatusError(null);
    try {
      setStatusPreparation(
        await browserApiRequest(
          `/v1/launchpads/${pad.id}/status-prepare`,
          ApiLaunchpadStatusPreparationSchema,
          { method: 'POST', body: { walletAddress: wallet.account, active: !pad.active } }
        )
      );
    } catch (cause) {
      setStatusError(
        friendlyErrorMessage(
          cause instanceof Error ? cause.message : 'LAUNCHPAD_STATUS_PREPARATION_FAILED'
        )
      );
    }
  };
  const executeStatus = async () => {
    if (!statusPreparation || !wallet.account)
      throw new Error('LAUNCHPAD_STATUS_PREPARATION_REQUIRED');
    if (Date.now() >= Date.parse(statusPreparation.expiresAt))
      throw new Error('LAUNCHPAD_PREPARATION_EXPIRED');
    const expectedActive = !pad.active;
    const hash = await sendPreparedTransaction(statusPreparation.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('LAUNCHPAD_STATUS_REVERTED', hash);
    setStatusPreparation(null);
    setConfirmedStatus({ active: expectedActive, expiresAt: Date.now() + 120_000 });
    void refreshLaunchpad();
    return hash;
  };
  const distributeLaunchFees = async (launch: ApiLaunch) => {
    if (!wallet.account) {
      await wallet.connect();
      throw new Error('WALLET_CONNECTION_REQUIRED');
    }
    if (wallet.config && wallet.chainId !== wallet.config.chainId) {
      await wallet.switchNetwork();
      throw new Error('NETWORK_SWITCH_REQUIRED');
    }
    const preparation = await browserApiRequest(
      `/v1/launches/${launch.token}/fees-claim-prepare`,
      ApiGraduationPreparationSchema,
      { method: 'POST', body: { walletAddress: wallet.account } }
    );
    const hash = await sendPreparedTransaction(preparation.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('LAUNCH_FEE_CLAIM_REVERTED', hash);
    await refreshLaunchpad();
    return hash;
  };

  useEffect(
    () =>
      openApiEventStream(`/v1/launchpads/${encodeURIComponent(initial.slug)}/stream`, {
        onMessage: message => {
          const payload = message.payload as { launchpadId?: unknown } | null;
          if (payload?.launchpadId === initial.id) void refreshLaunchpad();
        },
      }),
    [initial.id, initial.slug, refreshLaunchpad]
  );

  useEffect(() => {
    if (!confirmedStatus) return;
    if (pad.active === confirmedStatus.active || Date.now() >= confirmedStatus.expiresAt) {
      setConfirmedStatus(null);
      return;
    }
    const timer = window.setInterval(() => void refreshLaunchpad(), 4_000);
    return () => window.clearInterval(timer);
  }, [confirmedStatus, pad.active, refreshLaunchpad]);

  return (
    <section className="px-gutter py-8">
      {pad.bannerUrl ? (
        <div className="mb-5 h-40 overflow-hidden rounded-[2px] border border-line">
          <img
            src={pad.bannerUrl}
            alt={`${pad.name} banner`}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        </div>
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-2 font-mono text-lg">
            {pad.logoUrl ? (
              <img
                src={pad.logoUrl}
                alt={`${pad.name} logo`}
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
            ) : (
              pad.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <div>
            <p className="t-label text-signal">Launchpad · /{pad.slug}</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight">{pad.name}</h1>
            <p className="mt-1 text-muted">
              @{pad.xHandle}
              {pad.domain ? ` · ${pad.domain}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pad.active ? (
            <LaunchTokenForm
              launchpadId={pad.id}
              launchpadSlug={pad.slug}
              curveTokenSupplyRaw={pad.curveTokenSupplyRaw}
              protectionEnabled={pad.protection.enabled}
              devBuyCapPips={pad.protection.devBuyCapPips}
              xRequired={pad.protection.xRequired}
            />
          ) : (
            <span className="t-label border border-line px-3 py-2 text-muted">Launches paused</span>
          )}
          {canManage ? (
            statusPreparation ? (
              <TxButton
                label={pad.active ? 'Confirm pause' : 'Confirm activation'}
                error={null}
                onExecute={executeStatus}
                pendingLabel="Updating launchpad…"
              />
            ) : (
              <Button onClick={() => void prepareStatus()}>
                {pad.active ? 'Pause launches' : 'Activate launchpad'}
              </Button>
            )
          ) : null}
        </div>
      </header>
      {statusError ? (
        <p role="alert" className="mt-3 text-sm text-down">
          {statusError}
        </p>
      ) : null}
      {confirmedStatus ? (
        <p role="status" className="t-label mt-3 text-signal">
          Confirmed on-chain · syncing launchpad status
        </p>
      ) : null}
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Launches" value={String(pad.dashboard.launches)} />
        <Metric label="Live curves" value={String(pad.dashboard.liveCurves)} />
        <Metric label="Graduations" value={String(pad.dashboard.graduations)} />
        <Metric
          label="Graduation rate"
          value={
            pad.dashboard.launches === 0
              ? '0%'
              : `${((pad.dashboard.graduations / pad.dashboard.launches) * 100).toFixed(1)}%`
          }
        />
        <Metric label="Trade fee" value={`${pad.tradeFeePips / 10_000}%`} />
        <Metric
          label={`Curve volume · ${quoteSymbol}`}
          value={formatRaw(pad.dashboard.volumeQuoteRaw)}
        />
        <Metric
          label={`Creator revenue · ${quoteSymbol}`}
          value={formatRaw(pad.dashboard.creatorRevenueRaw)}
        />
        <Metric
          label={`Launchpad revenue · ${quoteSymbol}`}
          value={formatRaw(pad.dashboard.launchpadRevenueRaw)}
        />
        <Metric
          label={`Protocol revenue · ${quoteSymbol}`}
          value={formatRaw(pad.dashboard.protocolRevenueRaw)}
        />
      </dl>
      {pad.dashboard.revenueByToken.length ? (
        <div className="glass mt-4 overflow-x-auto p-4">
          <p className="t-label text-faint">Revenue by token</p>
          <table className="mt-3 w-full min-w-[620px] text-left font-mono text-sm">
            <thead className="text-faint">
              <tr>
                <th className="pb-2 font-normal">Token</th>
                <th className="pb-2 font-normal">Creator</th>
                <th className="pb-2 font-normal">Launchpad</th>
                <th className="pb-2 font-normal">Protocol</th>
              </tr>
            </thead>
            <tbody>
              {pad.dashboard.revenueByToken.map(row => {
                const asset = assetsByAddress.get(row.token.toLowerCase());
                const decimals = asset?.decimals ?? 18;
                return (
                  <tr key={row.token} className="border-t border-line">
                    <td className="py-2">
                      {asset?.symbol ?? `${row.token.slice(0, 8)}…${row.token.slice(-4)}`}
                    </td>
                    <td className="py-2">{formatRaw(row.creatorRaw, decimals)}</td>
                    <td className="py-2">{formatRaw(row.launchpadRaw, decimals)}</td>
                    <td className="py-2">{formatRaw(row.protocolRaw, decimals)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-10 flex items-end justify-between border-b border-line pb-3">
        <div>
          <p className="t-label text-up">Launchpad feed</p>
          <h2 className="mt-1 text-xl font-medium">Tokens and graduations</h2>
        </div>
        <p className="t-label text-muted">{pad.launches.length} launches</p>
      </div>
      {pad.launches.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pad.launches.map(launch => (
            <li key={launch.id}>
              <LaunchCard launch={launch} />
              {launch.status === 'graduated' ? (
                <div className="mt-2">
                  <TxButton
                    label="Distribute accrued Launch LP fees"
                    error={null}
                    onExecute={() => distributeLaunchFees(launch)}
                    pendingLabel="Distributing Launch LP fees…"
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass mt-4 p-8 text-center">
          <h3 className="text-lg font-medium">No tokens launched yet.</h3>
          <p className="mt-2 text-muted">
            The first confirmed token launch will appear here and in the global feed.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass min-w-0 p-4">
      <dt className="t-label text-faint">{label}</dt>
      <dd className="mt-2 truncate font-mono text-lg">{value}</dd>
    </div>
  );
}
