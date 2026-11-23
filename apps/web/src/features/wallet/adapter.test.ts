import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectInjectedWallet,
  type Eip1193Provider,
  sendPreparedTransaction,
  subscribeWallet,
  switchInjectedChain,
  WalletAdapterError,
} from './adapter';

const account = '0x00000000000000000000000000000000000000aa' as const;
const hash = `0x${'12'.repeat(32)}`;

class Provider implements Eip1193Provider {
  chain = '0xb626';
  accounts: string[] = [account];
  sent: Array<{ method: string; params?: readonly unknown[] }> = [];
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  async request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> {
    this.sent.push(args);
    if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') return this.accounts;
    if (args.method === 'eth_chainId') return this.chain;
    if (args.method === 'eth_estimateGas') return '0x5208';
    if (args.method === 'eth_gasPrice') return '0x3b9aca00';
    if (args.method === 'eth_getBalance') return '0xde0b6b3a7640000';
    if (args.method === 'eth_sendTransaction') return hash;
    if (args.method === 'wallet_switchEthereumChain') {
      this.chain = (args.params?.[0] as { chainId: string }).chainId;
      return null;
    }
    throw new Error('UNEXPECTED_METHOD');
  }

  on(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: 'accountsChanged' | 'chainChanged' | 'disconnect', listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }
}

test('connects, switches chain, and sends only a validated prepared transaction', async () => {
  const provider = new Provider();
  assert.deepEqual(await connectInjectedWallet(provider), { account, chainId: 46_630 });
  await switchInjectedChain(46_631, provider);
  assert.equal(provider.chain, '0xb627');
  provider.chain = '0xb626';
  assert.equal(await sendPreparedTransaction({
    chainId: 46_630,
    to: '0x00000000000000000000000000000000000000bb',
    data: '0x1234',
    value: '0x0',
  }, account, provider), hash);
  assert.deepEqual(provider.sent.at(-1), {
    method: 'eth_sendTransaction',
    params: [{
      from: account,
      to: '0x00000000000000000000000000000000000000bb',
      data: '0x1234',
      value: '0x0',
      gas: '0x5208',
    }],
  });
});

test('rejects an underfunded wallet before opening the transaction request', async () => {
  const provider = new Provider();
  const original = provider.request.bind(provider);
  provider.request = async args => args.method === 'eth_getBalance' ? '0x0' : original(args);
  await assert.rejects(
    sendPreparedTransaction({
      chainId: 46_630,
      to: '0x00000000000000000000000000000000000000bb',
      data: '0x',
      value: '0x0',
      gas: '0x5208',
    }, account, provider),
    (error: unknown) => error instanceof WalletAdapterError && error.code === 'INSUFFICIENT_GAS_BALANCE',
  );
  assert.equal(provider.sent.some(request => request.method === 'eth_sendTransaction'), false);
});

test('blocks a prepared transaction on the wrong chain before wallet submission', async () => {
  const provider = new Provider();
  provider.chain = '0x1';
  await assert.rejects(
    sendPreparedTransaction({
      chainId: 46_630,
      to: '0x00000000000000000000000000000000000000bb',
      data: '0x',
      value: '0x0',
    }, account, provider),
    (error: unknown) => error instanceof WalletAdapterError && error.code === 'WRONG_NETWORK',
  );
  assert.equal(provider.sent.some(request => request.method === 'eth_sendTransaction'), false);
});

test('subscribes and fully removes wallet lifecycle listeners', () => {
  const provider = new Provider();
  let refreshes = 0;
  let disconnects = 0;
  const stop = subscribeWallet(provider, () => refreshes++, () => disconnects++);
  provider.listeners.get('accountsChanged')?.forEach(listener => listener([account]));
  provider.listeners.get('chainChanged')?.forEach(listener => listener('0xb626'));
  provider.listeners.get('disconnect')?.forEach(listener => listener());
  assert.deepEqual({ refreshes, disconnects }, { refreshes: 2, disconnects: 1 });
  stop();
  assert.equal([...provider.listeners.values()].every(listeners => listeners.size === 0), true);
});
