'use client';

import {
  ApiLaunchDetailSchema,
  ApiTokenLaunchPreparationSchema,
  type ApiTokenLaunchPreparation,
} from '@fomeora/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { decodeEventLog, formatUnits, parseAbiItem, parseUnits } from 'viem';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { useSession } from '@/features/session/store';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';
const shortAddress = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;
const tokenLaunchedEvent = parseAbiItem(
  'event TokenLaunched(uint256 indexed launchId, uint256 indexed launchpadId, address indexed creator, address token, address curve, string name, string symbol, string metadataURI, uint256 totalSupply)'
);

export function LaunchTokenForm({
  launchpadId,
  launchpadSlug,
  curveTokenSupplyRaw,
  protectionEnabled,
  devBuyCapPips,
  xRequired,
}: {
  launchpadId: string;
  launchpadSlug: string;
  curveTokenSupplyRaw: string;
  protectionEnabled: boolean;
  devBuyCapPips: number;
  xRequired: boolean;
}) {
  const router = useRouter();
  const wallet = useWallet();
  const { user, openSignIn } = useSession();
  const curveTokenSupply = BigInt(curveTokenSupplyRaw);
  const maximumDeveloperAllocation = protectionEnabled
    ? (curveTokenSupply * BigInt(devBuyCapPips)) / 1_000_000n
    : curveTokenSupply;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [creatorAllocation, setCreatorAllocation] = useState('0');
  const [prepared, setPrepared] = useState<ApiTokenLaunchPreparation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [launchedToken, setLaunchedToken] = useState<string | null>(null);
  const identityLinked = Boolean(
    wallet.account &&
    user?.wallets.some(address => address.toLowerCase() === wallet.account?.toLowerCase())
  );
  const identityLinkRequired = xRequired && !identityLinked;
  useEffect(() => {
    if (!launchedToken) return;
    let stopped = false;
    let timer: number | null = null;
    const deadline = Date.now() + 120_000;
    const reconcile = async () => {
      try {
        await browserApiRequest(`/v1/launches/${launchedToken}`, ApiLaunchDetailSchema);
        if (!stopped) router.replace(`/t/${launchedToken}`);
      } catch {
        if (!stopped && Date.now() < deadline) timer = window.setTimeout(reconcile, 4_000);
      }
    };
    void reconcile();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [launchedToken, router]);
  useEffect(() => {
    if (!user?.handle || xHandle) return;
    setXHandle(user.handle.replace(/^@/, ''));
  }, [user?.handle, xHandle]);
  let creatorAllocationRaw: bigint | null = null;
  try {
    creatorAllocationRaw = parseUnits(creatorAllocation || '0', 18);
  } catch {
    creatorAllocationRaw = null;
  }
  const allocationValid =
    creatorAllocationRaw !== null &&
    creatorAllocationRaw >= 0n &&
    creatorAllocationRaw <= maximumDeveloperAllocation;
  const totalSupply = allocationValid
    ? formatUnits(curveTokenSupply + (creatorAllocationRaw ?? 0n), 18)
    : formatUnits(curveTokenSupply, 18);
  const prepare = async () => {
    if (!wallet.account) return void wallet.connect();
    if (xRequired && !identityLinked) return void openSignIn();
    if (wallet.config && wallet.chainId !== wallet.config.chainId)
      return void wallet.switchNetwork();
    setBusy(true);
    setError(null);
    try {
      setPrepared(
        await browserApiRequest(
          `/v1/launchpads/${launchpadId}/launch-prepare`,
          ApiTokenLaunchPreparationSchema,
          {
            method: 'POST',
            body: {
              walletAddress: wallet.account,
              name,
              symbol,
              imageUrl,
              website,
              xHandle: identityLinked ? xHandle : '',
              totalSupply,
            },
          }
        )
      );
    } catch (cause) {
      setError(
        friendlyErrorMessage(
          cause instanceof Error ? cause.message : 'TOKEN_LAUNCH_PREPARATION_FAILED'
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!prepared || !wallet.account) throw new Error('TOKEN_LAUNCH_PREPARATION_REQUIRED');
    const hash = await sendPreparedTransaction(prepared.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('TOKEN_LAUNCH_REVERTED', hash);
    setConfirmed(true);
    const launched = receipt.logs
      .map(log => {
        try {
          return decodeEventLog({
            abi: [tokenLaunchedEvent],
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .find(event => event?.eventName === 'TokenLaunched');
    if (launched?.eventName === 'TokenLaunched') {
      setLaunchedToken(launched.args.token);
    }
    return hash;
  };
  if (!open)
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Launch token
      </Button>
    );
  const allocationHint = protectionEnabled
    ? `Optional · maximum ${formatUnits(maximumDeveloperAllocation, 18)} tokens under this launchpad's developer cap`
    : `Optional · tokens transferred directly to the creator wallet at launch`;
  return (
    <section className="glass w-full rounded-[2px] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="t-label text-signal">Creator flow</p>
          <h2 className="mt-2 text-xl font-medium">Launch a token</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Define the token identity and creator allocation. Review creates the token and opens its
            fully on-chain bonding curve in one wallet transaction.
          </p>
        </div>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </div>
      {confirmed ? (
        <div className="mt-6 border border-up/40 bg-up/5 p-5">
          <p className="font-medium text-up">Token launch confirmed on-chain</p>
          <p className="mt-2 text-sm text-muted">
            {launchedToken
              ? 'Indexing the new curve now. Its token page will open automatically.'
              : 'The token page and curve will appear as soon as the safe block is indexed.'}
          </p>
          <a
            href={`/feed?launchpad=${encodeURIComponent(launchpadSlug)}`}
            className="t-label mt-4 inline-flex min-h-11 items-center text-signal underline underline-offset-4"
          >
            Open launchpad feed
          </a>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <Field
              label="Token name"
              value={name}
              onChange={value => {
                setName(value);
                setPrepared(null);
              }}
            />
            <Field
              label="Ticker"
              value={symbol}
              onChange={value => {
                setSymbol(value.toUpperCase());
                setPrepared(null);
              }}
            />
            <Field
              label="Token image URL"
              value={imageUrl}
              onChange={value => {
                setImageUrl(value);
                setPrepared(null);
              }}
              hint="HTTPS image used on launch cards and token pages"
            />
            <Field
              label="Website · optional"
              value={website}
              onChange={value => {
                setWebsite(value);
                setPrepared(null);
              }}
            />
            <Field
              label="X handle · optional"
              value={xHandle}
              onChange={value => {
                setXHandle(value);
                setPrepared(null);
              }}
              hint={
                identityLinked
                  ? 'Verified from the X profile linked to this wallet'
                  : 'Connect X to attach a verified handle; wallet-only launches leave this empty'
              }
              disabled={identityLinked}
            />
            <Field
              label="Creator allocation · optional"
              value={creatorAllocation}
              onChange={value => {
                setCreatorAllocation(value);
                setPrepared(null);
              }}
              hint={allocationHint}
            />
            <ReadOnlyField
              label="Total supply"
              value={totalSupply}
              hint={`Curve supply · ${formatUnits(curveTokenSupply, 18)}`}
            />
          </div>
          {xRequired ? (
            <div
              className={`mt-5 flex flex-wrap items-center justify-between gap-4 border p-4 ${identityLinkRequired ? 'border-signal/50 bg-signal/5' : 'border-up/40 bg-up/5'}`}
            >
              <div>
                <p className={`t-label ${identityLinkRequired ? 'text-signal' : 'text-up'}`}>
                  {identityLinkRequired ? 'Creator identity required' : 'Creator identity ready'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {identityLinkRequired
                    ? 'Connect X and link the active wallet before reviewing this launch.'
                    : `@${user?.handle ?? xHandle} is linked to the active wallet. A one-use proof will be generated during review.`}
                </p>
              </div>
              {identityLinkRequired ? (
                <Button variant="primary" onClick={openSignIn}>
                  Connect identity
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5">
            {prepared ? (
              <section className="border border-line-strong bg-panel-2 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-1 font-mono">
                      <img
                        src={imageUrl}
                        alt={`${name} token logo`}
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="t-label text-signal">Token launch review</p>
                      <h3 className="mt-1 truncate text-xl font-medium">
                        {name} <span className="text-muted">/ {symbol}</span>
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted">
                        {website || 'No website attached'}
                      </p>
                    </div>
                  </div>
                  <span className="t-label border border-up/40 px-2.5 py-1.5 text-up">
                    Ready to launch
                  </span>
                </div>

                <dl className="grid gap-x-8 gap-y-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
                  <ReviewRow label="Curve supply" value={formatUnits(curveTokenSupply, 18)} />
                  <ReviewRow label="Creator allocation" value={creatorAllocation || '0'} />
                  <ReviewRow label="Total supply" value={totalSupply} />
                  <ReviewRow
                    label="Creator identity"
                    value={identityLinked ? `@${user?.handle ?? xHandle}` : 'Wallet only'}
                  />
                  <ReviewRow label="Creator wallet" value={shortAddress(wallet.account ?? '')} />
                  <ReviewRow label="Launchpad" value={`#${launchpadId} · /${launchpadSlug}`} />
                  <ReviewRow
                    label="Identity proof"
                    value={prepared.identityRequired ? 'Required · one use' : 'Not required'}
                  />
                  <ReviewRow label="Launch factory" value={shortAddress(prepared.launchFactory)} />
                  <ReviewRow
                    label="Review expires"
                    value={new Date(prepared.expiresAt).toLocaleTimeString()}
                  />
                </dl>

                <p className="border-y border-line py-3 text-sm text-muted">
                  Confirming creates the fixed-supply token and opens its bonding curve. Review the
                  name, ticker and supply carefully; these values cannot be edited after launch.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <Button onClick={() => setPrepared(null)}>Edit details</Button>
                  <TxButton
                    label="Confirm token launch"
                    error={null}
                    onExecute={execute}
                    pendingLabel="Launching token…"
                  />
                </div>
              </section>
            ) : (
              <Button
                variant="primary"
                block
                disabled={
                  busy || name.length < 2 || symbol.length < 2 || !imageUrl || !allocationValid
                }
                onClick={() => void prepare()}
              >
                {busy ? 'Preparing launch…' : 'Review token launch'}
              </Button>
            )}
          </div>
          <p role="alert" className="mt-3 min-h-5 text-sm text-down">
            {error}
          </p>
        </>
      )}
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-label text-faint">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="t-label text-muted">
      {label}
      <div className={`${control} flex items-center text-faint`} aria-readonly="true">
        {value}
      </div>
      <span className="mt-2 block text-[0.625rem] leading-relaxed text-faint">{hint}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="t-label text-muted">
      {label}
      <input
        className={control}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />
      {hint ? (
        <span className="mt-2 block text-[0.625rem] leading-relaxed text-faint">{hint}</span>
      ) : null}
    </label>
  );
}
