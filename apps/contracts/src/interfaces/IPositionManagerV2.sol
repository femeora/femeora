// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPositionManagerV2 {
    enum Shape {
        Spot,
        Curve,
        BidAsk,
        Custom
    }

    struct RangePosition {
        address owner;
        address pool;
        int24 lowerBin;
        int24 upperBin;
        uint8 shape;
        bytes32 tag; // callout intent tag or tail tag, 0 if none
        address referrer; // caller wallet when tailing, 0 if none
    }

    struct CreateParams {
        address pool;
        int24 lowerBin;
        int24 upperBin;
        uint8 shape;
        bytes32 tag;
        address referrer;
        int24[] bins;
        uint256[] amountsX;
        uint256[] amountsY;
        uint256[] minShares;
        uint256 deadline;
    }

    event RangePositionCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed pool,
        int24 lowerBin,
        int24 upperBin,
        uint8 shape,
        bytes32 tag,
        address referrer
    );

    event RangePositionIncreased(uint256 indexed id, int24[] bins, uint256[] amountsX, uint256[] amountsY);
    event RangePositionDecreased(uint256 indexed id, uint16 bps, uint256 amountX, uint256 amountY);
    event RangePositionClosed(uint256 indexed id);

    function createRangePosition(CreateParams calldata params) external returns (uint256 positionId);
    function increaseRange(uint256 id, int24[] calldata bins, uint256[] calldata ax, uint256[] calldata ay) external;
    function decreaseRange(uint256 id, uint16 bps, uint256 minX, uint256 minY) external;
    function closeRange(uint256 id) external;
}
