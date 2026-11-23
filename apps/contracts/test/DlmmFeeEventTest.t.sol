// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

interface FeeEventVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract DlmmFeeEventTest {
    FeeEventVm private constant vm = FeeEventVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant BIN_FEE_TOPIC = keccak256("BinFeeAccrued(int24,bool,uint256,uint256)");

    DlmmPoolV2 private pool;
    MockERC20 private token0;
    MockERC20 private token1;

    function setUp() public {
        MockERC20 a = new MockERC20("Token A", "A", 18);
        MockERC20 b = new MockERC20("Token B", "B", 18);
        PoolKey memory key = PoolKeyLib.normalize(address(a), address(b), PoolModel.DLMM, 3_000, 25);
        token0 = MockERC20(key.token0);
        token1 = MockERC20(key.token1);
        pool = new DlmmPoolV2(key, address(this), 0);
        pool.setReserveCaps(type(uint256).max, type(uint256).max);
        token0.mint(address(this), 1_000 ether);
        token1.mint(address(this), 1_000 ether);
        token0.approve(address(pool), type(uint256).max);
        token1.approve(address(pool), type(uint256).max);

        DlmmPoolV2.AddBin[] memory additions = new DlmmPoolV2.AddBin[](1);
        additions[0] = DlmmPoolV2.AddBin(0, 100 ether, 100 ether, 0);
        pool.addLiquidityBatch(bytes32("fee-event"), additions, 0, address(this), block.timestamp + 1);
    }

    function test_SwapEmitsExactPerBinLpFeeAndShareDenominator() public {
        (,, uint256 sharesBefore,) = pool.binState(0);
        uint256 amountIn = 1 ether;

        vm.recordLogs();
        (uint256 amountOut,) = pool.swapExactInput(true, amountIn, 0, 1, address(this), block.timestamp + 1);
        FeeEventVm.Log[] memory logs = vm.getRecordedLogs();

        uint256 matches;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(pool) || logs[i].topics[0] != BIN_FEE_TOPIC) continue;
            ++matches;
            require(int256(uint256(logs[i].topics[1])) == 0, "bin id");
            (bool token0ToToken1, uint256 lpFee, uint256 totalShares) =
                abi.decode(logs[i].data, (bool, uint256, uint256));
            require(token0ToToken1, "direction");
            require(lpFee == amountIn - amountOut, "exact LP fee");
            require(totalShares == sharesBefore, "share denominator");
        }
        require(matches == 1, "one fee event per consumed bin");
    }

    function test_ReserveCapsRejectLiquidityAboveLimit() public {
        pool.setReserveCaps(100 ether, 100 ether);
        DlmmPoolV2.AddBin[] memory additions = new DlmmPoolV2.AddBin[](1);
        additions[0] = DlmmPoolV2.AddBin(0, 1 ether, 1 ether, 0);
        (bool success,) = address(pool)
            .call(
                abi.encodeCall(
                    DlmmPoolV2.addLiquidityBatch,
                    (bytes32("cap"), additions, int24(0), address(this), block.timestamp + 1)
                )
            );
        require(!success, "reserve cap bypassed");
    }
}
