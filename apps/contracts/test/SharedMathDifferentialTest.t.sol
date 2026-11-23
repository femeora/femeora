// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { BinPriceMath } from "../src/math/BinPriceMath.sol";
import { DlmmV2LiquidityMath } from "../src/math/DlmmV2LiquidityMath.sol";

/// @notice Golden vectors are shared with packages/sdk/src/math.test.ts.
contract SharedMathDifferentialTest {
    function test_BinPriceGoldenVectorsMatchSharedSdk() public pure {
        require(BinPriceMath.priceFromBin(0, 25) == 1_000_000_000_000_000_000, "bin 0");
        require(BinPriceMath.priceFromBin(1, 25) == 1_002_500_000_000_000_000, "bin 1");
        require(BinPriceMath.priceFromBin(-1, 25) == 997_506_234_413_965_087, "bin -1");
        require(BinPriceMath.priceFromBin(2, 25) == 1_005_006_250_000_000_000, "bin 2");
        require(BinPriceMath.priceFromBin(-2, 25) == 995_018_687_694_728_266, "bin -2");
        require(BinPriceMath.priceFromBin(20, 100) == 1_220_190_039_947_966_823, "bin 20");
    }

    function test_QuoteAndTokenValueGoldenVectorsMatchSharedSdk() public pure {
        uint256 price = BinPriceMath.priceFromBin(1, 25);
        require(BinPriceMath.quoteAtPrice(1_000_000, price, true) == 1_002_500, "quote forward");
        require(BinPriceMath.quoteAtPrice(1_002_500, price, false) == 1_000_000, "quote reverse");
        require(
            DlmmV2LiquidityMath.token1Value(2e18, 3e6, 1e18, 18, 6) == 5e6,
            "decimal value"
        );
    }
}
