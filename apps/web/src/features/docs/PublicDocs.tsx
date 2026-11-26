'use client';

import Link from 'next/link';

import { useToast } from '@/components/feedback/toast';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { BookOpen, Copy, ExternalLink, ShieldCheck, TriangleAlert } from '@/components/ui/icons';

import { MAINNET_CHAIN, MAINNET_CONTRACT_GROUPS } from './publicContracts';

const navigation = [
  ['Overview', 'overview'],
  ['Getting started', 'getting-started'],
  ['User guides', 'guides'],
  ['Reputation', 'reputation'],
  ['Safety', 'security'],
  ['Terms', 'terms'],
  ['Privacy', 'privacy'],
  ['Mainnet contracts', 'contracts'],
] as const;

const userFlows = [
  {
    title: 'Connect and verify',
    body: 'Connect an EVM wallet to browse balances and sign transactions. Connect X only when you want a public identity for callouts, replies, launchpads or protected launches.',
    steps: [
      'Confirm Robinhood Chain Mainnet (chain ID 4663).',
      'Verify the connected address in the header.',
      'Read every approval and transaction before signing.',
    ],
  },
  {
    title: 'Swap',
    body: 'Open a canonical pool, select Swap, choose the input token and review the expected output, price impact, slippage and explorer destination.',
    steps: [
      'Start with a small amount.',
      'Approve only the exact token amount requested.',
      'Wait for confirmation and verify the transaction on the explorer.',
    ],
  },
  {
    title: 'Open a liquidity position',
    body: 'Choose Buy the dip, Sell into strength or Fee farm, then adjust the range and token amounts. The chart and form represent the same submitted bins.',
    steps: [
      'Review which tokens the selected range requires.',
      'Remember that concentrated liquidity can move out of range.',
      'Optionally attach a caption and post the confirmed position as a callout.',
    ],
  },
  {
    title: 'Manage and Smart Range',
    body: 'Increase, decrease or close from Portfolio or the pool Positions tab. Smart Range proposes a replacement range, but never executes without wallet signatures.',
    steps: [
      'Compare current and proposed bins.',
      'A rebalance closes the old position before creating the replacement.',
      'If replacement creation stops, the withdrawn tokens remain in your wallet.',
    ],
  },
  {
    title: 'Tail a callout',
    body: 'Tailing prepares your own position from another caller’s range. It does not transfer control to the caller and does not promise the same result.',
    steps: [
      'Choose same range or same shape around the current price.',
      'Set your own amounts and limits.',
      'You must approve and sign your own transaction.',
    ],
  },
  {
    title: 'Launch tokens',
    body: 'Create or select a launchpad, review its fee split, protection settings, quote asset and graduation configuration, then sign the token launch transaction.',
    steps: [
      'Token metadata and economics should be reviewed before signing.',
      'Curve buys and sells settle on-chain.',
      'Eligible launches graduate into Femeora liquidity according to their deployed configuration.',
    ],
  },
] as const;

