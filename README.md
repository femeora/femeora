# Femeora

**Every LP is a callout.**

Femeora is a permissionless liquidity and social trading protocol built on
Robinhood Chain. It combines DAMM and DLMM liquidity pools with on-chain
positions, swaps, callouts, and a realtime market feed.

- Mainnet: [femeora.tech](https://femeora.tech)
- Mainnet API: [api.femeora.tech](https://api.femeora.tech)
- Testnet: [testnet.femeora.tech](https://testnet.femeora.tech)
- X: [@femeoraApp](https://x.com/femeoraApp)
- Explorer: [Robinhood Chain on Etherscan](https://robin.etherscan.io)

## Product

Femeora lets users:

- create canonical DAMM or DLMM pools directly from a connected wallet;
- open single-sided or two-sided liquidity positions;
- increase, decrease, collect fees from, and close positions;
- swap through canonical pools;
- publish proof-backed callouts linked to on-chain positions;
- follow pool activity through candles, liquidity bins, trades, positions, and
  realtime social activity;
- connect an X account for public identity while keeping wallet connection as
  the primary requirement for on-chain actions.

## Markets and asset metadata

Canonical pools are sourced from on-chain events. Token identity is resolved
from Femeora's verified asset catalog by chain ID and contract address, rather
than being embedded in individual UI pages. The catalog supplies the token
symbol, name, decimals, logo, category, and candidate-market configuration.

Current catalog coverage includes:

- WETH and USDG;
- FEM, the Femeora token;
- PONS;
- DELTA (`0xe8ffd7e24187F72afB08d75B1bb13088A989a791`);
- supported Robinhood Chain stock tokens and tokenized ETFs.

If an indexed pool contains a catalogued asset, every pool card should display
its real symbol, name, and logo. A generic token identity is used only when the
contract address has not yet been verified in the catalog.

## Architecture

This repository is a pnpm and Turborepo monorepo:

```text
femeora/
├── apps/
│   ├── contracts/       EVM contracts for pools, positions, swaps, and governance
│   ├── indexer/         On-chain event ingestion and read-model projection
│   ├── api/             REST and SSE services for market and social data
│   └── web/             Next.js web application
├── packages/
│   ├── contracts-sdk/   Contract ABIs and typed integrations
│   ├── database/        Prisma schema and migrations
│   ├── sdk/             Shared protocol and market calculations
│   └── types/           Shared runtime schemas and TypeScript types
└── docs/                Public product briefs, guides, and protocol references
```

The contracts remain the source of truth for pools and positions. The indexer
projects on-chain activity, the API exposes normalized read models and realtime
updates, and the web application renders those models without substituting demo
transactions or simulated pool state.

## Networks

| Environment | Chain ID | Web |
| --- | ---: | --- |
| Robinhood Chain Mainnet | `4663` | [femeora.tech](https://femeora.tech) |
| Robinhood Chain Testnet | `46630` | [testnet.femeora.tech](https://testnet.femeora.tech) |

Testnet assets have no real-world value.

## Development

The project requires Node.js 20 or newer and pnpm 9 or newer.

```bash
pnpm install
pnpm typecheck
pnpm lint
```

Runtime configuration is supplied through environment-specific files during
development and through the deployment platform's secret manager in hosted
environments. Environment files and private keys must never be committed.

## Security notice

Liquidity positions can lose value, token prices can move rapidly, and smart
contract transactions are irreversible. Verify the active network, token
contracts, amounts, price range, and transaction details before signing.

## License

No license is granted unless a license file in this repository explicitly says
otherwise.
