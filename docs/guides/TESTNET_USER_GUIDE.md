# Fomeora testnet user guide

Fomeora testnet runs on Robinhood Chain Testnet. Testnet ETH and every test token have no monetary value. Never send mainnet ETH, production tokens, a seed phrase, or a private key to a faucet, Fomeora, or another tester.

## Network

Use the public wallet configuration published by Robinhood:

| Field | Value |
| --- | --- |
| Network name | Robinhood Chain Testnet |
| Chain ID | `46630` |
| Native currency | `ETH` |
| Public wallet RPC | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |

The public RPC can be rate-limited. It is sufficient for adding the network to a wallet, but availability is controlled by Robinhood Chain.

Official references:

- [Add Robinhood Chain Testnet to a wallet](https://docs.robinhood.com/chain/add-network-to-wallet/)
- [Robinhood Chain connectivity](https://docs.robinhood.com/chain/connecting/)
- [Robinhood Chain Testnet explorer](https://explorer.testnet.chain.robinhood.com/)

## Get testnet gas

1. Open the [official Robinhood Chain Testnet faucet](https://faucet.testnet.chain.robinhood.com/).
2. Confirm the site hostname exactly before connecting or entering an address.
3. Request testnet assets for the wallet you will use with Fomeora.
4. Confirm the wallet shows Robinhood Chain Testnet, chain ID `46630`.
5. Confirm the testnet ETH balance before submitting a Fomeora transaction.

The faucet may apply eligibility, rate or cooldown limits. Fomeora does not control those limits and must not promise a fixed faucet amount.

## Get the Fomeora quote token

The canonical Fomeora quote-token address and public distribution method are not live yet. Distribution will be available to every tester without a wallet allowlist. Token distribution stays outside the application contracts because testnet uses the same protocol contracts and user transaction flow intended for mainnet.

Do not import a token address from chat, replies, DMs, screenshots, or an unofficial faucet.

Until then, having testnet ETH is sufficient only for wallet/network readiness, not for swaps or liquidity positions.

## Try Fomeora

After the public testnet domain and initial pool are live:

1. Open the canonical Fomeora testnet domain from the official Femeora account.
2. Check that the header says **Testnet**.
3. Sign in with X. Fomeora requests identity access only and does not request permission to post.
4. Link an EVM wallet by signing the one-time ownership message. This is not a transaction and costs no gas.
5. Open Pools and select a canonical pool.
6. Review every token, amount, range, approval, network and gas estimate in the wallet.
7. Start with a small test amount. Try a swap or create a position.
8. Optionally post the position as a callout or Tail another callout. Tail copies a range or shape, not a result.
9. Use the transaction link shown by Fomeora to confirm the result in the official explorer.

## Safety checklist

- Testnet tokens have no monetary value.
- Never use a wallet that holds valuable mainnet assets for early testing.
- Never share a seed phrase, private key, session cookie, bearer token or signature payload.
- Reject a wallet request if the chain is not `46630` or the token/amount is unexpected.
- Fomeora never asks a user to paste an RPC credential or deployment key.
- Every approval is for an exact prepared amount; inspect it before signing.
- LP positions can lose value. Tailing copies a range, not performance.

## Report a problem

When reporting a testnet issue, provide only public diagnostics:

- the page URL;
- wallet/browser name and version;
- expected and observed behavior;
- public transaction hash, if one exists;
- approximate time and timezone.

Do not include secrets, cookies, private RPC URLs, private keys, seed phrases, or full request headers.
