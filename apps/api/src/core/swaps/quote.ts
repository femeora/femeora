import { priceFromBinX18 } from '@fomeora/sdk';

const FEE_DENOMINATOR = 1_000_000n;
const PRICE_SCALE = 10n ** 18n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('INVALID_DIVISION');
  return numerator === 0n ? 0n : (numerator - 1n) / denominator + 1n;
}

export function quoteDammExactInput(input: {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feePips: number;
}) {
  const { amountIn, reserveIn, reserveOut, feePips } = input;
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) throw new RangeError('INSUFFICIENT_LIQUIDITY');
  if (!Number.isInteger(feePips) || feePips < 0 || feePips >= Number(FEE_DENOMINATOR)) {
    throw new RangeError('INVALID_FEE');
  }
  const feeAmount = ceilDiv(amountIn * BigInt(feePips), FEE_DENOMINATOR);
  const netAmountIn = amountIn - feeAmount;
  const amountOut = netAmountIn * reserveOut / (reserveIn + netAmountIn);
  if (amountOut <= 0n || amountOut >= reserveOut) throw new RangeError('INSUFFICIENT_LIQUIDITY');
  return { amountOut, totalFee: feeAmount, binCrossings: 0 };
}

export type QuoteBin = { binId: number; reserve0: bigint; reserve1: bigint };

function quoteAtPrice(input: {
  amount: bigint;
  priceX18: bigint;
  token0ToToken1: boolean;
  decimals0: number;
  decimals1: number;
  roundUp: boolean;
}) {
  const { amount, priceX18, token0ToToken1, decimals0, decimals1, roundUp } = input;
  if (![decimals0, decimals1].every(value => Number.isInteger(value) && value >= 0 && value <= 36)) {
    throw new RangeError('INVALID_DECIMALS');
  }
  let numeratorFactor = token0ToToken1 ? priceX18 : PRICE_SCALE;
  let denominator = token0ToToken1 ? PRICE_SCALE : priceX18;
  const sourceDecimals = token0ToToken1 ? decimals0 : decimals1;
  const targetDecimals = token0ToToken1 ? decimals1 : decimals0;
  if (targetDecimals > sourceDecimals) {
    numeratorFactor *= 10n ** BigInt(targetDecimals - sourceDecimals);
  } else if (sourceDecimals > targetDecimals) {
    denominator *= 10n ** BigInt(sourceDecimals - targetDecimals);
  }
  const numerator = amount * numeratorFactor;
  return roundUp ? ceilDiv(numerator, denominator) : numerator / denominator;
}

// Branches mirror the audited Solidity per-bin rounding path.
// eslint-disable-next-line complexity
export function quoteDlmmExactInput(input: {
  amountIn: bigint;
  token0ToToken1: boolean;
  feePips: number;
  binStepBps: number;
  decimals0: number;
  decimals1: number;
  maximumBinCrossings: number;
  bins: readonly QuoteBin[];
}) {
  const { token0ToToken1, binStepBps, maximumBinCrossings, bins } = input;
  if (input.amountIn <= 0n) throw new RangeError('INVALID_AMOUNT');
  if (!Number.isInteger(maximumBinCrossings) || maximumBinCrossings < 1 || maximumBinCrossings > 64) {
    throw new RangeError('INVALID_BIN_CROSSINGS');
  }
  if (!Number.isInteger(input.feePips) || input.feePips < 0 || input.feePips >= Number(FEE_DENOMINATOR)) {
    throw new RangeError('INVALID_FEE');
  }

  const feePips = BigInt(input.feePips);
  let remaining = input.amountIn;
  let amountOut = 0n;
  let totalFee = 0n;
  let binCrossings = 0;

  for (const bin of bins) {
    if (remaining === 0n || binCrossings >= maximumBinCrossings) break;
    const outputReserve = token0ToToken1 ? bin.reserve1 : bin.reserve0;
    if (outputReserve === 0n) continue;
    const priceX18 = priceFromBinX18(bin.binId, binStepBps);
    let fee = ceilDiv(remaining * feePips, FEE_DENOMINATOR);
    let netInput = remaining - fee;
    let output = quoteAtPrice({
      amount: netInput,
      priceX18,
      token0ToToken1,
      decimals0: input.decimals0,
      decimals1: input.decimals1,
      roundUp: false,
    });
    let consumed = remaining;
    if (output > outputReserve) {
      output = outputReserve;
      netInput = quoteAtPrice({
        amount: output,
        priceX18,
        token0ToToken1: !token0ToToken1,
        decimals0: input.decimals0,
        decimals1: input.decimals1,
        roundUp: true,
      });
      consumed = ceilDiv(netInput * FEE_DENOMINATOR, FEE_DENOMINATOR - feePips);
      fee = consumed - netInput;
    }
    remaining -= consumed;
    amountOut += output;
    totalFee += fee;
    binCrossings += 1;
  }
  if (remaining !== 0n || amountOut === 0n) throw new RangeError('INSUFFICIENT_LIQUIDITY');
  return { amountOut, totalFee, binCrossings };
}
