// Hand-maintained entrypoint ABIs for the Launch protocol. Deployment addresses
// intentionally remain environment-owned until a network deployment exists.
export const launchpadFactoryAbi = [
  {
    type: 'event',
    name: 'LaunchpadCreated',
    inputs: [
      { name: 'launchpadId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'slug', type: 'string', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'createLaunchpad',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'admins', type: 'address[]' },
      {
        name: 'identity',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'slug', type: 'string' },
          { name: 'metadataURI', type: 'string' },
          { name: 'domain', type: 'string' },
          { name: 'xHandle', type: 'string' },
        ],
      },
      {
        name: 'economics',
        type: 'tuple',
        components: [
          { name: 'quoteToken', type: 'address' },
          { name: 'tradeFeePips', type: 'uint24' },
          { name: 'creatorSharePips', type: 'uint24' },
          { name: 'launchpadSharePips', type: 'uint24' },
          { name: 'protocolSharePips', type: 'uint24' },
          { name: 'lpCreatorSharePips', type: 'uint24' },
          { name: 'lpLaunchpadSharePips', type: 'uint24' },
          { name: 'lpProtocolSharePips', type: 'uint24' },
          { name: 'graduationThreshold', type: 'uint128' },
          { name: 'curveTokenSupply', type: 'uint128' },
        ],
      },
      {
        name: 'graduation',
        type: 'tuple',
        components: [
          { name: 'target', type: 'uint8' },
          { name: 'startFeePips', type: 'uint24' },
          { name: 'endFeePips', type: 'uint24' },
          { name: 'durationSeconds', type: 'uint32' },
          { name: 'feeCurve', type: 'uint8' },
          { name: 'dlmmBinStepBps', type: 'uint16' },
          { name: 'dlmmSeedShape', type: 'uint8' },
        ],
      },
      {
        name: 'protection',
        type: 'tuple',
        components: [
          { name: 'enabled', type: 'bool' },
          { name: 'xRequired', type: 'bool' },
          { name: 'devBuyCapPips', type: 'uint24' },
          { name: 'earlyBuyCapPips', type: 'uint24' },
          { name: 'earlyBuyDurationSeconds', type: 'uint32' },
        ],
      },
    ],
    outputs: [{ name: 'launchpadId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setLaunchpadStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'launchpadId', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'supportedQuoteToken',
    stateMutability: 'view',
    inputs: [{ name: 'quoteToken', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const launchFactoryAbi = [
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'launchId', type: 'uint256', indexed: true },
      { name: 'launchpadId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'curve', type: 'address', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'metadataURI', type: 'string', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'launchToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'launchpadId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'metadataURI', type: 'string' },
      { name: 'totalSupply', type: 'uint256' },
      { name: 'identityDeadline', type: 'uint256' },
      { name: 'identityProof', type: 'bytes' },
    ],
    outputs: [
      { name: 'launchId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
] as const;

export const launchIdentityVerifierAbi = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'verificationPayload',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'nameHash', type: 'bytes32' },
      { name: 'symbolHash', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

export const bondingCurveLaunchAbi = [
  {
    type: 'event',
    name: 'Bought',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokenOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'quoteReserve', type: 'uint256', indexed: false },
      { name: 'tokenInventory', type: 'uint256', indexed: false },
      { name: 'progressPips', type: 'uint24', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Sold',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'tokenIn', type: 'uint256', indexed: false },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'quoteReserve', type: 'uint256', indexed: false },
      { name: 'tokenInventory', type: 'uint256', indexed: false },
      { name: 'progressPips', type: 'uint24', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FeePaid',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'category', type: 'uint8', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [{ name: 'quoteIn', type: 'uint256' }],
    outputs: [
      { name: 'tokenOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [{ name: 'tokenIn', type: 'uint256' }],
    outputs: [
      { name: 'quoteOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'quoteIn', type: 'uint256' },
      { name: 'minimumTokenOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokenOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'uint256' },
      { name: 'minimumQuoteOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'quoteOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'graduate',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      { name: 'pool', type: 'address' },
      { name: 'positionId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'progressPips',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
] as const;

export const launchpadRegistryAbi = [
  {
    type: 'event',
    name: 'LaunchpadStatusUpdated',
    inputs: [
      { name: 'launchpadId', type: 'uint256', indexed: true },
      { name: 'active', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'launchpad',
    stateMutability: 'view',
    inputs: [{ name: 'launchpadId', type: 'uint256' }],
    outputs: [
      {
        name: 'result',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'feeRecipient', type: 'address' },
          {
            name: 'identity',
            type: 'tuple',
            components: [
              { name: 'name', type: 'string' },
              { name: 'slug', type: 'string' },
              { name: 'metadataURI', type: 'string' },
              { name: 'domain', type: 'string' },
              { name: 'xHandle', type: 'string' },
            ],
          },
          {
            name: 'economics',
            type: 'tuple',
            components: [
              { name: 'quoteToken', type: 'address' },
              { name: 'tradeFeePips', type: 'uint24' },
              { name: 'creatorSharePips', type: 'uint24' },
              { name: 'launchpadSharePips', type: 'uint24' },
              { name: 'protocolSharePips', type: 'uint24' },
              { name: 'lpCreatorSharePips', type: 'uint24' },
              { name: 'lpLaunchpadSharePips', type: 'uint24' },
              { name: 'lpProtocolSharePips', type: 'uint24' },
              { name: 'graduationThreshold', type: 'uint128' },
              { name: 'curveTokenSupply', type: 'uint128' },
            ],
          },
          {
            name: 'graduation',
            type: 'tuple',
            components: [
              { name: 'target', type: 'uint8' },
              { name: 'startFeePips', type: 'uint24' },
              { name: 'endFeePips', type: 'uint24' },
              { name: 'durationSeconds', type: 'uint32' },
              { name: 'feeCurve', type: 'uint8' },
              { name: 'dlmmBinStepBps', type: 'uint16' },
              { name: 'dlmmSeedShape', type: 'uint8' },
            ],
          },
          {
            name: 'protection',
            type: 'tuple',
            components: [
              { name: 'enabled', type: 'bool' },
              { name: 'xRequired', type: 'bool' },
              { name: 'devBuyCapPips', type: 'uint24' },
              { name: 'earlyBuyCapPips', type: 'uint24' },
              { name: 'earlyBuyDurationSeconds', type: 'uint32' },
            ],
          },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'launchpadAdmins',
    stateMutability: 'view',
    inputs: [{ name: 'launchpadId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
] as const;

export const graduatorAbi = [
  {
    type: 'event',
    name: 'LaunchGraduated',
    inputs: [
      { name: 'curve', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'pool', type: 'address', indexed: true },
      { name: 'positionId', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'quoteAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchFeesDistributed',
    inputs: [
      { name: 'curve', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'creatorRecipient', type: 'address', indexed: false },
      { name: 'launchpadRecipient', type: 'address', indexed: false },
      { name: 'protocolRecipient', type: 'address', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
      { name: 'launchpadAmount', type: 'uint256', indexed: false },
      { name: 'protocolAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'claimLaunchFees',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'curve', type: 'address' }],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;