function CopyAddress({ address }: { address: string }) {
  const showToast = useToast(state => state.show);
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    showToast('The contract address was copied.', { title: 'Address copied', userFacing: true });
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${address}`}
      className="grid size-11 shrink-0 place-items-center text-muted hover:text-fg"
    >
      <Copy aria-hidden="true" className="size-4" />
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="max-w-3xl">
      <p className="t-label text-signal">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-muted">{body}</p>
    </header>
  );
}

export function PublicDocs() {
  return (
    <div className="mx-auto grid max-w-[90rem] gap-10 px-gutter py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-12">
      <aside className="lg:sticky lg:top-[calc(var(--app-header-height)+2rem)] lg:h-fit">
        <div className="glass rounded-[2px] p-4">
          <p className="t-label text-muted">Documentation</p>
          <nav aria-label="Documentation sections" className="mt-3">
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {navigation.map(([label, id]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex min-h-11 items-center border-l border-transparent px-3 text-sm text-muted hover:border-signal hover:text-fg"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      <article className="min-w-0">
        <section id="overview" className="scroll-mt-24 border-b border-line pb-12">
          <p className="inline-flex items-center gap-2 t-label text-signal">
            <BookOpen aria-hidden="true" className="size-4" /> Public documentation
          </p>
          <h1 className="mt-5 max-w-[18ch] text-4xl font-semibold tracking-tight sm:text-6xl">
            Use Femeora with proof, control and context.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            Femeora is a non-custodial liquidity, trading, launch and social callout interface on
            Robinhood Chain. This documentation explains the user flows, material risks, public
            terms and deployed mainnet contracts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/pools" variant="primary">
              Open pools
            </ButtonLink>
            <ButtonLink href="/launchpads">Explore launches</ButtonLink>
          </div>
          <dl className="mt-10 grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-bg p-4">
              <dt className="t-label text-faint">Network</dt>
              <dd className="mt-2">{MAINNET_CHAIN.name}</dd>
            </div>
            <div className="bg-bg p-4">
              <dt className="t-label text-faint">Chain ID</dt>
              <dd className="mt-2 font-mono">{MAINNET_CHAIN.chainId}</dd>
            </div>
            <div className="bg-bg p-4">
              <dt className="t-label text-faint">Custody</dt>
              <dd className="mt-2">User-controlled wallet</dd>
            </div>
            <div className="bg-bg p-4">
              <dt className="t-label text-faint">Execution</dt>
              <dd className="mt-2">User-signed on-chain</dd>
            </div>
          </dl>
        </section>

        <section id="getting-started" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="Getting started"
            title="Begin with a wallet, not a deposit account."
            body="Femeora does not hold user funds. Wallet connection allows the interface to read public state and request signatures; it does not give Femeora permission to transact by itself."
          />
          <ol className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              [
                'Connect a wallet',
                'Use an injected EVM wallet or WalletConnect and confirm chain ID 4663.',
              ],
              [
                'Choose an activity',
                'Browse pools, positions, callouts or launchpads before entering an amount.',
              ],
              [
                'Review and sign',
                'Confirm token, amount, approval, destination and network in the wallet itself.',
              ],
            ].map(([title, body], index) => (
              <li key={title} className="glass rounded-[2px] p-5">
                <p className="t-label text-signal">0{index + 1}</p>
                <h3 className="mt-4 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="guides" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="User guides"
            title="Every major action, in plain language."
            body="These are user-facing flows. Contract implementation, deployment operations and private infrastructure procedures are intentionally outside the public guide."
          />
          <div className="mt-8 grid gap-3 xl:grid-cols-2">
            {userFlows.map(flow => (
              <section key={flow.title} className="glass rounded-[2px] p-5">
                <h3 className="text-xl font-medium">{flow.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{flow.body}</p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
                  {flow.steps.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section id="reputation" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="Launchpad reputation"
            title="Historical launchpad activity, summarized from canonical events."
            body="Femeora scores launchpads from indexed on-chain launches, trades, graduations, post-graduation activity, revenue and protection configuration. It is context—not a promise, endorsement or forecast."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="glass rounded-[2px] p-5">
              <h3 className="font-medium">What the badge means</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                New launchpads remain unrated until five canonical launches. Bronze, Silver and Gold
                reflect the calculated score. Verified additionally requires at least 20 launches, a
                score of 80 or higher and every configured protection signal.
              </p>
            </div>
            <div className="glass rounded-[2px] p-5">
              <h3 className="font-medium">What is measured</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The breakdown includes graduation and seven-day survival rates, median graduation
                time, developer exits, early top-wallet concentration, canonical volume, launchpad
                revenue and protection settings for rolling seven-day and all-time windows.
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">
            Scores refresh from indexed chain events and can change as launches mature. A high
            historical score does not eliminate token, liquidity, smart-contract or market risk.
          </p>
        </section>

        <section id="security" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="Security"
            title="What Femeora protects—and what remains your responsibility."
            body="On-chain execution is transparent, but smart-contract, market, wallet, oracle, RPC and interface risks cannot be eliminated."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="glass rounded-[2px] p-5">
              <p className="inline-flex items-center gap-2 font-medium">
                <ShieldCheck aria-hidden="true" className="size-5 text-up" /> Protocol safeguards
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
                <li>Transactions require the connected wallet’s signature.</li>
                <li>Token approvals are prepared for exact amounts by default.</li>
                <li>Canonical pools and positions come from indexed chain events.</li>
                <li>
                  Administrative operations use a public 2-of-3 Safe and five-minute timelock.
                </li>
                <li>
                  X OAuth is used for identity; Femeora does not request permission to post, like or
                  send Direct Messages on X.
                </li>
              </ul>
            </div>
            <div className="border border-down/45 bg-down/5 p-5">
              <p className="inline-flex items-center gap-2 font-medium text-down">
                <TriangleAlert aria-hidden="true" className="size-5" /> User responsibilities
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
                <li>
                  Never share a seed phrase, private key, session cookie or one-time wallet code.
                </li>
                <li>Verify chain, contract, token, amount and calldata in your wallet.</li>
                <li>
                  Liquidity positions can lose value and concentrated ranges can become inactive.
                </li>
                <li>
                  Tailing copies a range configuration, not performance or a guaranteed result.
                </li>
                <li>Token launches and low-liquidity markets can be extremely volatile.</li>
              </ul>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">
            Femeora’s deployed source is publicly verifiable, but independent audit coverage may be
            incomplete. Public verification is not a guarantee that contracts are free from defects.
          </p>
        </section>

        <section id="terms" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="Terms of use"
            title="Use the interface at your own discretion."
            body="By accessing Femeora, you acknowledge the following public terms. These terms are informational product terms and do not replace jurisdiction-specific legal advice."
          />
          <div className="mt-8 space-y-5 text-muted">
            <p>
              <strong className="text-fg">No investment advice.</strong> Content, rankings,
              callouts, charts and suggested ranges are informational tools and are not financial,
              investment, legal or tax advice.
            </p>
            <p>
              <strong className="text-fg">No guaranteed availability or outcome.</strong> The
              interface, APIs, indexers, third-party wallets, RPC providers and external market
              references may be delayed, unavailable or incorrect.
            </p>
            <p>
              <strong className="text-fg">Self-custody.</strong> You control the wallet and are
              responsible for approvals, signatures, gas, taxes, token selection and compliance with
              applicable laws.
            </p>
            <p>
              <strong className="text-fg">Protocol risk.</strong> Smart contracts, upgrades,
              governance actions, integrations and assets may contain defects or experience adverse
              events. Transactions are generally irreversible.
            </p>
            <p>
              <strong className="text-fg">Acceptable use.</strong> Do not use Femeora to deceive
              users, manipulate markets, distribute malicious links, impersonate protected
              identities or violate applicable law.
            </p>
          </div>
        </section>

        <section id="privacy" className="scroll-mt-24 border-b border-line py-12">
          <SectionHeading
            eyebrow="Privacy"
            title="Public chain activity stays public."
            body="Wallet addresses, transactions, positions, swaps and contract events are public blockchain data. Connecting X adds a public social identity to the Femeora account."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="glass rounded-[2px] p-5">
              <h3 className="font-medium">What the service uses</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
                <li>X handle, display name and avatar supplied during OAuth.</li>
                <li>Linked public wallet addresses and signed ownership proofs.</li>
                <li>
                  Session, security, rate-limit and product interaction data needed to operate the
                  service.
                </li>
              </ul>
            </div>
            <div className="glass rounded-[2px] p-5">
              <h3 className="font-medium">What Femeora does not request</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
                <li>Wallet seed phrases or private keys.</li>
                <li>Custody of user tokens.</li>
                <li>X write permission for posts, likes or Direct Messages.</li>
                <li>Automatic authority to Tail, rebalance, swap or launch on a user’s behalf.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="contracts" className="scroll-mt-24 py-12">
          <SectionHeading
            eyebrow="Verified mainnet contracts"
            title="Know what your wallet is calling."
            body={`Public entry points deployed on ${MAINNET_CHAIN.name}. Addresses link directly to Robinhood Etherscan. Deployment began at block ${MAINNET_CHAIN.deploymentStartBlock.toLocaleString('en-US')}; source verification is recorded as ${MAINNET_CHAIN.sourceVerification}.`}
          />
          <p className="mt-5 border border-signal/40 bg-signal/5 p-4 text-sm text-muted">
            Only public user, governance and read surfaces are listed. Implementation contracts and
            operator addresses are omitted to reduce confusion. Always compare the destination shown
            by your wallet with the relevant address below.
          </p>
          <div className="mt-8 space-y-8">
            {MAINNET_CONTRACT_GROUPS.map(group => (
              <section key={group.title}>
                <h3 className="text-xl font-medium">{group.title}</h3>
                <p className="mt-1 text-sm text-muted">{group.description}</p>
                <div className="mt-3 overflow-hidden rounded-[2px] border border-line">
                  {group.contracts.map(contract => (
                    <div
                      key={contract.address}
                      className="grid gap-2 border-b border-line p-4 last:border-b-0 lg:grid-cols-[13rem_minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div>
                        <p className="font-medium">{contract.name}</p>
                        <p className="mt-1 text-sm text-muted">{contract.description}</p>
                      </div>
                      <code className="min-w-0 break-all text-sm text-fg">{contract.address}</code>
                      <div className="flex items-center">
                        <CopyAddress address={contract.address} />
                        <a
                          href={`${MAINNET_CHAIN.explorer}/address/${contract.address}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${contract.name} on explorer`}
                          className="grid size-11 place-items-center text-muted hover:text-signal"
                        >
                          <ExternalLink aria-hidden="true" className="size-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <p className="text-sm text-muted">Need the test network instead?</p>
            <Link
              href="/testnet-guide"
              className="min-h-11 content-center text-signal underline underline-offset-4"
            >
              Open the testnet guide
            </Link>
          </div>
        </section>
      </article>
    </div>
  );
}
