// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DammPool} from "../src/core/DammPool.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract DammPoolTest {
    DammPool private pool;
    MockERC20 private token0;
    MockERC20 private token1;

    function setUp() public {
        MockERC20 a = new MockERC20("Token A", "A", 18);
        MockERC20 b = new MockERC20("Token B", "B", 18);
        PoolKey memory key = PoolKeyLib.normalize(address(a), address(b), PoolModel.DAMM, 3_000, 0);
        token0 = MockERC20(key.token0);
        token1 = MockERC20(key.token1);
        pool = new DammPool(key, address(this));
        pool.setReserveCaps(type(uint112).max, type(uint112).max);
        token0.mint(address(this), 2_000 ether);
        token1.mint(address(this), 2_000 ether);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);
        pool.addLiquidity(1_000 ether, 1_000 ether, 0, address(this), block.timestamp + 1);
    }

    function testExactOutputChargesNoMoreThanQuotedInput() public {
        uint256 output = 10 ether;
        (uint256 quotedInput,) = pool.quoteExactOutput(address(token0), output);
        uint256 beforeInput = token0.balanceOf(address(this));
        uint256 beforeOutput = token1.balanceOf(address(this));
        uint256 used = pool.swapExactOutput(address(token0), output, quotedInput, address(this), block.timestamp + 1);
        require(used == quotedInput, "quote mismatch");
        require(beforeInput - token0.balanceOf(address(this)) == quotedInput, "input");
        require(token1.balanceOf(address(this)) - beforeOutput == output, "output");
    }

    function testExactOutputRejectsMaximumInputBelowQuote() public {
        (uint256 quotedInput,) = pool.quoteExactOutput(address(token0), 10 ether);
        (bool success,) = address(pool)
            .call(
                abi.encodeCall(
                    DammPool.swapExactOutput,
                    (address(token0), 10 ether, quotedInput - 1, address(this), block.timestamp + 1)
                )
            );
        require(!success, "slippage accepted");
    }

    function testReserveCapsRejectLiquidityAboveLimit() public {
        pool.setReserveCaps(1_000 ether, 1_000 ether);
        (bool success,) = address(pool)
            .call(abi.encodeCall(DammPool.addLiquidity, (1 ether, 1 ether, 0, address(this), block.timestamp + 1)));
        require(!success, "reserve cap bypassed");
    }
}
