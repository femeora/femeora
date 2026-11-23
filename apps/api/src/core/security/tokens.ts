import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createBytes32Tag(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}`;
}
