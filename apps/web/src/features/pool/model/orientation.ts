export interface ContractAmounts {
  amountX: string;
  amountY: string;
}

/** Convert user-facing base/quote amounts back to the pool contract's X/Y order. */
export function toContractAmounts(
  baseIsTokenX: boolean,
  baseAmount: string,
  quoteAmount: string,
): ContractAmounts {
  return baseIsTokenX
    ? { amountX: baseAmount, amountY: quoteAmount }
    : { amountX: quoteAmount, amountY: baseAmount };
}
