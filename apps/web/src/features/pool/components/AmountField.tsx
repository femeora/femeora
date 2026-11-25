'use client';

import { useEffect, useId, useState } from 'react';
import { parseUnits } from 'viem';

import { TokenIcon } from '@/components/ui/TokenPair';
import { readErc20Balance } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';

import { formatCompactUsd } from '../model/format';

interface AmountFieldProps {
  token: string;
  tokenAddress: string;
  tokenName?: string | undefined;
  tokenLogoUrl?: string | null | undefined;
  value: string;
  usdPerToken: number;
  enabled: boolean;
  onChange: (value: string) => void;
}

const DECIMAL = /^\d*\.?\d*$/;

/** Deposit amount for one token. Disabled, with a reason, when the range does not use it. */
export function AmountField({ token, tokenAddress, tokenName, tokenLogoUrl, value, usdPerToken, enabled, onChange }: AmountFieldProps) {
  const id = useId();
  const account = useWallet(state => state.account);
  const chainId = useWallet(state => state.chainId);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceRaw, setBalanceRaw] = useState<bigint | null>(null);
  const [balanceDecimals, setBalanceDecimals] = useState<number | null>(null);
  const amount = Number.parseFloat(value);
  const usd = Number.isFinite(amount) ? amount * usdPerToken : 0;
  let enteredRaw: bigint | null = null;
  if (value && balanceDecimals !== null) {
    try { enteredRaw = parseUnits(value, balanceDecimals); } catch { enteredRaw = null; }
  }
  const exceedsBalance = enteredRaw !== null && balanceRaw !== null && enteredRaw > balanceRaw;

  useEffect(() => {
    let active = true;
    setBalance(null);
    setBalanceRaw(null);
    setBalanceDecimals(null);
    if (!account || !enabled || chainId === null) return () => { active = false; };
    void readErc20Balance(tokenAddress, account)
      .then(result => {
        if (!active) return;
        setBalance(result.formatted);
        setBalanceRaw(result.raw);
        setBalanceDecimals(result.decimals);
      })
      .catch(() => {
        if (active) setBalance('Unavailable');
      });
    return () => { active = false; };
  }, [account, chainId, enabled, tokenAddress]);

  return (
    <div className="glass rounded-[2px] p-3 focus-within:border-fg/40 has-[:disabled]:opacity-50">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="t-label inline-flex items-center gap-2 text-muted">
          <TokenIcon token={tokenAddress} logoUrl={tokenLogoUrl} name={tokenName} className="size-5" />
          {token}
        </label>
        <span className="text-right">
          <span className="t-label block text-faint">{enabled ? formatCompactUsd(usd) : 'Not needed for this range'}</span>
          {enabled && account ? <span className={`t-label mt-1 block ${exceedsBalance ? 'text-down' : 'text-muted'}`}>Balance {balance ?? 'Reading…'}</span> : null}
        </span>
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        disabled={!enabled}
        value={enabled ? value : ''}
        onChange={event => DECIMAL.test(event.target.value) && onChange(event.target.value)}
        className="mt-1 w-full bg-transparent py-1 font-mono text-xl tabular-nums outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      {exceedsBalance ? <p className="t-label mt-1 text-down">Amount exceeds the connected wallet balance.</p> : null}
    </div>
  );
}
