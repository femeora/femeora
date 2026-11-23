// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { TokenTransfer } from "../libraries/TokenTransfer.sol";
import { NonEmptyBinBitmap } from "../libraries/NonEmptyBinBitmap.sol";
import { DlmmV2LiquidityMath } from "../math/DlmmV2LiquidityMath.sol";
import { FullMath } from "../math/FullMath.sol";
import { ReentrancyGuard } from "../security/ReentrancyGuard.sol";
import { PoolKey, PoolModel } from "./PoolTypes.sol";

interface IERC20MetadataV2 {
    function decimals() external view returns (uint8);
}

contract DlmmPoolV2 is ReentrancyGuard {
    using TokenTransfer for address;
    using NonEmptyBinBitmap for mapping(uint256 => uint256);

    uint256 public constant MINIMUM_BIN_LIQUIDITY = 1_000;
    uint256 public constant MAX_BATCH_BINS = 61;
    uint16 public constant MAX_SWAP_BIN_CROSSINGS = 256;
    uint256 private constant FEE_DENOMINATOR = 1_000_000;
    uint24 public constant MAX_TOTAL_FEE_PIPS = 100_000;
    uint24 public constant VARIABLE_FEE_CONTROL_PIPS = 100;
    uint32 public constant VOLATILITY_DECAY_PERIOD = 86_400;
    address private constant LOCKED_LIQUIDITY_ACCOUNT = address(1);

    struct Bin {
        uint128 reserve0;
        uint128 reserve1;
        uint256 totalShares;
    }

    struct AddBin {
        int24 binId;
        uint256 amount0;
        uint256 amount1;
        uint256 minimumShares;
    }

    struct RemoveBin {
        int24 binId;
        uint256 shares;
        uint256 minimumAmount0;
        uint256 minimumAmount1;
    }

    struct SwapState {
        uint256 remaining;
        uint256 amountOut;
        uint256 totalFee;
        uint256 protocolFee;
        int24 currentBin;
        uint16 binsCrossed;
    }

    error DeadlineExpired();
    error InsufficientLiquidity();
    error InvalidAdministrator();
    error InvalidAmount();
    error InvalidBin();
    error InvalidRecipient();
    error PoolPaused();
    error SlippageExceeded();
    error Unauthorized();

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint8 public immutable token0Decimals;
    uint8 public immutable token1Decimals;
    PoolModel public constant model = PoolModel.DLMM;
    uint8 public constant version = 2;
    uint24 public immutable feePips;
    uint24 public immutable maxVolatilityAccumulator;
    uint16 public immutable binStepBps;
    address public administrator;
    address public protocolFeeRecipient;
    uint24 public protocolFeeSharePips;
    bool public paused;
    int24 public activeBin;
    uint128 public protocolFees0;
    uint128 public protocolFees1;
    uint24 public volatilityAccumulator;
    uint48 public lastVolatilityUpdate;

    mapping(int24 => Bin) private _bins;
    mapping(int24 => mapping(address => uint256)) public sharesOf;
    mapping(uint256 => uint256) private _nonEmptyBins;

    event BatchLiquidityAdded(
        bytes32 indexed operationId,
        address indexed sender,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        int24 activeBin
    );
    event BinLiquidityAddedV2(
        bytes32 indexed operationId,
        int24 indexed binId,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 shares,
        int24 activeBin
    );
    event BatchLiquidityRemoved(
        bytes32 indexed operationId,
        address indexed sender,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        int24 activeBin
    );
    event BinLiquidityRemovedV2(
        bytes32 indexed operationId,
        int24 indexed binId,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 shares,
        int24 activeBin
    );
    event BinsUpdated(int24[] ids, uint128[] reserves0, uint128[] reserves1);
    /// @notice Exact LP fee denominator for off-chain per-position accounting.
    /// @dev Emitted once for every bin consumed by a swap. `lpFee` excludes protocol fees.
    event BinFeeAccrued(
        int24 indexed binId,
        bool token0ToToken1,
        uint256 lpFee,
        uint256 totalShares
    );
    event PauseUpdated(bool paused);
    event AdministratorUpdated(address indexed previousAdministrator, address indexed administrator);
    event Swap(
        address indexed sender,
        address indexed recipient,
        bool token0ToToken1,
        uint256 amountIn,
        uint256 amountOut,
        int24 activeBinBefore,
        int24 activeBinAfter,
        uint256 totalFee,
        uint256 protocolFee,
        uint16 binsCrossed
    );
    event ActiveBinUpdated(int24 indexed activeBin);
    event ProtocolFeeConfigurationUpdated(address indexed recipient, uint24 sharePips);
    event ProtocolFeesCollected(address indexed recipient, uint256 amount0, uint256 amount1);
    event DynamicFeeUpdated(uint24 volatilityAccumulator, uint24 effectiveFeePips, uint48 timestamp);

    modifier onlyAdministrator() {
        if (msg.sender != administrator) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PoolPaused();
        _;
    }

    constructor(PoolKey memory key, address administrator_, int24 initialActiveBin) {
        if (key.model != PoolModel.DLMM || key.binStepBps == 0) revert InvalidBin();
        if (administrator_ == address(0)) revert InvalidAdministrator();
        DlmmV2LiquidityMath.price(initialActiveBin, key.binStepBps);
        factory = msg.sender;
        token0 = key.token0;
        token1 = key.token1;
        token0Decimals = IERC20MetadataV2(key.token0).decimals();
        token1Decimals = IERC20MetadataV2(key.token1).decimals();
        if (token0Decimals > 36 || token1Decimals > 36) revert InvalidAmount();
        if (key.feePips > MAX_TOTAL_FEE_PIPS) revert InvalidAmount();
        feePips = key.feePips;
        maxVolatilityAccumulator = uint24(
            (MAX_TOTAL_FEE_PIPS - key.feePips) / VARIABLE_FEE_CONTROL_PIPS
        );
        binStepBps = key.binStepBps;
        administrator = administrator_;
        protocolFeeRecipient = administrator_;
        activeBin = initialActiveBin;
        lastVolatilityUpdate = uint48(block.timestamp);
    }

    function currentFeePips() public view returns (uint24) {
        uint256 effective = uint256(feePips)
            + uint256(_decayedVolatilityAccumulator()) * VARIABLE_FEE_CONTROL_PIPS;
        return effective > MAX_TOTAL_FEE_PIPS ? MAX_TOTAL_FEE_PIPS : uint24(effective);
    }

    function binState(int24 binId)
        external
        view
        returns (uint128 reserve0, uint128 reserve1, uint256 totalShares, uint256 priceX18)
    {
        Bin storage bin = _bins[binId];
        return (
            bin.reserve0,
            bin.reserve1,
            bin.totalShares,
            DlmmV2LiquidityMath.price(binId, binStepBps)
        );
    }

    function isInitialized(int24 binId) external view returns (bool) {
        return _nonEmptyBins.contains(binId);
    }

    function nextInitializedBin(int24 fromBin, bool increasing)
        external
        view
        returns (bool found, int24 binId)
    {
        return _nonEmptyBins.next(fromBin, increasing);
    }

    function addLiquidityBatch(
        bytes32 operationId,
        AddBin[] calldata additions,
        int24 expectedActiveBin,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 totalAmount0, uint256 totalAmount1) {
        _validateCall(recipient, deadline);
        int24[] memory orderedBins = new int24[](additions.length);
        if (additions.length == 0 || additions.length > MAX_BATCH_BINS) revert InvalidAmount();
        for (uint256 index = 0; index < additions.length; ++index) {
            AddBin calldata addition = additions[index];
            orderedBins[index] = addition.binId;
            if (index != 0 && orderedBins[index - 1] >= addition.binId) revert InvalidBin();
            DlmmV2LiquidityMath.validateDeposit(
                addition.binId,
                activeBin,
                expectedActiveBin,
                addition.amount0,
                addition.amount1
            );
            totalAmount0 += addition.amount0;
            totalAmount1 += addition.amount1;
        }
        if (totalAmount0 != 0) token0.pullExact(msg.sender, totalAmount0);
        if (totalAmount1 != 0) token1.pullExact(msg.sender, totalAmount1);
        for (uint256 index = 0; index < additions.length; ++index) {
            _add(operationId, additions[index], recipient);
        }
        _emitBinsUpdatedForAdditions(additions);
        emit BatchLiquidityAdded(
            operationId, msg.sender, recipient, totalAmount0, totalAmount1, activeBin
        );
    }

    function removeLiquidityBatch(
        bytes32 operationId,
        RemoveBin[] calldata removals,
        uint256 minimumTotal0,
        uint256 minimumTotal1,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 totalAmount0, uint256 totalAmount1) {
        _validateCall(recipient, deadline);
        if (removals.length == 0 || removals.length > MAX_BATCH_BINS) revert InvalidAmount();
        for (uint256 index = 0; index < removals.length; ++index) {
            RemoveBin calldata removal = removals[index];
            if (index != 0 && removals[index - 1].binId >= removal.binId) revert InvalidBin();
            (uint256 amount0, uint256 amount1) = _remove(operationId, removal, recipient);
            totalAmount0 += amount0;
            totalAmount1 += amount1;
        }
        _emitBinsUpdatedForRemovals(removals);
        if (totalAmount0 < minimumTotal0 || totalAmount1 < minimumTotal1) revert SlippageExceeded();
        if (totalAmount0 != 0) token0.pushExact(recipient, totalAmount0);
        if (totalAmount1 != 0) token1.pushExact(recipient, totalAmount1);
        emit BatchLiquidityRemoved(
            operationId, msg.sender, recipient, totalAmount0, totalAmount1, activeBin
        );
    }

    function swapExactInput(
        bool token0ToToken1,
        uint256 amountIn,
        uint256 minimumAmountOut,
        uint16 maximumBinCrossings,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut, uint16 binsCrossed) {
        _validateCall(recipient, deadline);
        if (
            amountIn == 0 || maximumBinCrossings == 0
                || maximumBinCrossings > MAX_SWAP_BIN_CROSSINGS
        ) revert InvalidAmount();
        (token0ToToken1 ? token0 : token1).pullExact(msg.sender, amountIn);
        uint256 protocolFee;
        uint256 totalFee;
        uint24 effectiveFeePips = currentFeePips();
        int24 activeBinBefore = activeBin;
        int24 finalActiveBin;
        int24[] memory touchedBins;
        (amountOut, totalFee, protocolFee, finalActiveBin, binsCrossed, touchedBins) =
            _executeSwap(token0ToToken1, amountIn, maximumBinCrossings, effectiveFeePips);
        if (amountOut < minimumAmountOut) revert SlippageExceeded();
        activeBin = finalActiveBin;
        _updateVolatility(binsCrossed);
        (token0ToToken1 ? token1 : token0).pushExact(recipient, amountOut);
        emit ActiveBinUpdated(finalActiveBin);
        _emitBinsUpdated(touchedBins);
        emit Swap(
            msg.sender,
            recipient,
            token0ToToken1,
            amountIn,
            amountOut,
            activeBinBefore,
            finalActiveBin,
            totalFee,
            protocolFee,
            binsCrossed
        );
    }

    function _executeSwap(
        bool token0ToToken1,
        uint256 amountIn,
        uint16 maximumBinCrossings,
        uint24 effectiveFeePips
    )
        private
        returns (
            uint256 amountOut,
            uint256 totalFee,
            uint256 protocolFee,
            int24 finalActiveBin,
            uint16 binsCrossed,
            int24[] memory touchedBins
        )
    {
        SwapState memory state = SwapState(amountIn, 0, 0, 0, activeBin, 0);
        touchedBins = new int24[](maximumBinCrossings);
        while (state.remaining != 0 && state.binsCrossed < maximumBinCrossings) {
            (uint256 consumed, uint256 output, uint256 fee, uint256 protocolPortion) =
                _consumeBin(
                    state.currentBin, token0ToToken1, state.remaining, effectiveFeePips
                );
            if (consumed != 0) {
                state.remaining -= consumed;
                state.amountOut += output;
                state.totalFee += fee;
                state.protocolFee += protocolPortion;
                touchedBins[state.binsCrossed] = state.currentBin;
                ++state.binsCrossed;
            }
            if (state.remaining == 0) break;
            (bool found, int24 nextBin) =
                _nonEmptyBins.next(state.currentBin, !token0ToToken1);
            if (!found) revert InsufficientLiquidity();
            state.currentBin = nextBin;
        }
        if (state.remaining != 0) revert InsufficientLiquidity();
        uint256 touched = state.binsCrossed;
        assembly ("memory-safe") { mstore(touchedBins, touched) }
        return (
            state.amountOut,
            state.totalFee,
            state.protocolFee,
            state.currentBin,
            state.binsCrossed,
            touchedBins
        );
    }

    function swapExactOutput(
        bool token0ToToken1,
        uint256 amountOut,
        uint256 maximumAmountIn,
        uint16 maximumBinCrossings,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountIn, uint16 binsCrossed) {
        _validateCall(recipient, deadline);
        if (
            amountOut == 0 || maximumAmountIn == 0 || maximumBinCrossings == 0
                || maximumBinCrossings > MAX_SWAP_BIN_CROSSINGS
        ) revert InvalidAmount();
        uint256 protocolFee;
        uint256 totalFee;
        uint24 effectiveFeePips = currentFeePips();
        int24 activeBinBefore = activeBin;
        int24 finalActiveBin;
        int24[] memory touchedBins;
        (amountIn, totalFee, protocolFee, finalActiveBin, binsCrossed, touchedBins) =
            _executeExactOutput(
                token0ToToken1, amountOut, maximumBinCrossings, effectiveFeePips
            );
        if (amountIn > maximumAmountIn) revert SlippageExceeded();
        (token0ToToken1 ? token0 : token1).pullExact(msg.sender, amountIn);
        activeBin = finalActiveBin;
        _updateVolatility(binsCrossed);
        (token0ToToken1 ? token1 : token0).pushExact(recipient, amountOut);
        emit ActiveBinUpdated(finalActiveBin);
        _emitBinsUpdated(touchedBins);
        emit Swap(
            msg.sender,
            recipient,
            token0ToToken1,
            amountIn,
            amountOut,
            activeBinBefore,
            finalActiveBin,
            totalFee,
            protocolFee,
            binsCrossed
        );
    }

    function quoteExactOutput(
        bool token0ToToken1,
        uint256 amountOut,
        uint16 maximumBinCrossings
    ) external view returns (uint256 amountIn, uint16 binsCrossed) {
        if (
            amountOut == 0 || maximumBinCrossings == 0
                || maximumBinCrossings > MAX_SWAP_BIN_CROSSINGS
        ) revert InvalidAmount();
        uint256 remainingOut = amountOut;
        int24 currentBin = activeBin;
        while (remainingOut != 0 && binsCrossed < maximumBinCrossings) {
            Bin storage bin = _bins[currentBin];
            uint256 outputReserve = token0ToToken1 ? bin.reserve1 : bin.reserve0;
            if (outputReserve != 0) {
                uint256 output = remainingOut < outputReserve ? remainingOut : outputReserve;
                uint256 priceX18 = DlmmV2LiquidityMath.price(currentBin, binStepBps);
                uint256 netInput = token0ToToken1
                    ? FullMath.mulDivRoundingUp(output, 1e18, priceX18)
                    : FullMath.mulDivRoundingUp(output, priceX18, 1e18);
                uint24 effectiveFeePips = currentFeePips();
                amountIn += FullMath.mulDivRoundingUp(
                    netInput, FEE_DENOMINATOR, FEE_DENOMINATOR - effectiveFeePips
                );
                remainingOut -= output;
                ++binsCrossed;
            }
            if (remainingOut == 0) break;
            (bool found, int24 nextBin) = _nonEmptyBins.next(currentBin, !token0ToToken1);
            if (!found) revert InsufficientLiquidity();
            currentBin = nextBin;
        }
        if (remainingOut != 0) revert InsufficientLiquidity();
    }

    function _executeExactOutput(
        bool token0ToToken1,
        uint256 requestedOut,
        uint16 maximumBinCrossings,
        uint24 effectiveFeePips
    )
        private
        returns (
            uint256 amountIn,
            uint256 totalFee,
            uint256 protocolFee,
            int24 finalActiveBin,
            uint16 binsCrossed,
            int24[] memory touchedBins
        )
    {
        uint256 remainingOut = requestedOut;
        int24 currentBin = activeBin;
        touchedBins = new int24[](maximumBinCrossings);
        while (remainingOut != 0 && binsCrossed < maximumBinCrossings) {
            (uint256 input, uint256 output, uint256 fee, uint256 protocolPortion) =
                _consumeBinExactOutput(
                    currentBin, token0ToToken1, remainingOut, effectiveFeePips
                );
            if (output != 0) {
                remainingOut -= output;
                amountIn += input;
                totalFee += fee;
                protocolFee += protocolPortion;
                touchedBins[binsCrossed] = currentBin;
                ++binsCrossed;
            }
            if (remainingOut == 0) break;
            (bool found, int24 nextBin) = _nonEmptyBins.next(currentBin, !token0ToToken1);
            if (!found) revert InsufficientLiquidity();
            currentBin = nextBin;
        }
        if (remainingOut != 0) revert InsufficientLiquidity();
        assembly ("memory-safe") { mstore(touchedBins, binsCrossed) }
        finalActiveBin = currentBin;
    }

    function setProtocolFeeConfiguration(address recipient, uint24 sharePips)
        external
        onlyAdministrator
    {
        if (recipient == address(0) || sharePips > FEE_DENOMINATOR) revert InvalidRecipient();
        protocolFeeRecipient = recipient;
        protocolFeeSharePips = sharePips;
        emit ProtocolFeeConfigurationUpdated(recipient, sharePips);
    }

    function collectProtocolFees()
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        if (msg.sender != protocolFeeRecipient) revert Unauthorized();
        amount0 = protocolFees0;
        amount1 = protocolFees1;
        protocolFees0 = 0;
        protocolFees1 = 0;
        if (amount0 != 0) token0.pushExact(msg.sender, amount0);
        if (amount1 != 0) token1.pushExact(msg.sender, amount1);
        emit ProtocolFeesCollected(msg.sender, amount0, amount1);
    }

    function setPaused(bool paused_) external onlyAdministrator {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function setAdministrator(address administrator_) external onlyAdministrator {
        if (administrator_ == address(0)) revert InvalidAdministrator();
        address previous = administrator;
        administrator = administrator_;
        emit AdministratorUpdated(previous, administrator_);
    }

    function _add(bytes32 operationId, AddBin calldata addition, address recipient) private {
        Bin storage bin = _bins[addition.binId];
        uint256 priceX18 = DlmmV2LiquidityMath.price(addition.binId, binStepBps);
        uint256 depositValue = DlmmV2LiquidityMath.token1Value(
            addition.amount0, addition.amount1, priceX18, token0Decimals, token1Decimals
        );
        uint256 beforeValue = bin.totalShares == 0
            ? 0
            : DlmmV2LiquidityMath.token1Value(
                bin.reserve0, bin.reserve1, priceX18, token0Decimals, token1Decimals
            );
        (uint256 shares, uint256 lockedShares) = DlmmV2LiquidityMath.mintedShares(
            depositValue, beforeValue, bin.totalShares, MINIMUM_BIN_LIQUIDITY
        );
        if (shares < addition.minimumShares) revert SlippageExceeded();
        if (lockedShares != 0) {
            sharesOf[addition.binId][LOCKED_LIQUIDITY_ACCOUNT] = lockedShares;
            bin.totalShares = lockedShares;
        }
        sharesOf[addition.binId][recipient] += shares;
        bin.totalShares += shares;
        _setReserves(
            bin,
            uint256(bin.reserve0) + addition.amount0,
            uint256(bin.reserve1) + addition.amount1
        );
        _nonEmptyBins.set(addition.binId);
        emit BinLiquidityAddedV2(
            operationId,
            addition.binId,
            recipient,
            addition.amount0,
            addition.amount1,
            shares,
            activeBin
        );
    }

    function _remove(bytes32 operationId, RemoveBin calldata removal, address recipient)
        private
        returns (uint256 amount0, uint256 amount1)
    {
        Bin storage bin = _bins[removal.binId];
        uint256 owned = sharesOf[removal.binId][msg.sender];
        if (removal.shares == 0 || removal.shares > owned) revert InsufficientLiquidity();
        amount0 = FullMath.mulDiv(removal.shares, bin.reserve0, bin.totalShares);
        amount1 = FullMath.mulDiv(removal.shares, bin.reserve1, bin.totalShares);
        if (amount0 < removal.minimumAmount0 || amount1 < removal.minimumAmount1) {
            revert SlippageExceeded();
        }
        sharesOf[removal.binId][msg.sender] = owned - removal.shares;
        bin.totalShares -= removal.shares;
        _setReserves(bin, uint256(bin.reserve0) - amount0, uint256(bin.reserve1) - amount1);
        if (bin.reserve0 == 0 && bin.reserve1 == 0) _nonEmptyBins.clear(removal.binId);
        emit BinLiquidityRemovedV2(
            operationId, removal.binId, recipient, amount0, amount1, removal.shares, activeBin
        );
    }

    function _consumeBin(
        int24 binId,
        bool token0ToToken1,
        uint256 availableInput,
        uint24 effectiveFeePips
    )
        private
        returns (uint256 consumed, uint256 output, uint256 totalFee, uint256 protocolFee)
    {
        Bin storage bin = _bins[binId];
        uint256 outputReserve = token0ToToken1 ? bin.reserve1 : bin.reserve0;
        if (outputReserve == 0) return (0, 0, 0, 0);
        uint256 priceX18 = DlmmV2LiquidityMath.price(binId, binStepBps);
        totalFee = FullMath.mulDivRoundingUp(
            availableInput, effectiveFeePips, FEE_DENOMINATOR
        );
        uint256 netInput = availableInput - totalFee;
        output = token0ToToken1
            ? FullMath.mulDiv(netInput, priceX18, 1e18)
            : FullMath.mulDiv(netInput, 1e18, priceX18);
        if (output > outputReserve) {
            output = outputReserve;
            netInput = token0ToToken1
                ? FullMath.mulDivRoundingUp(output, 1e18, priceX18)
                : FullMath.mulDivRoundingUp(output, priceX18, 1e18);
            consumed = FullMath.mulDivRoundingUp(
                netInput, FEE_DENOMINATOR, FEE_DENOMINATOR - effectiveFeePips
            );
            totalFee = consumed - netInput;
        } else {
            consumed = availableInput;
        }
        protocolFee = FullMath.mulDiv(totalFee, protocolFeeSharePips, FEE_DENOMINATOR);
        if (token0ToToken1) {
            protocolFees0 += _toUint128(protocolFee);
            _setReserves(
                bin, uint256(bin.reserve0) + consumed - protocolFee, outputReserve - output
            );
        } else {
            protocolFees1 += _toUint128(protocolFee);
            _setReserves(
                bin, outputReserve - output, uint256(bin.reserve1) + consumed - protocolFee
            );
        }
        emit BinFeeAccrued(binId, token0ToToken1, totalFee - protocolFee, bin.totalShares);
        if (bin.reserve0 == 0 && bin.reserve1 == 0) _nonEmptyBins.clear(binId);
    }

    function _consumeBinExactOutput(
        int24 binId,
        bool token0ToToken1,
        uint256 requestedOutput,
        uint24 effectiveFeePips
    ) private returns (uint256 input, uint256 output, uint256 totalFee, uint256 protocolFee) {
        Bin storage bin = _bins[binId];
        uint256 outputReserve = token0ToToken1 ? bin.reserve1 : bin.reserve0;
        if (outputReserve == 0) return (0, 0, 0, 0);
        output = requestedOutput < outputReserve ? requestedOutput : outputReserve;
        uint256 priceX18 = DlmmV2LiquidityMath.price(binId, binStepBps);
        uint256 netInput = token0ToToken1
            ? FullMath.mulDivRoundingUp(output, 1e18, priceX18)
            : FullMath.mulDivRoundingUp(output, priceX18, 1e18);
        input = FullMath.mulDivRoundingUp(
            netInput, FEE_DENOMINATOR, FEE_DENOMINATOR - effectiveFeePips
        );
        totalFee = input - netInput;
        protocolFee = FullMath.mulDiv(totalFee, protocolFeeSharePips, FEE_DENOMINATOR);
        if (token0ToToken1) {
            protocolFees0 += _toUint128(protocolFee);
            _setReserves(bin, uint256(bin.reserve0) + input - protocolFee, outputReserve - output);
        } else {
            protocolFees1 += _toUint128(protocolFee);
            _setReserves(bin, outputReserve - output, uint256(bin.reserve1) + input - protocolFee);
        }
        emit BinFeeAccrued(binId, token0ToToken1, totalFee - protocolFee, bin.totalShares);
        if (bin.reserve0 == 0 && bin.reserve1 == 0) _nonEmptyBins.clear(binId);
    }

    function _setReserves(Bin storage bin, uint256 reserve0, uint256 reserve1) private {
        if (reserve0 > type(uint128).max || reserve1 > type(uint128).max) {
            revert InsufficientLiquidity();
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        bin.reserve0 = uint128(reserve0);
        // forge-lint: disable-next-line(unsafe-typecast)
        bin.reserve1 = uint128(reserve1);
    }

    function _toUint128(uint256 value) private pure returns (uint128 result) {
        if (value > type(uint128).max) revert InsufficientLiquidity();
        // forge-lint: disable-next-line(unsafe-typecast)
        result = uint128(value);
    }

    function _validateCall(address recipient, uint256 deadline) private view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (recipient == address(0)) revert InvalidRecipient();
    }

    function _emitBinsUpdatedForAdditions(AddBin[] calldata additions) private {
        int24[] memory ids = new int24[](additions.length);
        uint128[] memory reserves0 = new uint128[](additions.length);
        uint128[] memory reserves1 = new uint128[](additions.length);
        for (uint256 i; i < additions.length; ++i) {
            int24 id = additions[i].binId;
            Bin storage bin = _bins[id];
            ids[i] = id;
            reserves0[i] = bin.reserve0;
            reserves1[i] = bin.reserve1;
        }
        emit BinsUpdated(ids, reserves0, reserves1);
    }

    function _emitBinsUpdatedForRemovals(RemoveBin[] calldata removals) private {
        int24[] memory ids = new int24[](removals.length);
        uint128[] memory reserves0 = new uint128[](removals.length);
        uint128[] memory reserves1 = new uint128[](removals.length);
        for (uint256 i; i < removals.length; ++i) {
            int24 id = removals[i].binId;
            Bin storage bin = _bins[id];
            ids[i] = id;
            reserves0[i] = bin.reserve0;
            reserves1[i] = bin.reserve1;
        }
        emit BinsUpdated(ids, reserves0, reserves1);
    }

    function _emitBinsUpdated(int24[] memory ids) private {
        uint128[] memory reserves0 = new uint128[](ids.length);
        uint128[] memory reserves1 = new uint128[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            Bin storage bin = _bins[ids[i]];
            reserves0[i] = bin.reserve0;
            reserves1[i] = bin.reserve1;
        }
        emit BinsUpdated(ids, reserves0, reserves1);
    }

    function _decayedVolatilityAccumulator() private view returns (uint24) {
        uint256 elapsed = block.timestamp - lastVolatilityUpdate;
        if (elapsed >= VOLATILITY_DECAY_PERIOD) return 0;
        return uint24(
            uint256(volatilityAccumulator) * (VOLATILITY_DECAY_PERIOD - elapsed)
                / VOLATILITY_DECAY_PERIOD
        );
    }

    function _updateVolatility(uint16 binsCrossed) private {
        uint256 next = uint256(_decayedVolatilityAccumulator()) + binsCrossed;
        if (next > maxVolatilityAccumulator) next = maxVolatilityAccumulator;
        volatilityAccumulator = uint24(next);
        lastVolatilityUpdate = uint48(block.timestamp);
        emit DynamicFeeUpdated(volatilityAccumulator, currentFeePips(), lastVolatilityUpdate);
    }
}
