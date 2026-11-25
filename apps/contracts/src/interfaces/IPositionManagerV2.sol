// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IPositionManagerV2 {
    enum Shape {
        Spot,
        Curve,
        BidAsk,
        Custom
    }

    struct RangePosition {
        address pool;
        int24 lowerBin;
        int24 upperBin;
        uint8 shape;
        bytes32 tag;
        address referrer;
        bool open;
    }

    struct CreateParams {
        address pool;
        uint8 shape;
        bytes32 tag;
        address referrer;
        int24 expectedActiveBin;
        int24[] bins;
        uint256[] amountsX;
        uint256[] amountsY;
        uint256[] minShares;
        uint256 deadline;
    }

    struct CreateDammParams {
        address pool;
        uint256 amountX;
        uint256 amountY;
        uint256 minShares;
        bytes32 tag;
        address referrer;
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
    event PositionSharesUpdated(uint256 indexed id, int24[] bins, uint256[] shares);
    event DammPositionCreated(
        uint256 indexed id, address indexed owner, address indexed pool, uint256 shares, bytes32 tag, address referrer
    );
    event DammPositionIncreased(uint256 indexed id, uint256 sharesAdded, uint256 totalShares);
    event DammPositionDecreased(uint256 indexed id, uint16 bps, uint256 amountX, uint256 amountY);
    event DammPositionClosed(uint256 indexed id);
    event PositionLocked(uint256 indexed id, address indexed owner);
    event DammFeesClaimed(uint256 indexed id, address indexed recipient, uint256 amountX, uint256 amountY);

    function createRangePosition(CreateParams calldata params) external returns (uint256 positionId);
    function createDammPosition(CreateDammParams calldata params) external returns (uint256 positionId);
    function increaseRange(
        uint256 id,
        int24 expectedActiveBin,
        int24[] calldata bins,
        uint256[] calldata amountsX,
        uint256[] calldata amountsY,
        uint256[] calldata minShares,
        uint256 deadline
    ) external;
    function decreaseRange(uint256 id, uint16 bps, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY);
    function closeRange(uint256 id, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY);
    function increaseDamm(uint256 id, uint256 amountX, uint256 amountY, uint256 minShares, uint256 deadline)
        external
        returns (uint256 sharesAdded);
    function decreaseDamm(uint256 id, uint16 bps, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY);
    function closeDamm(uint256 id, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY);
    function lockPosition(uint256 id) external;
    function claimDammFees(uint256 id, address recipient) external returns (uint256 amountX, uint256 amountY);
}
