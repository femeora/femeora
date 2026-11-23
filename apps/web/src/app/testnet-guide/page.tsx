import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/landing/SiteFooter';
import { Ambient } from '@/components/ui/Ambient';
import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { Grain } from '@/components/ui/Grain';

export const metadata: Metadata = {
  title: 'Testnet guide · Fomeora',
  description: 'Connect to Robinhood Chain Testnet and prepare a wallet for Fomeora testing.',
};

const network = [
  ['Network', 'Robinhood Chain Testnet'],
  ['Chain ID', '46630'],
  ['Currency', 'ETH'],
  ['Public wallet RPC', 'https://rpc.testnet.chain.robinhood.com'],
  ['Explorer', 'explorer.testnet.chain.robinhood.com'],
] as const;

const steps = [
  [
    'Add the network',
    'Use the official Robinhood instructions or enter the public testnet values below in an EVM wallet.',
  ],
  [
    'Get testnet ETH',
    'Use the official Robinhood faucet. Faucet eligibility, amounts and cooldowns can change.',
  ],
  [
    'Wait for the quote token',
    'The canonical quote-token distribution is not live yet. It will be public and available to every tester without a wallet allowlist.',
  ],
  [
    'Open Fomeora',
    'After the public domain and first pool are live, sign in with X, link your wallet and start with a small test amount.',
  ],
] as const;

export default function TestnetGuidePage() {
  return (
    <>
      <Ambient />
      <header className="relative z-10 border-b border-line">
        <div className="wrap flex min-h-header items-center justify-between gap-6">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Fomeora home">
            <BrandMark />
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-6" aria-label="Guide navigation">
            <Link href="/" className="t-label text-muted hover:text-fg">
              Home
            </Link>
            <Link href="/pools" className="t-label text-signal hover:text-fg">
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section className="section border-b border-line">
          <div className="wrap grid-12 gap-y-10">
            <div className="col-span-12 lg:col-span-8">
              <p className="t-label text-signal">Robinhood Chain · Chain 46630</p>
              <h1 className="mt-5 max-w-[12ch] text-display font-semibold tracking-tight">
                Prepare for Fomeora testnet.
              </h1>
              <p className="mt-7 max-w-2xl text-lg text-muted">
                Testnet ETH and test tokens have no monetary value. Never send mainnet assets, a
                seed phrase or a private key to a faucet or tester.
              </p>
              <p className="mt-4 max-w-2xl text-muted">
                Fomeora uses the same protocol contracts and user transaction flow intended for
                mainnet. Token distribution is not implemented as testnet-only application logic.
              </p>
            </div>
            <aside className="glass col-span-12 p-5 lg:col-span-4" aria-label="Current readiness">
              <p className="t-label text-muted">Current readiness</p>
              <dl className="mt-4 space-y-3">
                <div className="flex justify-between gap-4">
                  <dt>Network and gas faucet</dt>
                  <dd className="text-up">Ready</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Fomeora quote token</dt>
                  <dd className="text-signal">Pending</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Initial pool</dt>
                  <dd className="text-signal">Pending</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Public app domain</dt>
                  <dd className="text-signal">Pending</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section className="section border-b border-line">
          <div className="wrap">
            <p className="t-label text-muted">Setup flow</p>
            <ol className="mt-8 grid gap-px bg-line md:grid-cols-2">
              {steps.map(([title, detail], index) => (
                <li key={title} className="bg-bg p-6">
                  <p className="t-label text-signal">0{index + 1}</p>
                  <h2 className="mt-4 text-h2 font-medium">{title}</h2>
                  <p className="mt-3 text-muted">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section border-b border-line">
          <div className="wrap grid-12 gap-y-10">
            <div className="col-span-12 lg:col-span-5">
              <p className="t-label text-muted">Public wallet configuration</p>
              <h2 className="mt-4 text-h1 font-medium">Add the testnet manually.</h2>
              <p className="mt-5 text-muted">
                The public RPC can be rate-limited. Availability is controlled by Robinhood Chain.
              </p>
            </div>
            <dl className="glass col-span-12 divide-y divide-line lg:col-span-7">
              {network.map(([label, value]) => (
                <div key={label} className="grid gap-2 p-4 sm:grid-cols-[11rem_1fr]">
                  <dt className="t-label text-muted">{label}</dt>
                  <dd className="break-all font-mono text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="section">
          <div className="wrap grid-12 gap-y-10">
            <div className="col-span-12 lg:col-span-7">
              <p className="t-label text-muted">Official resources</p>
              <div className="mt-6 flex flex-col items-start gap-4">
                <a
                  className="text-h2 text-signal hover:underline"
                  href="https://faucet.testnet.chain.robinhood.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the official testnet faucet ↗
                </a>
                <a
                  className="text-h2 text-signal hover:underline"
                  href="https://docs.robinhood.com/chain/add-network-to-wallet/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Wallet setup documentation ↗
                </a>
                <a
                  className="text-h2 text-signal hover:underline"
                  href="https://explorer.testnet.chain.robinhood.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the testnet explorer ↗
                </a>
              </div>
            </div>
            <div className="glass col-span-12 p-6 lg:col-span-5">
              <p className="t-label text-down">Before signing</p>
              <ul className="mt-5 list-disc space-y-3 pl-5 text-muted">
                <li>Confirm chain ID 46630.</li>
                <li>Inspect every token, amount and approval.</li>
                <li>Use a wallet without valuable mainnet assets.</li>
                <li>Never share private keys, seed phrases, cookies or RPC credentials.</li>
                <li>Remember that Tail copies a range, not a result.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <Grain />
    </>
  );
}
