// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TokenTransfer} from "../libraries/TokenTransfer.sol";
import {ReentrancyGuard} from "../security/ReentrancyGuard.sol";
import {IGraduator} from "./IGraduator.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract BondingCurveLaunch is ReentrancyGuard {
    using TokenTransfer for address;

    error DeadlineExpired();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidState();
    error SlippageExceeded();
    error PurchaseCapExceeded();
    error UnauthorizedGraduator();

    address public immutable factory;
    uint256 public immutable launchpadId;
    address public immutable token;
    address public immutable quoteToken;
    address public immutable creator;
    address public immutable launchpadFeeRecipient;
    address public immutable protocolFeeRecipient;
    IGraduator public immutable graduator;
    uint24 public immutable tradeFeePips;
    uint24 public immutable creatorSharePips;
    uint24 public immutable launchpadSharePips;
    uint24 public immutable protocolSharePips;
    uint128 public immutable graduationThreshold;
    uint128 public immutable initialTokenInventory;
    uint128 public immutable virtualTokenReserveSeed;
    uint128 public immutable virtualQuoteReserveSeed;
    LaunchTypes.ProtectionConfig public protection;
    uint48 public immutable launchedAt;

    uint256 public virtualTokenReserve;
    uint256 public virtualQuoteReserve;
    uint256 public quoteReserve;
    uint256 public tokenInventory;
    bool public graduated;
    mapping(address buyer => uint256 amount) public tokensBought;

    event Bought(
        address indexed buyer,
        address indexed recipient,
        uint256 quoteIn,
        uint256 tokenOut,
        uint256 fee,
        uint256 quoteReserve,
        uint256 tokenInventory,
        uint24 progressPips
    );
    event Sold(
        address indexed seller,
        address indexed recipient,
        uint256 tokenIn,
        uint256 quoteOut,
        uint256 fee,
        uint256 quoteReserve,
        uint256 tokenInventory,
        uint24 progressPips
    );
    event FeePaid(address indexed recipient, uint8 indexed category, uint256 amount);
    event GraduationReady(uint256 quoteReserve, uint256 threshold);
    event Graduated(address indexed pool, uint256 indexed positionId, uint256 tokenAmount, uint256 quoteAmount);

    constructor(
        uint256 launchpadId_,
        address token_,
        address quoteToken_,
        address creator_,
        address launchpadFeeRecipient_,
        address protocolFeeRecipient_,
        IGraduator graduator_,
        LaunchTypes.Economics memory economics,
        LaunchTypes.ProtectionConfig memory protection_,
        uint128 virtualQuoteReserve_,
        uint256 initialDeveloperAllocation
    ) {
        if (
            token_ == address(0) || quoteToken_ == address(0) || creator_ == address(0)
                || launchpadFeeRecipient_ == address(0) || protocolFeeRecipient_ == address(0)
                || address(graduator_) == address(0) || virtualQuoteReserve_ == 0
        ) revert InvalidRecipient();
        factory = msg.sender;
        launchpadId = launchpadId_;
        token = token_;
        quoteToken = quoteToken_;
        creator = creator_;
        launchpadFeeRecipient = launchpadFeeRecipient_;
        protocolFeeRecipient = protocolFeeRecipient_;
        graduator = graduator_;
        tradeFeePips = economics.tradeFeePips;
        creatorSharePips = economics.creatorSharePips;
        launchpadSharePips = economics.launchpadSharePips;
        protocolSharePips = economics.protocolSharePips;
        graduationThreshold = economics.graduationThreshold;
        initialTokenInventory = economics.curveTokenSupply;
        virtualTokenReserveSeed = economics.curveTokenSupply;
        virtualQuoteReserveSeed = virtualQuoteReserve_;
        protection = protection_;
        launchedAt = uint48(block.timestamp);
        virtualTokenReserve = economics.curveTokenSupply;
        virtualQuoteReserve = virtualQuoteReserve_;
        tokenInventory = economics.curveTokenSupply;
        if (protection_.enabled) tokensBought[creator_] = initialDeveloperAllocation;
    }

    function quoteBuy(uint256 quoteIn) public view returns (uint256 tokenOut, uint256 fee) {
        if (quoteIn == 0 || graduated) revert InvalidAmount();
        fee = quoteIn * tradeFeePips / LaunchTypes.PIPS_DENOMINATOR;
        uint256 net = quoteIn - fee;
        tokenOut = net * virtualTokenReserve / (virtualQuoteReserve + net);
        if (tokenOut == 0 || tokenOut > tokenInventory) revert InvalidAmount();
    }

    function quoteSell(uint256 tokenIn) public view returns (uint256 quoteOut, uint256 fee) {
        if (tokenIn == 0 || graduated) revert InvalidAmount();
        uint256 gross = tokenIn * virtualQuoteReserve / (virtualTokenReserve + tokenIn);
        fee = gross * tradeFeePips / LaunchTypes.PIPS_DENOMINATOR;
        quoteOut = gross - fee;
        if (quoteOut == 0 || quoteOut + fee > quoteReserve) revert InvalidAmount();
    }

    function buy(uint256 quoteIn, uint256 minimumTokenOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokenOut)
    {
        _validateCall(recipient, deadline);
        if (protection.enabled && recipient != msg.sender) revert InvalidRecipient();
        uint256 fee;
        (tokenOut, fee) = quoteBuy(quoteIn);
        _enforcePurchaseCap(msg.sender, tokenOut);
        quoteToken.pullExact(msg.sender, quoteIn);
        _distributeFee(fee);
        uint256 net = quoteIn - fee;
        virtualQuoteReserve += net;
        virtualTokenReserve -= tokenOut;
        quoteReserve += net;
        tokenInventory -= tokenOut;
        tokensBought[msg.sender] += tokenOut;
        if (tokenOut < minimumTokenOut) revert SlippageExceeded();
        token.pushExact(recipient, tokenOut);
        emit Bought(msg.sender, recipient, quoteIn, tokenOut, fee, quoteReserve, tokenInventory, _progressPips());
        if (quoteReserve >= graduationThreshold) {
            emit GraduationReady(quoteReserve, graduationThreshold);
            _graduate();
        }
    }

    function sell(uint256 tokenIn, uint256 minimumQuoteOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 quoteOut)
    {
        _validateCall(recipient, deadline);
        uint256 fee;
        (quoteOut, fee) = quoteSell(tokenIn);
        if (quoteOut < minimumQuoteOut) revert SlippageExceeded();
        token.pullExact(msg.sender, tokenIn);
        virtualTokenReserve += tokenIn;
        virtualQuoteReserve -= quoteOut + fee;
        quoteReserve -= quoteOut + fee;
        tokenInventory += tokenIn;
        _distributeFee(fee);
        quoteToken.pushExact(recipient, quoteOut);
        emit Sold(msg.sender, recipient, tokenIn, quoteOut, fee, quoteReserve, tokenInventory, _progressPips());
    }

    function graduate() external nonReentrant returns (address pool, uint256 positionId) {
        if (graduated || quoteReserve < graduationThreshold) revert InvalidState();
        return _graduate();
    }

    function _graduate() private returns (address pool, uint256 positionId) {
        graduated = true;
        uint256 tokenAmount = tokenInventory;
        uint256 quoteAmount = quoteReserve;
        tokenInventory = 0;
        quoteReserve = 0;
        token.forceApprove(address(graduator), tokenAmount);
        quoteToken.forceApprove(address(graduator), quoteAmount);
        (pool, positionId) = graduator.graduate(launchpadId, token, quoteToken, creator, tokenAmount, quoteAmount);
        token.forceApprove(address(graduator), 0);
        quoteToken.forceApprove(address(graduator), 0);
        emit Graduated(pool, positionId, tokenAmount, quoteAmount);
    }

    function progressPips() external view returns (uint24) {
        return _progressPips();
    }

    function _progressPips() private view returns (uint24) {
        uint256 progress = quoteReserve >= graduationThreshold
            ? LaunchTypes.PIPS_DENOMINATOR
            : quoteReserve * LaunchTypes.PIPS_DENOMINATOR / graduationThreshold;
        return uint24(progress);
    }

    function _distributeFee(uint256 fee) private {
        if (fee == 0) return;
        uint256 creatorAmount = fee * creatorSharePips / LaunchTypes.PIPS_DENOMINATOR;
        uint256 launchpadAmount = fee * launchpadSharePips / LaunchTypes.PIPS_DENOMINATOR;
        uint256 protocolAmount = fee - creatorAmount - launchpadAmount;
        if (creatorAmount != 0) {
            quoteToken.pushExact(creator, creatorAmount);
            emit FeePaid(creator, 0, creatorAmount);
        }
        if (launchpadAmount != 0) {
            quoteToken.pushExact(launchpadFeeRecipient, launchpadAmount);
            emit FeePaid(launchpadFeeRecipient, 1, launchpadAmount);
        }
        if (protocolAmount != 0) {
            quoteToken.pushExact(protocolFeeRecipient, protocolAmount);
            emit FeePaid(protocolFeeRecipient, 2, protocolAmount);
        }
    }

    function _enforcePurchaseCap(address buyer, uint256 tokenOut) private view {
        if (!protection.enabled) return;
        uint256 capPips = buyer == creator ? protection.devBuyCapPips : protection.earlyBuyCapPips;
        if (buyer != creator && block.timestamp > uint256(launchedAt) + protection.earlyBuyDurationSeconds) return;
        uint256 cap = uint256(initialTokenInventory) * capPips / LaunchTypes.PIPS_DENOMINATOR;
        if (tokensBought[buyer] + tokenOut > cap) revert PurchaseCapExceeded();
    }

    function _validateCall(address recipient, uint256 deadline) private view {
        if (graduated) revert InvalidState();
        if (recipient == address(0)) revert InvalidRecipient();
        if (block.timestamp > deadline) revert DeadlineExpired();
    }
}
