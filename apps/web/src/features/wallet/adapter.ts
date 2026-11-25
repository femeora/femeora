import { ApiPreparedTransactionSchema, type ApiPreparedTransaction } from '@fomeora/types';
import {
  createPublicClient,
  custom,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddress,
  parseAbi,
  type Hex,
} from 'viem';

const erc20BalanceAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  on?(
    event: 'accountsChanged' | 'chainChanged' | 'disconnect',
    listener: (...args: unknown[]) => void
  ): void;
  removeListener?(
    event: 'accountsChanged' | 'chainChanged' | 'disconnect',
    listener: (...args: unknown[]) => void
  ): void;
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

const WALLET_REQUEST_TIMEOUT_MS = 30_000;
let selectedProvider: Eip1193Provider | null = null;

function providerErrorCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  if ('code' in error && typeof error.code === 'number') return error.code;
  if ('error' in error) return providerErrorCode(error.error);
  if ('cause' in error) return providerErrorCode(error.cause);
  return null;
}

function providerCandidates(): Eip1193Provider[] {
  if (typeof window === 'undefined') return [];
  const injected = (window as typeof window & { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) return [];
  const candidates =
    Array.isArray(injected.providers) && injected.providers.length > 0
      ? injected.providers
      : [injected];
  return [...new Set(candidates)];
}

function preferredProvider(candidates: readonly Eip1193Provider[]): Eip1193Provider | null {
  return (
    candidates.find(provider => provider.isRabby) ??
    candidates.find(provider => provider.isMetaMask) ??
    candidates.find(provider => provider.isCoinbaseWallet) ??
    candidates[0] ??
    null
  );
}

async function requestWithTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new WalletAdapterError('WALLET_REQUEST_TIMEOUT')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveInjectedProvider(): Promise<Eip1193Provider | null> {
  if (selectedProvider) return selectedProvider;
  const candidates = providerCandidates();
  for (const provider of candidates) {
    try {
      const accounts = await requestWithTimeout(
        provider.request({ method: 'eth_accounts' }),
        2_000
      );
      if (Array.isArray(accounts) && accounts.length > 0) {
        selectedProvider = provider;
        return provider;
      }
    } catch {
      // A broken extension must not prevent another injected provider from connecting.
    }
  }
  selectedProvider = preferredProvider(candidates);
  return selectedProvider;
}

export function injectedProvider(): Eip1193Provider | null {
  if (selectedProvider) return selectedProvider;
  selectedProvider = preferredProvider(providerCandidates());
  return selectedProvider;
}

export async function readWalletSnapshot(provider: Eip1193Provider): Promise<WalletSnapshot> {
  const [accountsValue, chainValue] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ]);
  const accounts = Array.isArray(accountsValue) ? accountsValue : [];
  const account = typeof accounts[0] === 'string' && isAddress(accounts[0]) ? accounts[0] : null;
  const chainId =
    typeof chainValue === 'string' && /^0x[0-9a-fA-F]+$/.test(chainValue)
      ? Number.parseInt(chainValue, 16)
      : null;
  return { account, chainId };
}

export async function connectInjectedWallet(
  provider?: Eip1193Provider | null,
  timeoutMs = WALLET_REQUEST_TIMEOUT_MS
): Promise<WalletSnapshot> {
  const target = provider ?? (await resolveInjectedProvider());
  if (!target) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  try {
    await requestWithTimeout(target.request({ method: 'eth_requestAccounts' }), timeoutMs);
    const snapshot = await requestWithTimeout(readWalletSnapshot(target), timeoutMs);
    if (!snapshot.account) throw new WalletAdapterError('WALLET_ACCOUNT_REQUIRED');
    selectedProvider = target;
    return snapshot;
  } catch (error) {
    if (error instanceof WalletAdapterError) throw error;
    const errorCode = providerErrorCode(error);
    if (errorCode === 4001) throw new WalletAdapterError('WALLET_REQUEST_REJECTED');
    if (errorCode === -32_002) throw new WalletAdapterError('WALLET_REQUEST_PENDING');
    throw new WalletAdapterError('WALLET_CONNECTION_FAILED');
  }
}

export async function disconnectInjectedWallet(provider = injectedProvider()): Promise<void> {
  if (!provider) return;
  try {
    await provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
  } catch {
    // Some EIP-1193 wallets do not implement permission revocation. Clearing
    // Fomeora's local connection still disconnects the current UI session.
  }
}

export async function readErc20Balance(
  token: string,
  account: `0x${string}`,
  provider = injectedProvider()
): Promise<{ raw: bigint; decimals: number; formatted: string }> {
  if (!provider || !isAddress(token)) throw new WalletAdapterError('TOKEN_BALANCE_UNAVAILABLE');
  try {
    const [balanceResult, decimalsResult] = await Promise.all([
      provider.request({
        method: 'eth_call',
        params: [
          {
            to: token,
            data: encodeFunctionData({
              abi: erc20BalanceAbi,
              functionName: 'balanceOf',
              args: [account],
            }),
          },
          'latest',
        ],
      }),
      provider.request({
        method: 'eth_call',
        params: [
          {
            to: token,
            data: encodeFunctionData({ abi: erc20BalanceAbi, functionName: 'decimals' }),
          },
          'latest',
        ],
      }),
    ]);
    if (typeof balanceResult !== 'string' || typeof decimalsResult !== 'string') {
      throw new Error('INVALID_TOKEN_BALANCE_RESPONSE');
    }
    const raw = decodeFunctionResult({
      abi: erc20BalanceAbi,
      functionName: 'balanceOf',
      data: balanceResult as Hex,
    });
    const decimals = Number(
      decodeFunctionResult({
        abi: erc20BalanceAbi,
        functionName: 'decimals',
        data: decimalsResult as Hex,
      })
    );
    return { raw, decimals, formatted: formatUnits(raw, decimals) };
  } catch {
    throw new WalletAdapterError('TOKEN_BALANCE_UNAVAILABLE');
  }
}

export async function switchInjectedChain(
  expectedChainId: number,
  provider = injectedProvider()
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
  provider = injectedProvider()
): Promise<Hex> {
  if (!provider) throw new WalletAdapterError('WALLET_PROVIDER_NOT_FOUND');
  try {
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, account],
    });
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
  provider = injectedProvider()
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
    if (
      typeof gasValue !== 'string' ||
      !/^0x[0-9a-fA-F]+$/.test(gasValue) ||
      typeof gasPriceValue !== 'string' ||
      !/^0x[0-9a-fA-F]+$/.test(gasPriceValue) ||
      typeof balanceValue !== 'string' ||
      !/^0x[0-9a-fA-F]+$/.test(balanceValue)
    ) {
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
      params: [
        {
          from: account,
          to: prepared.to,
          data: prepared.data,
          value: prepared.value,
          gas: `0x${gas.toString(16)}`,
        },
      ],
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
  disconnected: () => void
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
