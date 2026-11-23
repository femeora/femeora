import {
  ApiPreparedTransactionSchema,
  type ApiPreparedTransaction,
} from '@fomeora/types';
import { createPublicClient, custom, isAddress, type Hex } from 'viem';

export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void): void;
  removeListener?(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void): void;
}

export type WalletSnapshot = {
  account: `0x${string}` | null;
  chainId: number | null;
};

export class WalletAdapterError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WalletAdapterError';
  }
}

function providerErrorCode(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
    ? error.code
    : null;
}

export function injectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export async function readWalletSnapshot(provider: Eip1193Provider): Promise<WalletSnapshot> {
  const [accountsValue, chainValue] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ]);
  const accounts = Array.isArray(accountsValue) ? accountsValue : [];
  const account = typeof accounts[0] === 'string' && isAddress(accounts[0]) ? accounts[0] : null;
  const chainId = typeof chainValue === 'string' && /^0x[0-9a-fA-F]+$/.test(chainValue)
    ? Number.parseInt(chainValue, 16)
    : null;
  return { account, chainId };
}

export async function connectInjectedWallet(provider = injectedProvider()): Promise<WalletSnapshot> {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  try {
    await provider.request({ method: 'eth_requestAccounts' });
    const snapshot = await readWalletSnapshot(provider);
    if (!snapshot.account) throw new WalletAdapterError('WALLET_ACCOUNT_REQUIRED');
    return snapshot;
  } catch (error) {
    if (error instanceof WalletAdapterError) throw error;
    if (providerErrorCode(error) === 4001) throw new WalletAdapterError('WALLET_REQUEST_REJECTED');
    throw new WalletAdapterError('WALLET_CONNECTION_FAILED');
  }
}

export async function switchInjectedChain(
  expectedChainId: number,
  provider = injectedProvider(),
): Promise<void> {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
    });
  } catch (error) {
    const code = providerErrorCode(error);
    if (code === 4001) throw new WalletAdapterError('CHAIN_SWITCH_REJECTED');
    // Server RPC URLs deliberately remain private; users add an unknown chain in their wallet UI.
    if (code === 4902) throw new WalletAdapterError('CHAIN_NOT_ADDED');
    throw new WalletAdapterError('CHAIN_SWITCH_FAILED');
  }
}

export async function signWalletMessage(
  message: string,
  account: `0x${string}`,
  provider = injectedProvider(),
): Promise<Hex> {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  try {
    const signature = await provider.request({ method: 'personal_sign', params: [message, account] });
    if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
      throw new WalletAdapterError('WALLET_SIGNATURE_INVALID');
    }
    return signature as Hex;
  } catch (error) {
    if (error instanceof WalletAdapterError) throw error;
    if (providerErrorCode(error) === 4001) throw new WalletAdapterError('WALLET_REQUEST_REJECTED');
    throw new WalletAdapterError('WALLET_SIGNATURE_FAILED');
  }
}

export async function sendPreparedTransaction(
  transaction: ApiPreparedTransaction,
  account: `0x${string}`,
  provider = injectedProvider(),
): Promise<Hex> {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  const prepared = ApiPreparedTransactionSchema.parse(transaction);
  const snapshot = await readWalletSnapshot(provider);
  if (snapshot.chainId !== prepared.chainId) throw new WalletAdapterError('WRONG_NETWORK');
  if (snapshot.account?.toLowerCase() !== account.toLowerCase()) {
    throw new WalletAdapterError('WALLET_ACCOUNT_CHANGED');
  }
  const transactionRequest = {
    from: account,
    to: prepared.to,
    data: prepared.data,
    value: prepared.value,
  };
  let gas: bigint;
  let gasPrice: bigint;
  let balance: bigint;
  try {
    const [gasValue, gasPriceValue, balanceValue] = await Promise.all([
      prepared.gas
        ? Promise.resolve(prepared.gas)
        : provider.request({ method: 'eth_estimateGas', params: [transactionRequest] }),
      provider.request({ method: 'eth_gasPrice' }),
      provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }),
    ]);
    if (typeof gasValue !== 'string' || !/^0x[0-9a-fA-F]+$/.test(gasValue)
      || typeof gasPriceValue !== 'string' || !/^0x[0-9a-fA-F]+$/.test(gasPriceValue)
      || typeof balanceValue !== 'string' || !/^0x[0-9a-fA-F]+$/.test(balanceValue)) {
      throw new Error('INVALID_GAS_PREFLIGHT_RESPONSE');
    }
    gas = BigInt(gasValue);
    gasPrice = BigInt(gasPriceValue);
    balance = BigInt(balanceValue);
  } catch {
    throw new WalletAdapterError('GAS_ESTIMATE_FAILED');
  }
  if (balance < BigInt(prepared.value) + gas * gasPrice) {
    throw new WalletAdapterError('INSUFFICIENT_GAS_BALANCE');
  }
  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: prepared.to,
        data: prepared.data,
        value: prepared.value,
        gas: `0x${gas.toString(16)}`,
      }],
    });
    if (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      throw new WalletAdapterError('TRANSACTION_HASH_INVALID');
    }
    return hash as Hex;
  } catch (error) {
    if (error instanceof WalletAdapterError) throw error;
    if (providerErrorCode(error) === 4001) throw new WalletAdapterError('TRANSACTION_REJECTED');
    throw new WalletAdapterError('TRANSACTION_SEND_FAILED');
  }
}

export async function waitForWalletReceipt(hash: Hex, provider = injectedProvider()) {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  return createPublicClient({ transport: custom(provider) }).waitForTransactionReceipt({ hash });
}

export function subscribeWallet(
  provider: Eip1193Provider,
  refresh: () => void,
  disconnected: () => void,
): () => void {
  const onAccounts = () => refresh();
  const onChain = () => refresh();
  const onDisconnect = () => disconnected();
  provider.on?.('accountsChanged', onAccounts);
  provider.on?.('chainChanged', onChain);
  provider.on?.('disconnect', onDisconnect);
  return () => {
    provider.removeListener?.('accountsChanged', onAccounts);
    provider.removeListener?.('chainChanged', onChain);
    provider.removeListener?.('disconnect', onDisconnect);
  };
}
