import { amountsForShares, convertTokenAmountAtPrice, rawUnitsToDecimal } from '@fomeora/sdk';

export interface PositionValueBin {
  readonly shares: bigint;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly totalShares: bigint;
  readonly priceX18: bigint;
}

export interface QuoteConfiguration {
  readonly quoteIsToken0: boolean;
  readonly decimals0: number;
  readonly decimals1: number;
}

export function calculateDlmmPositionQuote(
  bins: readonly PositionValueBin[],
  quote: QuoteConfiguration,
): string {
  let quoteRaw = 0n;
  for (const bin of bins) {
    const amounts = amountsForShares(bin.shares, bin.reserve0, bin.reserve1, bin.totalShares);
    quoteRaw += quote.quoteIsToken0
      ? amounts.amount0 + convertTokenAmountAtPrice(
          amounts.amount1,
          bin.priceX18,
          false,
          quote.decimals0,
          quote.decimals1,
        )
      : amounts.amount1 + convertTokenAmountAtPrice(
          amounts.amount0,
          bin.priceX18,
          true,
          quote.decimals0,
          quote.decimals1,
        );
  }
  return rawUnitsToDecimal(
    quoteRaw,
    quote.quoteIsToken0 ? quote.decimals0 : quote.decimals1,
    18,
  );
}

export function calculateDammPositionQuote(
  shares: bigint,
  reserve0: bigint,
  reserve1: bigint,
  totalShares: bigint,
  quote: QuoteConfiguration,
): string {
  const amounts = amountsForShares(shares, reserve0, reserve1, totalShares);
  const quoteRaw = quote.quoteIsToken0
    ? amounts.amount0 + (reserve1 === 0n ? 0n : amounts.amount1 * reserve0 / reserve1)
    : amounts.amount1 + (reserve0 === 0n ? 0n : amounts.amount0 * reserve1 / reserve0);
  return rawUnitsToDecimal(
    quoteRaw,
    quote.quoteIsToken0 ? quote.decimals0 : quote.decimals1,
    18,
  );
}
