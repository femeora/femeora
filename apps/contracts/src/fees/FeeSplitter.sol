// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ProtocolAccess } from "../access/ProtocolAccess.sol";
import { TokenTransfer } from "../libraries/TokenTransfer.sol";
import { UUPSUpgradeable } from "../proxy/UUPSUpgradeable.sol";
import { ReentrancyGuard } from "../security/ReentrancyGuard.sol";

interface IReferrerPositionManager {
    function ownerOf(uint256 positionId) external view returns (address);

    function positions(uint256 positionId)
        external
        view
        returns (
            address pool,
            int24 lowerBin,
            int24 upperBin,
            uint8 shape,
            bytes32 calloutTag,
            address referrer,
            bool open
        );

    function referrerPosition(uint256 tailPositionId) external view returns (uint256 sourcePositionId);
    function tailProtocolFeesOwed0(uint256 tailPositionId) external view returns (uint256 amount);
    function tailProtocolFeesOwed1(uint256 tailPositionId) external view returns (uint256 amount);
    function checkpointTailProtocolFees(uint256 tailPositionId) external;
}

interface IProtocolFeePool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function collectProtocolFees() external returns (uint256 amount0, uint256 amount1);
}

contract FeeSplitter is ProtocolAccess, UUPSUpgradeable, ReentrancyGuard {
    using TokenTransfer for address;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_TAIL_REWARD_BPS = 2_000;
    uint256 public constant MAX_BATCH_CLAIMS = 50;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("FOMEORA_DISTRIBUTOR_ROLE");

    error InvalidConfiguration();
    error InsufficientRewardReserve();

    address public treasury;
    uint16 public tailRewardBps;
    // Appended storage for proxy-safe upgrades. Never reorder existing fields.
    address public positionManager;
    mapping(address token => uint256 amount) public reservedRewards;
    mapping(uint256 tailPositionId => uint256 amount) public claimedProtocolBasis0;
    mapping(uint256 tailPositionId => uint256 amount) public claimedProtocolBasis1;

    event TreasuryUpdated(address indexed previousTreasury, address indexed treasury);
    event TailRewardUpdated(uint16 previousBps, uint16 bps);
    event FeesDistributed(address indexed token, address indexed referrer, uint256 treasuryAmount, uint256 tailReward);
    event PositionManagerUpdated(address indexed previousPositionManager, address indexed positionManager);
    event TailFeesDistributed(
        address indexed token,
        address indexed referrer,
        uint256 indexed referrerPositionId,
        uint256 treasuryAmount,
        uint256 tailReward,
        bool eligible
    );
    event PoolProtocolFeesCollected(
        address indexed pool,
        address indexed token,
        uint256 amount,
        uint256 treasuryAmount,
        uint256 rewardReserve
    );

    constructor() { _disableInitializers(); }

    function initialize(address admin, address upgrader, address treasury_) external initializer {
        if (treasury_ == address(0)) revert InvalidConfiguration();
        __ProtocolAccess_init(admin, upgrader);
        treasury = treasury_;
        tailRewardBps = 0;
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert InvalidConfiguration();
        address previous = treasury;
        treasury = treasury_;
        emit TreasuryUpdated(previous, treasury_);
    }

    function setTailRewardBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_TAIL_REWARD_BPS) revert InvalidConfiguration();
        uint16 previous = tailRewardBps;
        tailRewardBps = bps;
        emit TailRewardUpdated(previous, bps);
    }

    function setPositionManager(address positionManager_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (positionManager_ == address(0)) revert InvalidConfiguration();
        address previous = positionManager;
        positionManager = positionManager_;
        emit PositionManagerUpdated(previous, positionManager_);
    }

    /// @notice Legacy distribution path. Amounts without a canonical source position
    /// are treasury-only so enabling tail rewards cannot create unattributed payouts.
    function distribute(address token, address referrer, uint256 amount)
        external nonReentrant onlyRole(DISTRIBUTOR_ROLE)
    {
        _pullAndDistribute(token, address(0), amount, false);
        emit FeesDistributed(token, referrer, amount, 0);
    }

    /// @notice Distributes an attributed fee only while the referrer still owns an
    /// open canonical position. Invalid or closed sources safely fall back to treasury.
    function distributeForTail(address token, address referrer, uint256 referrerPositionId, uint256 amount)
        external
        nonReentrant
        onlyRole(DISTRIBUTOR_ROLE)
    {
        bool eligible = _isEligibleReferrer(referrer, referrerPositionId);
        (uint256 treasuryAmount, uint256 reward) = _pullAndDistribute(token, referrer, amount, eligible);
        emit FeesDistributed(token, referrer, treasuryAmount, reward);
        emit TailFeesDistributed(token, referrer, referrerPositionId, treasuryAmount, reward, eligible);
    }

    function isEligibleReferrer(address referrer, uint256 referrerPositionId) external view returns (bool) {
        return _isEligibleReferrer(referrer, referrerPositionId);
    }

    /// @notice Permissionless collection. The configured reward share is held
    /// inside this contract; the remainder reaches treasury immediately.
    function collectPoolProtocolFees(address pool) external nonReentrant {
        _collectPoolProtocolFees(pool);
    }

    /// @notice Settles newly checkpointed protocol-fee basis for one tailed
    /// position. Repeated calls are idempotent. Ineligible rewards go to treasury.
    function claimTailRewards(uint256 tailPositionId)
        external
        nonReentrant
        returns (uint256 reward0, uint256 reward1)
    {
        return _claimTailRewards(tailPositionId);
    }

    function claimTailRewardsBatch(uint256[] calldata tailPositionIds) external nonReentrant {
        uint256 length = tailPositionIds.length;
        if (length == 0 || length > MAX_BATCH_CLAIMS) revert InvalidConfiguration();
        for (uint256 i; i < length; ++i) _claimTailRewards(tailPositionIds[i]);
    }

    function _claimTailRewards(uint256 tailPositionId)
        private
        returns (uint256 reward0, uint256 reward1)
    {
        address manager = positionManager;
        if (manager == address(0)) revert InvalidConfiguration();
        IReferrerPositionManager(manager).checkpointTailProtocolFees(tailPositionId);

        (address pool,,,,, address referrer,) =
            IReferrerPositionManager(manager).positions(tailPositionId);
        if (pool == address(0) || referrer == address(0)) revert InvalidConfiguration();
        uint256 sourcePositionId = IReferrerPositionManager(manager).referrerPosition(tailPositionId);
        if (sourcePositionId == 0) revert InvalidConfiguration();

        uint256 cumulative0 = IReferrerPositionManager(manager).tailProtocolFeesOwed0(tailPositionId);
        uint256 cumulative1 = IReferrerPositionManager(manager).tailProtocolFeesOwed1(tailPositionId);
        uint256 basis0 = cumulative0 - claimedProtocolBasis0[tailPositionId];
        uint256 basis1 = cumulative1 - claimedProtocolBasis1[tailPositionId];
        claimedProtocolBasis0[tailPositionId] = cumulative0;
        claimedProtocolBasis1[tailPositionId] = cumulative1;

        address token0 = IProtocolFeePool(pool).token0();
        address token1 = IProtocolFeePool(pool).token1();
        _collectPoolProtocolFees(pool);
        bool eligible = _isEligibleReferrer(referrer, sourcePositionId);
        reward0 = _settleTailReward(token0, referrer, sourcePositionId, basis0, eligible);
        reward1 = _settleTailReward(token1, referrer, sourcePositionId, basis1, eligible);
    }

    function _pullAndDistribute(address token, address referrer, uint256 amount, bool eligible)
        internal
        returns (uint256 treasuryAmount, uint256 reward)
    {
        if (token == address(0) || amount == 0) revert InvalidConfiguration();
        token.pullExact(msg.sender, amount);
        reward = eligible ? amount * tailRewardBps / BPS_DENOMINATOR : 0;
        treasuryAmount = amount - reward;
        if (reward != 0) token.pushExact(referrer, reward);
        token.pushExact(treasury, treasuryAmount);
    }

    function _reserveCollectedFee(address pool, address token, uint256 amount) private {
        if (amount == 0) return;
        uint256 rewardReserve = amount * tailRewardBps / BPS_DENOMINATOR;
        uint256 treasuryAmount = amount - rewardReserve;
        if (rewardReserve != 0) reservedRewards[token] += rewardReserve;
        if (treasuryAmount != 0) token.pushExact(treasury, treasuryAmount);
        emit PoolProtocolFeesCollected(pool, token, amount, treasuryAmount, rewardReserve);
    }

    function _collectPoolProtocolFees(address pool) private {
        if (pool == address(0)) revert InvalidConfiguration();
        address token0 = IProtocolFeePool(pool).token0();
        address token1 = IProtocolFeePool(pool).token1();
        (uint256 amount0, uint256 amount1) = IProtocolFeePool(pool).collectProtocolFees();
        _reserveCollectedFee(pool, token0, amount0);
        _reserveCollectedFee(pool, token1, amount1);
    }

    function _settleTailReward(
        address token,
        address referrer,
        uint256 sourcePositionId,
        uint256 protocolBasis,
        bool eligible
    ) private returns (uint256 reward) {
        if (protocolBasis == 0) return 0;
        reward = protocolBasis * tailRewardBps / BPS_DENOMINATOR;
        if (reward == 0) return 0;
        uint256 reserve = reservedRewards[token];
        if (reward > reserve) revert InsufficientRewardReserve();
        reservedRewards[token] = reserve - reward;
        address recipient = eligible ? referrer : treasury;
        token.pushExact(recipient, reward);
        emit FeesDistributed(token, referrer, eligible ? 0 : reward, eligible ? reward : 0);
        emit TailFeesDistributed(
            token,
            referrer,
            sourcePositionId,
            eligible ? 0 : reward,
            eligible ? reward : 0,
            eligible
        );
    }

    function _isEligibleReferrer(address referrer, uint256 referrerPositionId) internal view returns (bool) {
        address manager = positionManager;
        if (manager == address(0) || referrer == address(0)) return false;

        try IReferrerPositionManager(manager).ownerOf(referrerPositionId) returns (address owner) {
            if (owner != referrer) return false;
        } catch {
            return false;
        }

        try IReferrerPositionManager(manager).positions(referrerPositionId) returns (
            address, int24, int24, uint8, bytes32, address, bool open
        ) {
            return open;
        } catch {
            return false;
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) { }
}
