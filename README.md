# Fomeora Monorepo

> **Meteora-style DLMM + DAMM Liquidity Engine with a FOMO-style Proof-Backed Social Feed.**
> _"Every LP is a callout."_

---

## 🏛️ High-Level Architecture

Fomeora is structured as a **Turborepo Monorepo** managed with **pnpm workspaces**. It enforces **Clean Architecture**, **Strict TypeScript Typing**, **Zero Code Smell**, and **Defense-in-Depth Security**.

```
fomeora/
├── .github/workflows/          # CI/CD: Automated linting, typechecking, fuzzing & audits
├── apps/
│   ├── contracts/              # Foundry-based EVM Smart Contracts (DLMM v2, PositionManagerV2, Lens)
│   ├── indexer/                # Event Ingestion: projections for swaps, fee attribution, positions
│   ├── api/                    # Fastify REST & SSE Server (X OAuth 2.0 PKCE, EIP-191 wallet link, Feed, Ranking)
│   └── web/                    # Next.js 14 App Router: Mobile-first Social Feed & Delta-grade Pool Terminal
├── packages/
│   ├── sdk/                    # Core math: DLMM bin formulas, PnL, formatters, ranking algorithms
│   ├── database/               # Prisma schema & PostgreSQL connection management (Chain + Social tables)
│   ├── types/                  # Single Source of Truth: Zod schemas & TypeScript types/DTOs
│   ├── contracts-sdk/          # Generated contract ABIs & Viem/Wagmi bindings
│   ├── config-eslint/          # Strict ESLint configuration (zero `any`, cyclomatic limits)
│   ├── config-typescript/      # Strict tsconfig base (`strict: true`, `noUncheckedIndexedAccess`)
│   └── config-prettier/        # Consistent opinionated code formatting
└── tools/
    └── docker/                 # Local development infrastructure (PostgreSQL 16, Anvil)
```

---

## 💎 Clean Code & Zero Smell Principles

This repository strictly abides by software engineering standards to eliminate technical debt:

1. **Explicit Boundaries (Clean & Hexagonal Architecture)**:
   - Business calculations (PnL, fee yields, ranking score, anti-shill verification) are pure functions isolated in `@fomeora/sdk`, without coupling to any web or database frameworks.
   - Applications (`api`, `web`, `indexer`) depend only on abstractions defined in `@fomeora/types` and `@fomeora/sdk`.
2. **Zero `any` Policy & Runtime Schema Validation**:
   - Every network input (HTTP payloads, SSE messages, smart contract events, URL parameters) must pass runtime validation using **Zod schemas**.
   - TypeScript is configured with `"noImplicitAny": true`, `"strict": true`, and `"noUncheckedIndexedAccess": true`.
3. **DRY & Single Source of Truth**:
   - DTOs and models are defined once in `@fomeora/types` and consumed everywhere across client, backend, and indexer.
4. **Anti-Shill & Phishing Defense-in-Depth**:
   - Captions are sanitized against hyperlinks, raw contract addresses, and phishing phrases (`validateCalloutCaption`).
   - Anti-shill signals (quick-exit within 30 min, opposing side positions, dev wallet identifiers) are computed deterministically from on-chain transactions.

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- Foundry (`forge`)

### 1. Clone & Install

```bash
pnpm install
```

### 2. Configure Environment Variables

Fill `.env.testnet` for testnet or `.env.mainnet` for mainnet. These files are
intentionally ignored and must be supplied through the deployment platform's
secret manager outside local development. Select the active configuration with
`APP_NETWORK=testnet` or `APP_NETWORK=mainnet`.

### 3. Spin up Local Infrastructure (Postgres and Anvil)

```bash
pnpm docker:up
```

### 4. Generate Database Client & Migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start Development Servers

```bash
pnpm dev
```

---

## 🧪 Testing & Verification

- **Run all tests & typechecks**:
  ```bash
  pnpm typecheck
  pnpm lint
  ```
- **Smart Contract Unit, Fuzzing & Invariant Tests**:
  ```bash
  pnpm test:contracts
  ```
