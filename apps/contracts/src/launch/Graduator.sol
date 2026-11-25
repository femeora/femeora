// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../core/PoolFactory.sol";
import {DammPool} from "../core/DammPool.sol";
import {IPositionManagerV2} from "../interfaces/IPositionManagerV2.sol";
import {TokenTransfer} from "../libraries/TokenTransfer.sol";
import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "../security/ReentrancyGuard.sol";
import {IGraduator} from "./IGraduator.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract Graduator is IGraduator, ProtocolAccess, UUPSUpgradeable, ReentrancyGuard {
    using TokenTransfer for address;

    error InvalidConfiguration();
    error InvalidLaunch();
    error UnauthorizedLaunch();
    error AmountTooLarge();

    struct RegisteredLaunch {
        uint256 launchpadId;
        address creator;
        address launchpadFeeRecipient;
        address protocolFeeRecipient;
        uint24 lpCreatorSharePips;
        uint24 lpLaunchpadSharePips;
        uint24 lpProtocolSharePips;
        LaunchTypes.GraduationConfig config;
        bool registered;
        bool graduated;
        address pool;
        uint256 positionId;
    }

    PoolFactory public poolFactory;
    IPositionManagerV2 public positionManager;
    address public launchFactory;
    mapping(address curve => RegisteredLaunch launch) private _launches;

    event LaunchFactoryUpdated(address indexed launchFactory);
    event LaunchRegistered(address indexed curve, uint256 indexed launchpadId, address indexed creator);
    event LaunchGraduated(
        address indexed curve,
        address indexed token,
        address indexed pool,
        uint256 positionId,
        uint256 tokenAmount,
        uint256 quoteAmount
    );
    event LaunchFeesDistributed(
        address indexed curve,
        address indexed token,
        address creatorRecipient,
        address launchpadRecipient,
        address protocolRecipient,
        uint256 creatorAmount,
        uint256 launchpadAmount,
        uint256 protocolAmount
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader, PoolFactory poolFactory_, IPositionManagerV2 positionManager_)
        external
        initializer
    {
        if (address(poolFactory_) == address(0) || address(positionManager_) == address(0)) {
            revert InvalidConfiguration();
        }
        __ProtocolAccess_init(admin, upgrader);
        poolFactory = poolFactory_;
        positionManager = positionManager_;
    }

    function setLaunchFactory(address launchFactory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (launchFactory_ == address(0)) revert InvalidConfiguration();
        launchFactory = launchFactory_;
        emit LaunchFactoryUpdated(launchFactory_);
    }

    function registerLaunch(
        address curve,
        uint256 launchpadId,
        address creator,
        address launchpadFeeRecipient,
        address protocolFeeRecipient,
        LaunchTypes.Economics calldata economics,
        LaunchTypes.GraduationConfig calldata config
    ) external {
        if (msg.sender != launchFactory) revert UnauthorizedLaunch();
        if (
            curve == address(0) || creator == address(0) || launchpadFeeRecipient == address(0)
                || protocolFeeRecipient == address(0) || _launches[curve].registered
        ) revert InvalidLaunch();
        _launches[curve] = RegisteredLaunch({
            launchpadId: launchpadId,
            creator: creator,
            launchpadFeeRecipient: launchpadFeeRecipient,
            protocolFeeRecipient: protocolFeeRecipient,
            lpCreatorSharePips: economics.lpCreatorSharePips,
            lpLaunchpadSharePips: economics.lpLaunchpadSharePips,
            lpProtocolSharePips: economics.lpProtocolSharePips,
            config: config,
            registered: true,
            graduated: false,
            pool: address(0),
            positionId: 0
        });
        emit LaunchRegistered(curve, launchpadId, creator);
    }

    function graduate(
        uint256 launchpadId,
        address token,
        address quoteToken,
        address creator,
        uint256 tokenAmount,
        uint256 quoteAmount
    ) external nonReentrant returns (address pool, uint256 positionId) {
        RegisteredLaunch storage launch = _launches[msg.sender];
        if (
            !launch.registered || launch.graduated || launch.launchpadId != launchpadId || launch.creator != creator
                || launch.config.target != LaunchTypes.GraduationTarget.DAMM || tokenAmount == 0 || quoteAmount == 0
        ) revert InvalidLaunch();
        if (tokenAmount > type(uint112).max || quoteAmount > type(uint112).max) revert AmountTooLarge();
        launch.graduated = true;
        token.pullExact(msg.sender, tokenAmount);
        quoteToken.pullExact(msg.sender, quoteAmount);
        uint112 tokenCap = _reserveCap(tokenAmount);
        uint112 quoteCap = _reserveCap(quoteAmount);
        pool = poolFactory.createLaunchDammPool(
            token,
            quoteToken,
            launch.config.endFeePips,
            tokenCap,
            quoteCap,
            launch.config.startFeePips,
            launch.config.durationSeconds,
            launch.config.feeCurve == LaunchTypes.FeeCurve.Exponential
        );
        DammPool damm = DammPool(pool);
        bool tokenIs0 = damm.token0() == token;
        uint256 amount0 = tokenIs0 ? tokenAmount : quoteAmount;
        uint256 amount1 = tokenIs0 ? quoteAmount : tokenAmount;
        token.forceApprove(address(positionManager), tokenAmount);
        quoteToken.forceApprove(address(positionManager), quoteAmount);
        positionId = positionManager.createDammPosition(
            IPositionManagerV2.CreateDammParams({
                pool: pool,
                amountX: amount0,
                amountY: amount1,
                minShares: 0,
                tag: keccak256(abi.encode("launch", token)),
                referrer: address(0),
                deadline: block.timestamp + 10 minutes
            })
        );
        token.forceApprove(address(positionManager), 0);
        quoteToken.forceApprove(address(positionManager), 0);
        positionManager.lockPosition(positionId);
        launch.pool = pool;
        launch.positionId = positionId;
        emit LaunchGraduated(msg.sender, token, pool, positionId, tokenAmount, quoteAmount);
    }

    function claimLaunchFees(address curve) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        RegisteredLaunch storage launch = _launches[curve];
        if (!launch.graduated || launch.pool == address(0) || launch.positionId == 0) revert InvalidLaunch();
        (amount0, amount1) = positionManager.claimDammFees(launch.positionId, address(this));
        DammPool damm = DammPool(launch.pool);
        _distributeLaunchFees(launch, curve, damm.token0(), amount0);
        _distributeLaunchFees(launch, curve, damm.token1(), amount1);
    }

    function registeredLaunch(address curve) external view returns (RegisteredLaunch memory) {
        return _launches[curve];
    }

    function _reserveCap(uint256 seededAmount) private pure returns (uint112) {
        uint256 headroom = seededAmount > type(uint112).max / 100 ? type(uint112).max : seededAmount * 100;
        return uint112(headroom);
    }

    function _distributeLaunchFees(RegisteredLaunch storage launch, address curve, address feeToken, uint256 amount)
        private
    {
        if (amount == 0) return;
        uint256 creatorAmount = amount * launch.lpCreatorSharePips / LaunchTypes.PIPS_DENOMINATOR;
        uint256 launchpadAmount = amount * launch.lpLaunchpadSharePips / LaunchTypes.PIPS_DENOMINATOR;
        uint256 protocolAmount = amount - creatorAmount - launchpadAmount;
        if (creatorAmount != 0) feeToken.pushExact(launch.creator, creatorAmount);
        if (launchpadAmount != 0) feeToken.pushExact(launch.launchpadFeeRecipient, launchpadAmount);
        if (protocolAmount != 0) feeToken.pushExact(launch.protocolFeeRecipient, protocolAmount);
        emit LaunchFeesDistributed(
            curve,
            feeToken,
            launch.creator,
            launch.launchpadFeeRecipient,
            launch.protocolFeeRecipient,
            creatorAmount,
            launchpadAmount,
            protocolAmount
        );
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
