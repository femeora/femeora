'use client';

import {
  ApiLaunchpadDetailSchema,
  ApiLaunchpadPreparationSchema,
  ApiPoolAssetListSchema,
  type ApiLaunchpadPreparation,
} from '@fomeora/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { useSession } from '@/features/session/store';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { useApiResource } from '@/lib/api/useApiResource';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';
const steps = ['Identity', 'Ownership', 'Economics', 'Protection'] as const;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const parseAdmins = (value: string) =>
  value
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean);

export function LaunchpadWizard() {
  const router = useRouter();
  const wallet = useWallet();
  const { user, openSignIn } = useSession();
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const quoteAssets = useMemo(
    () =>
      assets.data?.data.filter(
        asset => asset.executable && ['USDG', 'WETH'].includes(asset.symbol.toUpperCase())
      ) ?? [],
    [assets.data]
  );
  const [step, setStep] = useState(0);
  const [prepared, setPrepared] = useState<ApiLaunchpadPreparation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    logoUrl: '',
    bannerUrl: '',
    domain: '',
    xHandle: '',
    feeRecipient: '',
    admins: '',
    quoteToken: '',
    tradeFee: '0.3',
    creatorShare: '50',
    launchpadShare: '30',
    protocolShare: '20',
    lpCreatorShare: '50',
    lpLaunchpadShare: '25',
    lpProtocolShare: '25',
    graduationThreshold: '5000',
    curveTokenSupply: '800000000',
    startFee: '50',
    endFee: '0.3',
    feeDurationMinutes: '30',
    feeCurve: 'linear' as 'linear' | 'exponential',
    protectionEnabled: true,
    xRequired: true,
    devBuyCap: '5',
    earlyBuyCap: '1',
    earlyBuyMinutes: '10',
  });
  useEffect(() => {
    if (!confirmed || !form.slug) return;
    let stopped = false;
    let timer: number | null = null;
    const deadline = Date.now() + 120_000;
    const reconcile = async () => {
      try {
        await browserApiRequest(
          `/v1/launchpads/${encodeURIComponent(form.slug)}`,
          ApiLaunchpadDetailSchema
        );
        if (!stopped) router.replace(`/lp/${form.slug}`);
      } catch {
        if (!stopped && Date.now() < deadline) timer = window.setTimeout(reconcile, 4_000);
      }
    };
    void reconcile();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [confirmed, form.slug, router]);
  useEffect(() => {
    if (!user?.handle || form.xHandle) return;
    setForm(current => ({ ...current, xHandle: user.handle.replace(/^@/, '') }));
  }, [form.xHandle, user?.handle]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setPrepared(null);
    setError(null);
  };
  const account = wallet.account;
  const feeShares =
    Number(form.creatorShare) + Number(form.launchpadShare) + Number(form.protocolShare);
  const lpFeeShares =
    Number(form.lpCreatorShare) + Number(form.lpLaunchpadShare) + Number(form.lpProtocolShare);
  const admins = parseAdmins(form.admins);
  const validIdentity =
    form.name.trim().length >= 2 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) &&
    /^https?:\/\//.test(form.logoUrl) &&
    /^@?[A-Za-z0-9_]{1,15}$/.test(form.xHandle);
  const validOwnership = Boolean(
    account &&
    user?.wallets.some(walletAddress => walletAddress.toLowerCase() === account.toLowerCase()) &&
    form.feeRecipient &&
    addressPattern.test(form.feeRecipient) &&
    admins.length <= 10 &&
    admins.every(address => addressPattern.test(address)) &&
    new Set(admins.map(address => address.toLowerCase())).size === admins.length &&
    !admins.some(address => address.toLowerCase() === account.toLowerCase())
  );
  const validEconomics = Boolean(
    form.quoteToken &&
    Number(form.tradeFee) > 0 &&
    feeShares === 100 &&
    lpFeeShares === 100 &&
    Number(form.graduationThreshold) > 0 &&
    Number(form.curveTokenSupply) > 0 &&
    Number(form.startFee) > Number(form.endFee) &&
    Number(form.feeDurationMinutes) > 0
  );
  const validProtection =
    !form.protectionEnabled ||
    (Number(form.devBuyCap) >= 0 &&
      Number(form.devBuyCap) <= 100 &&
      Number(form.earlyBuyCap) >= 0 &&
      Number(form.earlyBuyCap) <= 100 &&
      Number(form.earlyBuyMinutes) >= 0);
  const validSteps = [validIdentity, validOwnership, validEconomics, validProtection];

  const continueStep = () => {
    if (!validSteps[step]) return;
    if (step < steps.length - 1) setStep(value => value + 1);
  };
  const prepare = async () => {
    if (!user) return void openSignIn();
    if (!account) return void wallet.connect();
    if (!user.wallets.some(walletAddress => walletAddress.toLowerCase() === account.toLowerCase()))
      return void openSignIn();
    if (wallet.config && wallet.chainId !== wallet.config.chainId)
      return void wallet.switchNetwork();
    setBusy(true);
    setError(null);
    try {
      const result = await browserApiRequest(
        '/v1/launchpads/prepare',
        ApiLaunchpadPreparationSchema,
        {
          method: 'POST',
          body: {
            walletAddress: account,
            feeRecipient: form.feeRecipient,
            admins,
            identity: {
              name: form.name.trim(),
              slug: form.slug,
              logoUrl: form.logoUrl.trim(),
              bannerUrl: form.bannerUrl.trim(),
              domain: form.domain.trim(),
              xHandle: form.xHandle,
            },
            economics: {
              quoteToken: form.quoteToken,
              tradeFeePips: Math.round(Number(form.tradeFee) * 10_000),
              creatorSharePips: Math.round(Number(form.creatorShare) * 10_000),
              launchpadSharePips: Math.round(Number(form.launchpadShare) * 10_000),
              protocolSharePips: Math.round(Number(form.protocolShare) * 10_000),
              lpCreatorSharePips: Math.round(Number(form.lpCreatorShare) * 10_000),
              lpLaunchpadSharePips: Math.round(Number(form.lpLaunchpadShare) * 10_000),
              lpProtocolSharePips: Math.round(Number(form.lpProtocolShare) * 10_000),
              graduationThreshold: form.graduationThreshold,
              curveTokenSupply: form.curveTokenSupply,
            },
            graduation: {
              startFeePips: Math.round(Number(form.startFee) * 10_000),
              endFeePips: Math.round(Number(form.endFee) * 10_000),
              durationSeconds: Math.round(Number(form.feeDurationMinutes) * 60),
              feeCurve: form.feeCurve,
            },
            protection: {
              enabled: form.protectionEnabled,
              xRequired: form.protectionEnabled && form.xRequired,
              devBuyCapPips: form.protectionEnabled
                ? Math.round(Number(form.devBuyCap) * 10_000)
                : 1_000_000,
              earlyBuyCapPips: form.protectionEnabled
                ? Math.round(Number(form.earlyBuyCap) * 10_000)
                : 1_000_000,
              earlyBuyDurationSeconds: form.protectionEnabled
                ? Math.round(Number(form.earlyBuyMinutes) * 60)
                : 0,
            },
          },
        }
      );
      setPrepared(result);
    } catch (cause) {
      setError(
        friendlyErrorMessage(
          cause instanceof Error ? cause.message : 'LAUNCHPAD_PREPARATION_FAILED'
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!prepared || !account) throw new Error('LAUNCHPAD_PREPARATION_REQUIRED');
    if (Date.now() >= Date.parse(prepared.expiresAt))
      throw new Error('LAUNCHPAD_PREPARATION_EXPIRED');
    const hash = await sendPreparedTransaction(prepared.transaction, account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('LAUNCHPAD_CREATE_REVERTED', hash);
    setConfirmed(true);
    return hash;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <section className="glass rounded-[2px] p-5 sm:p-6">
        <ol className="grid grid-cols-2 gap-2 border-b border-line pb-5 sm:grid-cols-4">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={`t-label min-h-11 w-full border px-3 ${index === step ? 'border-signal bg-signal/10 text-signal' : index < step ? 'border-line-strong text-fg' : 'border-line text-faint'}`}
              >
                {String(index + 1).padStart(2, '0')} · {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="mt-6">
            <h2 className="text-xl font-medium">Launchpad identity</h2>
            <p className="mt-2 text-sm text-muted">
              Brand the social surface creators and buyers will recognize. Femeora stores the
              resulting metadata URI on-chain.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                label="Name"
                value={form.name}
                onChange={value => {
                  set('name', value);
                  if (!form.slug)
                    set(
                      'slug',
                      value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                    );
                }}
              />
              <Field
                label="Feed slug"
                value={form.slug}
                onChange={value => set('slug', value.toLowerCase())}
                hint="femeora.tech/lp/your-slug"
              />
              <Field
                label="Logo URL"
                value={form.logoUrl}
                onChange={value => set('logoUrl', value)}
              />
              <Field
                label="Banner URL · optional"
                value={form.bannerUrl}
                onChange={value => set('bannerUrl', value)}
              />
              <Field
                label="Domain · optional"
                value={form.domain}
                onChange={value => set('domain', value)}
              />
              <Field
                label="X handle"
                value={form.xHandle}
                onChange={value => set('xHandle', value)}
              />
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="mt-6">
            <h2 className="text-xl font-medium">Ownership</h2>
            <p className="mt-2 text-sm text-muted">
              The connected wallet owns the launchpad. Revenue can be sent to a separate wallet or
              Safe.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                label="Owner wallet"
                value={account ?? ''}
                onChange={() => undefined}
                disabled
              />
              <Field
                label="Fee recipient"
                value={form.feeRecipient}
                onChange={value => set('feeRecipient', value)}
                hint="Wallet or Safe receiving the launchpad share"
              />
              <Field
                label="Admins · optional"
                value={form.admins}
                onChange={value => set('admins', value)}
                hint="Up to 10 wallet or Safe addresses, separated by commas"
              />
            </div>
            {account && !form.feeRecipient ? (
              <Button className="mt-5" onClick={() => set('feeRecipient', account)}>
                Use connected wallet
              </Button>
            ) : null}
            {!user ||
            !account ||
            !user.wallets.some(value => value.toLowerCase() === account.toLowerCase()) ? (
              <Button className="mt-5" variant="primary" onClick={openSignIn}>
                Connect X and link this wallet
              </Button>
            ) : null}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="mt-6">
            <h2 className="text-xl font-medium">Economics and graduation</h2>
            <p className="mt-2 text-sm text-muted">
              Curve revenue and post-graduation LP fees are split exactly as configured. Graduation
              creates a DAMM pool and locks its launch liquidity permanently.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="t-label text-muted">
                Quote asset
                <select
                  className={control}
                  value={form.quoteToken}
                  onChange={event => set('quoteToken', event.target.value)}
                >
                  <option value="">Select WETH or stablecoin</option>
                  {quoteAssets.map(asset => (
                    <option key={asset.address} value={asset.address}>
                      {asset.symbol} · {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Curve trade fee (%)"
                value={form.tradeFee}
                onChange={value => set('tradeFee', value)}
              />
              <Field
                label="Curve · creator share (%)"
                value={form.creatorShare}
                onChange={value => set('creatorShare', value)}
              />
              <Field
                label="Curve · launchpad share (%)"
                value={form.launchpadShare}
                onChange={value => set('launchpadShare', value)}
              />
              <Field
                label="Curve · protocol share (%)"
                value={form.protocolShare}
                onChange={value => set('protocolShare', value)}
                hint={`Total curve split · ${feeShares}%`}
              />
              <Field
                label="LP fees · creator share (%)"
                value={form.lpCreatorShare}
                onChange={value => set('lpCreatorShare', value)}
              />
              <Field
                label="LP fees · launchpad share (%)"
                value={form.lpLaunchpadShare}
                onChange={value => set('lpLaunchpadShare', value)}
              />
              <Field
                label="LP fees · protocol share (%)"
                value={form.lpProtocolShare}
                onChange={value => set('lpProtocolShare', value)}
                hint={`Total LP split · ${lpFeeShares}%`}
              />
              <Field
                label="Graduation threshold · quote"
                value={form.graduationThreshold}
                onChange={value => set('graduationThreshold', value)}
              />
              <Field
                label="Curve allocation · tokens"
                value={form.curveTokenSupply}
                onChange={value => set('curveTokenSupply', value)}
                hint="Recommended: 80% of total token supply"
              />
              <Field
                label="DAMM start fee (%)"
                value={form.startFee}
                onChange={value => set('startFee', value)}
              />
              <Field
                label="DAMM end fee (%)"
                value={form.endFee}
                onChange={value => set('endFee', value)}
              />
              <Field
                label="Fee decay duration (minutes)"
                value={form.feeDurationMinutes}
                onChange={value => set('feeDurationMinutes', value)}
              />
              <label className="t-label text-muted">
                Fee curve
                <select
                  className={control}
                  value={form.feeCurve}
                  onChange={event =>
                    set('feeCurve', event.target.value as 'linear' | 'exponential')
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="exponential">Exponential</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="mt-6">
            <h2 className="text-xl font-medium">Protected launch</h2>
            <p className="mt-2 text-sm text-muted">
              Limit concentration during the earliest part of the curve. Enforcement happens
              on-chain.
            </p>
            <div className="mt-6 grid gap-5">
              <Toggle
                label="Protected launch"
                detail="Apply creator and early-buyer caps"
                checked={form.protectionEnabled}
                onChange={value => set('protectionEnabled', value)}
              />
              <Toggle
                label="Require X-connected creators"
                detail="The API issues a one-use on-chain identity proof after X sign-in"
                checked={form.xRequired}
                disabled={!form.protectionEnabled}
                onChange={value => set('xRequired', value)}
              />
              <div className="grid gap-5 sm:grid-cols-3">
                <Field
                  label="Dev buy cap (%)"
                  value={form.devBuyCap}
                  disabled={!form.protectionEnabled}
                  onChange={value => set('devBuyCap', value)}
                />
                <Field
                  label="Early buyer cap (%)"
                  value={form.earlyBuyCap}
                  disabled={!form.protectionEnabled}
                  onChange={value => set('earlyBuyCap', value)}
                />
                <Field
                  label="Early window (minutes)"
                  value={form.earlyBuyMinutes}
                  disabled={!form.protectionEnabled}
                  onChange={value => set('earlyBuyMinutes', value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-5">
          {step > 0 ? <Button onClick={() => setStep(value => value - 1)}>Back</Button> : <span />}
          {step < steps.length - 1 ? (
            <Button variant="primary" disabled={!validSteps[step]} onClick={continueStep}>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!validSteps.every(Boolean) || busy}
              onClick={() => void prepare()}
            >
              {busy ? 'Validating on-chain…' : prepared ? 'Refresh review' : 'Preview launchpad'}
            </Button>
          )}
        </div>
        <p role="alert" className="mt-3 min-h-5 text-sm text-down">
          {error}
        </p>
      </section>

      <aside className="glass h-fit rounded-[2px] p-5 sm:p-6">
        <p className="t-label text-muted">Deployment review</p>
        <h2 className="mt-3 text-xl font-medium">{form.name || 'Unnamed launchpad'}</h2>
        <p className="t-label mt-1 text-faint">
          /{form.slug || 'slug'} · @{form.xHandle.replace(/^@/, '') || 'handle'}
        </p>
        <dl className="t-label mt-5 grid gap-3 border-y border-line py-4">
          <Row
            label="Quote"
            value={quoteAssets.find(asset => asset.address === form.quoteToken)?.symbol ?? '—'}
          />
          <Row label="Trade fee" value={`${form.tradeFee}%`} />
          <Row
            label="Curve split"
            value={`${form.creatorShare} / ${form.launchpadShare} / ${form.protocolShare}`}
          />
          <Row
            label="LP fee split"
            value={`${form.lpCreatorShare} / ${form.lpLaunchpadShare} / ${form.lpProtocolShare}`}
          />
          <Row label="Admins" value={String(parseAdmins(form.admins).length)} />
          <Row label="Graduation" value={`${form.graduationThreshold || '—'} quote → DAMM`} />
          <Row
            label="DAMM fee"
            value={`${form.startFee}% → ${form.endFee}% / ${form.feeDurationMinutes}m`}
          />
          <Row
            label="Protection"
            value={form.protectionEnabled ? 'On-chain caps active' : 'Open launch'}
          />
        </dl>
        {confirmed ? (
          <div className="mt-5 border border-up/40 bg-up/5 p-4 text-sm">
            <p className="font-medium text-up">Launchpad confirmed on-chain</p>
            <p className="mt-2 text-muted">
              Indexing the launchpad now. Its page will open automatically when ready.
            </p>
            <a
              href={`/lp/${form.slug}`}
              className="t-label mt-4 inline-flex min-h-11 items-center text-signal underline underline-offset-4"
            >
              Open launchpad
            </a>
          </div>
        ) : prepared ? (
          <div className="mt-5">
            <p className="mb-4 text-sm text-muted">
              One transaction creates the immutable configuration and public registry entry.
            </p>
            <TxButton
              label="Create launchpad"
              error={null}
              onExecute={execute}
              pendingLabel="Creating launchpad…"
            />
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">
            Complete all four steps, then preview the exact transaction before signing.
          </p>
        )}
      </aside>
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
function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4 border border-line bg-panel-2 px-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="t-label mt-1 block text-faint">{detail}</span>
      </span>
      <input
        type="checkbox"
        className="size-5 accent-current"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
    </label>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-fg">{value}</dd>
    </div>
  );
}
