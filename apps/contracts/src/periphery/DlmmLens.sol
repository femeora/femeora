// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DlmmPoolV2 } from "../core/DlmmPoolV2.sol";
import { PositionManagerV2 } from "../liquidity/PositionManagerV2.sol";
import { FullMath } from "../math/FullMath.sol";

/// @notice Bounded, stateless DLMM bin reader for indexers and interfaces.
contract DlmmLens {
    uint256 public constant MAX_BINS = 400;
    int24 public constant MIN_BIN = -10_000;
    int24 public constant MAX_BIN = 10_000;

    struct BinView {
        int24 binId;
        uint128 reserve0;
        uint128 reserve1;
        uint256 totalShares;
        uint256 priceX18;
    }

    struct PositionBinValue {
        int24 binId;
        uint256 shares;
        uint256 amount0;
        uint256 amount1;
    }

    error InvalidPool();
    error InvalidRange();
    error RangeTooWide();

    function bins(DlmmPoolV2 pool, int24 lower, int24 upper, bool skipEmpty)
        external
        view
        returns (int24 activeBin, BinView[] memory result)
    {
        if (address(pool).code.length == 0) revert InvalidPool();
        if (lower < MIN_BIN || upper > MAX_BIN || lower > upper) revert InvalidRange();
        uint256 count = uint256(int256(upper) - int256(lower) + 1);
        if (count > MAX_BINS) revert RangeTooWide();

        activeBin = pool.activeBin();
        result = new BinView[](count);
        uint256 written;
        for (int256 cursor = lower; cursor <= upper; ++cursor) {
            int24 binId = int24(cursor);
            (uint128 reserve0, uint128 reserve1, uint256 totalShares, uint256 priceX18) =
                pool.binState(binId);
            if (skipEmpty && totalShares == 0) continue;
            result[written++] = BinView(binId, reserve0, reserve1, totalShares, priceX18);
        }
        assembly ("memory-safe") {
            mstore(result, written)
        }
    }

    function getActiveRange(DlmmPoolV2 pool, uint24 radius, bool skipEmpty)
        external
        view
        returns (int24 activeBin, BinView[] memory result)
    {
        if (address(pool).code.length == 0) revert InvalidPool();
        if (uint256(radius) * 2 + 1 > MAX_BINS) revert RangeTooWide();
        activeBin = pool.activeBin();
        int256 lowerRaw = int256(activeBin) - int256(uint256(radius));
        int256 upperRaw = int256(activeBin) + int256(uint256(radius));
        if (lowerRaw < MIN_BIN || upperRaw > MAX_BIN) revert InvalidRange();
        return this.bins(pool, int24(lowerRaw), int24(upperRaw), skipEmpty);
    }

    function positionValue(PositionManagerV2 manager, uint256 positionId)
        external
        view
        returns (
            address poolAddress,
            uint256 totalAmount0,
            uint256 totalAmount1,
            PositionBinValue[] memory values
        )
    {
        (poolAddress,,,,,,) = manager.positions(positionId);
        if (poolAddress == address(0) || poolAddress.code.length == 0) revert InvalidPool();
        DlmmPoolV2 pool = DlmmPoolV2(poolAddress);
        int24[] memory positionBins = manager.positionBins(positionId);
        values = new PositionBinValue[](positionBins.length);
        for (uint256 i; i < positionBins.length; ++i) {
            int24 binId = positionBins[i];
            uint256 shares = manager.binShares(positionId, binId);
            (uint128 reserve0, uint128 reserve1, uint256 totalShares,) = pool.binState(binId);
            uint256 amount0;
            uint256 amount1;
            if (shares != 0 && totalShares != 0) {
                amount0 = FullMath.mulDiv(shares, reserve0, totalShares);
                amount1 = FullMath.mulDiv(shares, reserve1, totalShares);
            }
            values[i] = PositionBinValue(binId, shares, amount0, amount1);
            totalAmount0 += amount0;
            totalAmount1 += amount1;
        }
    }
}
