import { getAddress, hashMessage, type Hex } from 'viem';

export const WALLET_CHALLENGE_TTL_SECONDS = 10 * 60;
export const MAX_WALLETS_PER_USER = 3;

export type WalletChallengeMessageInput = {
  webBaseUrl: string;
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
};

export function normalizeWalletAddress(address: string): `0x${string}` {
  return getAddress(address.toLowerCase()).toLowerCase() as `0x${string}`;
}

export function buildWalletChallengeMessage(input: WalletChallengeMessageInput): string {
  const origin = new URL(input.webBaseUrl).origin;
  const domain = new URL(input.webBaseUrl).host;
  return [
    'Femeora wallet ownership verification',
    '',
    `Domain: ${domain}`,
    `Origin: ${origin}`,
    `Wallet: ${normalizeWalletAddress(input.walletAddress)}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join('\n');
}

export function walletChallengeMessageHash(message: string): Hex {
  return hashMessage(message);
}
