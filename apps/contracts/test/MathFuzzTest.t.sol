// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ConstantProductMath } from "../src/math/ConstantProductMath.sol";

contract MathFuzzTest {
    function testFuzz_ExactOutputInputAlwaysCoversRequestedOutput(
        uint96 rawReserveIn,
        uint96 rawReserveOut,
        uint96 rawAmountOut,
        uint24 rawFee
    ) public pure {
        uint256 reserveIn = uint256(rawReserveIn) + 1_000_000;
        uint256 reserveOut = uint256(rawReserveOut) + 1_000_000;
        uint256 amountOut = uint256(rawAmountOut) % (reserveOut - 1) + 1;
        uint24 fee = rawFee % 100_001;
        (uint256 amountIn,) =
            ConstantProductMath.quoteExactOutput(amountOut, reserveIn, reserveOut, fee);
        (uint256 resultingOutput,) =
            ConstantProductMath.quoteExactInput(amountIn, reserveIn, reserveOut, fee);
        require(resultingOutput >= amountOut, "exact-output underquoted input");
    }
}
