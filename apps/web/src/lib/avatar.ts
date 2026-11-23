/**
 * Deterministic generative avatars. Every handle maps to the same picture on every
 * device, and the parameter space is large enough that two users rarely match.
 *
 * Space: 8^7 bar heights x 7 accent positions x 4 backgrounds x 4 bar tones
 * = 235 million avatars; 100k random handles collide ~20 times.
 */
export interface AvatarSpec {
  /** Seven bar heights in 0..1, drawn like a liquidity-bin histogram. */
  bars: readonly number[];
  /** Index of the bar drawn in bright white. */
  accent: number;
  /** Background and bar colors as `r g b` channels (black, white and metal only). */
  background: string;
  barTone: string;
}

const HEIGHTS = [0.24, 0.35, 0.46, 0.57, 0.68, 0.79, 0.9, 1] as const;
const BACKGROUNDS = ['20 23 27', '32 35 40', '46 50 56', '60 65 72'] as const;
const BAR_TONES = ['150 156 165', '176 181 189', '200 205 212', '222 226 231'] as const;
export const BAR_COUNT = 7;

/** FNV-1a 32-bit hash; spreads similar handles far apart. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (const char of value.toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Mulberry32: small, well-mixed PRNG so every hash bit affects every parameter. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)] ?? (items[0] as T);

export function avatarSpec(seed: string): AvatarSpec {
  const random = mulberry32(hashString(seed));
  return {
    bars: Array.from({ length: BAR_COUNT }, () => pick(HEIGHTS, random)),
    accent: Math.floor(random() * BAR_COUNT),
    background: pick(BACKGROUNDS, random),
    barTone: pick(BAR_TONES, random),
  };
}
