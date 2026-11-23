import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerSystemRoutes } from './system.js';

test('serves public chain metadata without an RPC URL', async () => {
  const app = Fastify();
  await registerSystemRoutes(app, {
    network: 'testnet',
    chainId: 46_630,
    chainName: 'Robinhood Chain Testnet',
    explorerUrl: 'https://testnet.robinhood.com',
  });
  const response = await app.inject({ method: 'GET', url: '/v1/config' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    network: 'testnet',
    chainId: 46_630,
    chainIdHex: '0xb626',
    chainName: 'Robinhood Chain Testnet',
    explorerUrl: 'https://testnet.robinhood.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  });
  assert.equal(JSON.stringify(response.json()).includes('rpc'), false);
  await app.close();
});
