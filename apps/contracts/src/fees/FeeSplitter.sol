// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ProtocolAccess } from "../access/ProtocolAccess.sol";
import { TokenTransfer } from "../libraries/TokenTransfer.sol";
import { UUPSUpgradeable } from "../proxy/UUPSUpgradeable.sol";
import { ReentrancyGuard } from "../security/ReentrancyGuard.sol";

contract FeeSplitter is ProtocolAccess, UUPSUpgradeable, ReentrancyGuard {
    using TokenTransfer for address;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_TAIL_REWARD_BPS = 2_000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("FOMEORA_DISTRIBUTOR_ROLE");

    error InvalidConfiguration();

    address public treasury;
    uint16 public tailRewardBps;

    event TreasuryUpdated(address indexed previousTreasury, address indexed treasury);
    event TailRewardUpdated(uint16 previousBps, uint16 bps);
    event FeesDistributed(address indexed token, address indexed referrer, uint256 treasuryAmount, uint256 tailReward);

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

    function distribute(address token, address referrer, uint256 amount)
        external nonReentrant onlyRole(DISTRIBUTOR_ROLE)
    {
        if (token == address(0) || amount == 0) revert InvalidConfiguration();
        token.pullExact(msg.sender, amount);
        uint256 reward = referrer == address(0) ? 0 : amount * tailRewardBps / BPS_DENOMINATOR;
        uint256 treasuryAmount = amount - reward;
        if (reward != 0) token.pushExact(referrer, reward);
        token.pushExact(treasury, treasuryAmount);
        emit FeesDistributed(token, referrer, treasuryAmount, reward);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) { }
}
