// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DammPool} from "../src/core/DammPool.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

interface VmDammTest {
    function warp(uint256 timestamp) external;
}

contract DammPoolTest {
    VmDammTest private constant vm = VmDammTest(address(uint160(uint256(keccak256("hevm cheat code")))));
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

    function testLinearFeeScheduleAtStartMiddleAndEnd() public {
        PoolKey memory key = PoolKeyLib.normalize(address(token0), address(token1), PoolModel.DAMM, 3_000, 0);
        DammPool scheduled = new DammPool(key, address(this));
        scheduled.setReserveCaps(type(uint112).max, type(uint112).max);
        scheduled.configureFeeSchedule(500_000, 3_000, 30 minutes, false);
        uint256 started = block.timestamp;
        require(scheduled.feePips() == 500_000, "start fee");
        vm.warp(started + 15 minutes);
        require(scheduled.feePips() == 251_500, "middle fee");
        vm.warp(started + 30 minutes);
        require(scheduled.feePips() == 3_000, "end fee");
    }

    function testExponentialFeeScheduleAtStartMiddleAndEnd() public {
        PoolKey memory key = PoolKeyLib.normalize(address(token0), address(token1), PoolModel.DAMM, 3_000, 0);
        DammPool scheduled = new DammPool(key, address(this));
        scheduled.setReserveCaps(type(uint112).max, type(uint112).max);
        scheduled.configureFeeSchedule(500_000, 3_000, 30 minutes, true);
        uint256 started = block.timestamp;
        require(scheduled.feePips() == 500_000, "start fee");
        vm.warp(started + 15 minutes);
        require(scheduled.feePips() == 127_250, "middle fee");
        vm.warp(started + 30 minutes);
        require(scheduled.feePips() == 3_000, "end fee");
    }

    function testSwapDoesNotDecreaseConstantProduct() public {
        uint256 productBefore = uint256(pool.reserve0()) * pool.reserve1();
        pool.swapExactInput(address(token0), 10 ether, 0, address(this), block.timestamp + 1);
        uint256 productAfter = uint256(pool.reserve0()) * pool.reserve1();
        require(productAfter >= productBefore, "constant product decreased");
    }

    function testLpFeesAreClaimableWithoutTouchingPrincipal() public {
        pool.swapExactInput(address(token0), 10 ether, 0, address(this), block.timestamp + 1);
        (uint256 fee0, uint256 fee1) = pool.claimableFees(address(this));
        require(fee0 != 0 && fee1 == 0, "claimable fee");
        uint112 reserve0Before = pool.reserve0();
        uint112 reserve1Before = pool.reserve1();
        pool.claimLpFees(fee0, fee1, address(this));
        require(pool.reserve0() == reserve0Before && pool.reserve1() == reserve1Before, "principal changed");
    }
}
