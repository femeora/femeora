export interface PublicContract {
  name: string;
  address: `0x${string}`;
  description: string;
}

export interface PublicContractGroup {
  title: string;
  description: string;
  contracts: readonly PublicContract[];
}

/**
 * Public Robinhood Chain mainnet surfaces only. These values are mirrored from
 * apps/contracts/deployments/mainnet*.json; implementation addresses, operator
 * EOAs and transaction calldata are intentionally not presented as user entry points.
 */
export const MAINNET_CONTRACT_GROUPS: readonly PublicContractGroup[] = [
  {
    title: 'Liquidity protocol',
    description: 'Canonical pool discovery, position ownership, swaps and accounting.',
    contracts: [
      {
        name: 'Pool Factory',
        address: '0x9250b27a4116D031d932251B44EC67c1F8390c20',
        description: 'Creates canonical DAMM and DLMM pools.',
      },
      {
        name: 'Pool Registry',
        address: '0xF0D70f849Ce71748643e95fDC8F8aDCd73e1dD3C',
        description: 'Canonical registry for pools created through Femeora.',
      },
      {
        name: 'Position Manager V2',
        address: '0x873573a41E0a8cBde1C773065fEe27c30b743777',
        description: 'ERC-721 ownership and lifecycle for liquidity positions.',
      },
      {
        name: 'Swap Router',
        address: '0xC9798a7F38FEeB0A98A8739ee3921D5759ccf54f',
        description: 'Routes exact-input and exact-output swaps.',
      },
      {
        name: 'Fee Splitter',
        address: '0xa477AC4712C5847218768D42127ac5a8287A7FaD',
        description: 'Accounts for protocol fee distribution.',
      },
      {
        name: 'DLMM Lens',
        address: '0x9E5463DD55aC3c5F24912aD388e07C98F18B4c79',
        description: 'Read-only DLMM bin and position valuation helper.',
      },
      {
        name: 'DLMM V2 Pool Deployer',
        address: '0x514bf0b69ADCABe39A82C79220ace8686F15D46E',
        description: 'Deterministic deployment surface for DLMM V2 pools.',
      },
      {
        name: 'DAMM Pool Deployer',
        address: '0xDC96da1Dc473919a9B7Ed90a4c847c6D64bBd210',
        description: 'Active deterministic deployment surface for DAMM pools.',
      },
    ],
  },
  {
    title: 'Launch protocol',
    description:
      'Launchpad configuration, protected token creation, bonding curves and graduation.',
    contracts: [
      {
        name: 'Launchpad Factory',
        address: '0xF1e9E932132cD1f46ba067B3eBB075E12711F2Ce',
        description: 'Creates on-chain launchpads and their immutable economics.',
      },
      {
        name: 'Launchpad Registry',
        address: '0x0A113980B0cfbc3B98467E9D04647d61aCBfa961',
        description: 'Canonical launchpad directory.',
      },
      {
        name: 'Launch Config Registry',
        address: '0xfFC577f7Ba948D28fC727982D1b1276127342f4a',
        description: 'Stores reusable launch and curve configurations.',
      },
      {
        name: 'Launch Factory',
        address: '0x3b08Cb77980F0cddB7CFA228a51AEd6625308299',
        description: 'Creates fixed-supply launch tokens and bonding curves.',
      },
      {
        name: 'Graduator',
        address: '0xE9F808AD9bC9734a45aa5eee51048700134729fC',
        description: 'Moves eligible launches into locked DAMM liquidity.',
      },
      {
        name: 'Launch Identity Verifier',
        address: '0x4eb3BBEEf7792e149D637E7c91Ad97Dc9206E0ac',
        description: 'Verifies short-lived protected-launch identity proofs.',
      },
    ],
  },
  {
    title: 'Governance',
    description: 'Public control surfaces for delayed protocol administration.',
    contracts: [
      {
        name: 'Governance Safe',
        address: '0x55a91E02f93c56D5ed6E5Af8c7128d4533D9F784',
        description: '2-of-3 Safe used to authorize governance operations.',
      },
      {
        name: 'Protocol Timelock',
        address: '0x0Db9C101586D4021983D0C8b356aBAF8C1a7AbFd',
        description: 'Enforces a five-minute delay before scheduled protocol operations.',
      },
    ],
  },
  {
    title: 'Supported launch quote assets',
    description: 'Canonical assets accepted by the deployed launch system.',
    contracts: [
      {
        name: 'USDG',
        address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
        description: 'Global Dollar on Robinhood Chain.',
      },
      {
        name: 'WETH',
        address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
        description: 'Wrapped Ether on Robinhood Chain.',
      },
    ],
  },
] as const;

export const MAINNET_CHAIN = {
  name: 'Robinhood Chain Mainnet',
  chainId: 4663,
  explorer: 'https://robin.etherscan.io',
  deploymentStartBlock: 121869016,
  sourceVerification: 'Sourcify exact match',
} as const;
