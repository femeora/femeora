// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DlmmPoolV2 } from "../../src/core/DlmmPoolV2.sol";
import { PoolKey, PoolKeyLib, PoolModel } from "../../src/core/PoolTypes.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";

contract DlmmSwapHandler {
    DlmmPoolV2 public immutable pool;
    MockERC20 public immutable token0;
    MockERC20 public immutable token1;

    constructor(DlmmPoolV2 pool_, MockERC20 token0_, MockERC20 token1_) {
        pool = pool_;
        token0 = token0_;
        token1 = token1_;
        token0_.approve(address(pool_), type(uint256).max);
        token1_.approve(address(pool_), type(uint256).max);
    }

    function swap0For1(uint96 rawAmount) external {
        uint256 amount = uint256(rawAmount) % 5 ether + 1;
        pool.swapExactInput(true, amount, 0, 5, address(this), block.timestamp + 1);
    }

    function swap1For0(uint96 rawAmount) external {
        uint256 amount = uint256(rawAmount) % 5 ether + 1;
        pool.swapExactInput(false, amount, 0, 5, address(this), block.timestamp + 1);
    }
}

contract DlmmPoolInvariant {
    DlmmPoolV2 private pool;
    MockERC20 private token0;
    MockERC20 private token1;
    address[] private _targets;

    function setUp() public {
        MockERC20 a = new MockERC20("Token A", "A", 18);
        MockERC20 b = new MockERC20("Token B", "B", 18);
        PoolKey memory key = PoolKeyLib.normalize(address(a), address(b), PoolModel.DLMM, 3_000, 10);
        token0 = MockERC20(key.token0);
        token1 = MockERC20(key.token1);
        pool = new DlmmPoolV2(key, address(this), 0);
        token0.mint(address(this), 1_000 ether);
        token1.mint(address(this), 1_000 ether);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);

        DlmmPoolV2.AddBin[] memory additions = new DlmmPoolV2.AddBin[](5);
        additions[0] = DlmmPoolV2.AddBin(-2, 0, 100 ether, 0);
        additions[1] = DlmmPoolV2.AddBin(-1, 0, 100 ether, 0);
        additions[2] = DlmmPoolV2.AddBin(0, 100 ether, 100 ether, 0);
        additions[3] = DlmmPoolV2.AddBin(1, 100 ether, 0, 0);
        additions[4] = DlmmPoolV2.AddBin(2, 100 ether, 0, 0);
        pool.addLiquidityBatch(bytes32("invariant"), additions, 0, address(this), block.timestamp + 1);

        DlmmSwapHandler handler = new DlmmSwapHandler(pool, token0, token1);
        token0.mint(address(handler), 10_000 ether);
        token1.mint(address(handler), 10_000 ether);
        _targets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) {
        return _targets;
    }

    function invariant_TokenBalancesBackReservesAndProtocolFees() public view {
        uint256 reserves0;
        uint256 reserves1;
        for (int24 binId = -2; binId <= 2; ++binId) {
            (uint128 reserve0, uint128 reserve1,,) = pool.binState(binId);
            reserves0 += reserve0;
            reserves1 += reserve1;
        }
        require(
            token0.balanceOf(address(pool)) == reserves0 + pool.protocolFees0(),
            "token0 conservation"
        );
        require(
            token1.balanceOf(address(pool)) == reserves1 + pool.protocolFees1(),
            "token1 conservation"
        );
    }

    function invariant_DynamicFeeNeverExceedsHardCap() public view {
        require(pool.currentFeePips() <= pool.MAX_TOTAL_FEE_PIPS(), "fee cap");
    }
}
