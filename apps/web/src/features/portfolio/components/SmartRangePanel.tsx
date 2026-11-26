'use client';

import {
  ApiCalloutIntentSchema,
  ApiPositionActionPreparationSchema,
  ApiPositionPreparationSchema,
  ApiSmartRangeProposalSchema,
  type ApiIndexedPosition,
  type ApiSmartRangeMode,
  type ApiSmartRangeProposal,
} from '@fomeora/types';
import { useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { executePreparedPosition } from '@/features/pool/model/executePosition';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { tokenSymbol } from '@/lib/tokens';

import { executePositionAction } from '../executePositionAction';

const MODES: readonly { value: ApiSmartRangeMode; label: string; hint: string }[] = [
  { value: 'follow-price', label: 'Follow price', hint: 'Keep the width and recenter around spot.' },
  { value: 'fee-focus', label: 'Fee focus', hint: 'Concentrate liquidity in a tighter range.' },
  { value: 'defensive', label: 'Defensive', hint: 'Use a wider range to stay active longer.' },
];

export function SmartRangePanel({ position, onConfirmed }: {
  position: ApiIndexedPosition;
  onConfirmed: () => Promise<unknown>;
}) {
  const { account, config } = useWallet();
  const [mode, setMode] = useState<ApiSmartRangeMode>('follow-price');
  const [proposal, setProposal] = useState<ApiSmartRangeProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('Preparing rebalance…');
  const [error, setError] = useState<string | null>(null);
  const [oldPositionClosed, setOldPositionClosed] = useState(false);
  const [closeHash, setCloseHash] = useState<string | null>(null);
  const [threadLinkSkipped, setThreadLinkSkipped] = useState(false);
  const [rebalanceIntentId, setRebalanceIntentId] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const tokenX = tokenSymbol(position.pool.tokenX);
  const tokenY = tokenSymbol(position.pool.tokenY);

  const requestProposal = async () => {
    if (!account) throw new Error('WALLET_CONNECTION_REQUIRED');
    return browserApiRequest(
      `/v1/positions/${position.id}/smart-range-proposal`,
      ApiSmartRangeProposalSchema,
      { method: 'POST', body: { walletAddress: account, mode } },
    );
  };

  const review = async () => {
    setLoading(true);
    setError(null);
    setHash(null);
    try { setProposal(await requestProposal()); }
    catch (cause) {
      setProposal(null);
      setError(friendlyErrorMessage(cause instanceof Error ? cause.message : 'SMART_RANGE_PROPOSAL_FAILED'));
    } finally { setLoading(false); }
  };

  const execute = async () => {
    if (!account || !proposal) throw new Error('SMART_RANGE_PROPOSAL_REQUIRED');
    setError(null);
    let closedDuringAttempt = oldPositionClosed;
    try {
      let latest = proposal;
      let preparedIntentId = rebalanceIntentId;
      if (!oldPositionClosed) {
        latest = await requestProposal();
        setProposal(latest);
        if (position.calloutId && config) {
          try {
            const intent = await browserApiRequest(
              '/v1/callouts/rebalance-intent',
              ApiCalloutIntentSchema,
              { method: 'POST', body: { chainId: config.chainId, positionId: position.id } },
            );
            preparedIntentId = intent.intentId;
            setRebalanceIntentId(intent.intentId);
            setThreadLinkSkipped(false);
          } catch {
            setThreadLinkSkipped(true);
          }
        }
        const closePrepare = () => browserApiRequest(
          `/v1/positions/${position.id}/close-prepare`,
          ApiPositionActionPreparationSchema,
          { method: 'POST', body: { walletAddress: account, slippageBps: 50 } },
        );
        setStage('Review close position');
        const confirmedCloseHash = await executePositionAction({
          account,
          preparation: await closePrepare(),
          refreshPreparation: closePrepare,
          onStage: label => setStage(`Close old position · ${label}`),
        });
        setCloseHash(confirmedCloseHash);
        setOldPositionClosed(true);
        closedDuringAttempt = true;
      }

      const createBody = {
        shape: latest.proposed.shape,
        lowerBin: latest.proposed.lowerBin,
        upperBin: latest.proposed.upperBin,
        amountX: latest.proposed.amountX,
        amountY: latest.proposed.amountY,
        slippageBps: 50,
        walletAddress: account,
        intentId: preparedIntentId,
      };
      const createPrepare = () => browserApiRequest(
        `/v1/pools/${position.pool.address}/position-prepare`,
        ApiPositionPreparationSchema,
        { method: 'POST', body: createBody },
      );
      setStage('Prepare replacement position');
      const transactionHash = await executePreparedPosition({
        account,
        preparation: await createPrepare(),
        refreshPreparation: createPrepare,
        onStage: label => setStage(`Replacement position · ${label}`),
      });
      setHash(transactionHash);
      setProposal(null);
      await onConfirmed();
      window.dispatchEvent(new CustomEvent('fomeora:position-confirmed', {
        detail: { pool: position.pool.address, transactionHash, expectsCallout: false },
      }));
      return transactionHash;
    } catch (cause) {
      setError(closedDuringAttempt
        ? 'The old position is closed and your tokens remain in your wallet. Retry to create the replacement position.'
        : friendlyErrorMessage(cause instanceof Error ? cause.message : 'SMART_RANGE_EXECUTION_FAILED'));
      throw cause;
    }
  };

  if (position.pool.type !== 'DLMM') {
    return <p className="text-sm text-muted">Smart Range is available for DLMM positions. DAMM rebalance support follows the one-token zap flow.</p>;
  }

  return (
    <section className="grid gap-4" aria-labelledby={`smart-range-${position.id}`}>
      <div>
        <p className="t-label text-signal">Smart Range</p>
        <h3 id={`smart-range-${position.id}`} className="mt-1 text-lg font-medium">Ask me for a better range</h3>
        <p className="mt-1 text-sm text-muted">Femeora reads indexed safe-block state and proposes a range. Nothing executes until you sign each wallet request.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map(item => (
          <button
            key={item.value}
            type="button"
            aria-pressed={mode === item.value}
            disabled={oldPositionClosed}
            onClick={() => { setMode(item.value); setProposal(null); setError(null); }}
            className={cn(
              'glass-control min-h-20 rounded-[2px] p-3 text-left',
              mode === item.value && 'border-signal bg-signal/10',
            )}
          >
            <span className="block text-sm font-medium">{item.label}</span>
            <span className="t-label mt-1 block text-faint">{item.hint}</span>
          </button>
        ))}
      </div>

      {proposal ? <div className="glass rounded-[2px] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <dl>
            <dt className="t-label text-faint">Current position</dt>
            <dd className="mt-2 font-mono text-sm">Bins {proposal.current.lowerBin}–{proposal.current.upperBin}</dd>
            <dd className="mt-1 text-sm text-muted">{proposal.current.binCount} bins · {proposal.current.inRange ? 'In range' : 'Out of range'}</dd>
            <dd className="mt-1 text-sm text-muted">In range {proposal.current.inRangePercent.toFixed(1)}% of tracked time</dd>
          </dl>
          <dl>
            <dt className="t-label text-signal">Proposed position</dt>
            <dd className="mt-2 font-mono text-sm">Bins {proposal.proposed.lowerBin}–{proposal.proposed.upperBin}</dd>
            <dd className="mt-1 text-sm text-muted">{proposal.proposed.binCount} bins · centered at active bin {proposal.activeBin}</dd>
            <dd className="mt-1 text-sm text-muted">{proposal.proposed.amountX} {tokenX} + {proposal.proposed.amountY} {tokenY}</dd>
          </dl>
        </div>
        <ul className="mt-4 grid gap-1 border-t border-line pt-4 text-sm text-muted">
          {proposal.reasoning.map(reason => <li key={reason}>{reason}</li>)}
        </ul>
        <p className="mt-3 text-sm text-down">Two position transactions are required: close the old position, then create the replacement. Exact token approvals may add wallet requests. Price movement can change the result.</p>
      </div> : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void review()} disabled={!account || loading || oldPositionClosed}>{loading ? 'Reading safe-block state…' : 'Ask me'}</Button>
        {proposal ? <TxButton label={oldPositionClosed ? 'Create replacement position' : 'Rebalance position'} error={null} onExecute={execute} pendingLabel={stage} /> : null}
      </div>
      <p role="alert" className="min-h-5 text-sm text-down">{error}</p>
      {threadLinkSkipped ? <p className="text-sm text-muted">The position can still be rebalanced, but the callout thread update could not be prepared. Reconnect X before retrying if you want the social update attached.</p> : null}
      {closeHash && config ? <a className="t-label break-all text-muted hover:underline" href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${closeHash}`} target="_blank" rel="noreferrer">View closed position transaction {closeHash}</a> : null}
      {hash && config ? <a className="t-label break-all text-signal hover:underline" href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${hash}`} target="_blank" rel="noreferrer">View replacement position transaction {hash}</a> : null}
    </section>
  );
}
