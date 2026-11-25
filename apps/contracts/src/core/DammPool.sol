// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {TokenTransfer} from "../libraries/TokenTransfer.sol";
import {ConstantProductMath} from "../math/ConstantProductMath.sol";
import {FullMath} from "../math/FullMath.sol";
import {LiquidityMath} from "../math/LiquidityMath.sol";
import {ReentrancyGuard} from "../security/ReentrancyGuard.sol";
import {PoolKey} from "./PoolTypes.sol";

contract DammPool is ReentrancyGuard {
    using TokenTransfer for address;

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;
    uint24 public constant PROTOCOL_FEE_SHARE_DENOMINATOR = 1_000_000;
    uint256 private constant Q128 = 1 << 128;
    address private constant LOCKED_LIQUIDITY_ACCOUNT = address(1);

    error DeadlineExpired();
    error InsufficientInput();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error Unauthorized();
    error PoolPaused();
    error InvalidRecipient();
    error InvalidAdministrator();
    error InvalidProtocolFeeShare();
    error ReserveCapExceeded();

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable baseFeePips;
    address public administrator;
    address public protocolFeeRecipient;
    uint24 public protocolFeeSharePips;
    bool public paused;
    uint112 public reserve0;
    uint112 public reserve1;
    uint128 public protocolFees0;
    uint128 public protocolFees1;
    uint112 public reserveCap0;
    uint112 public reserveCap1;
    uint256 public totalShares;
    mapping(address account => uint256 shares) public sharesOf;
    uint24 public scheduledStartFeePips;
    uint24 public scheduledEndFeePips;
    uint32 public scheduledFeeDuration;
    uint48 public scheduledFeeStartedAt;
    bool public scheduledFeeExponential;
    uint256 public lpFeeGrowth0X128;
    uint256 public lpFeeGrowth1X128;
    uint256 public unclaimedLpFees0;
    uint256 public unclaimedLpFees1;
    mapping(address account => uint256 amount) public feeCredit0;
    mapping(address account => uint256 amount) public feeCredit1;
    mapping(address account => uint256 growthX128) private _feeDebt0X128;
    mapping(address account => uint256 growthX128) private _feeDebt1X128;

    event LiquidityAdded(
        address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1, uint256 shares
    );
    event LiquidityRemoved(
        address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1, uint256 shares
    );
    event Swap(
        address indexed sender,
        address indexed recipient,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 protocolFee
    );
    event ProtocolFeesCollected(address indexed recipient, uint256 amount0, uint256 amount1);
    event PauseUpdated(bool paused);
    event ProtocolFeeConfigurationUpdated(address indexed recipient, uint24 sharePips);
    event AdministratorUpdated(address indexed previousAdministrator, address indexed administrator);
    event ReserveCapsUpdated(uint112 reserveCap0, uint112 reserveCap1);
    event FeeScheduleSet(uint24 startFeePips, uint24 endFeePips, uint32 durationSeconds, bool exponential);
    event LpFeesClaimed(address indexed account, address indexed recipient, uint256 amount0, uint256 amount1);

    modifier onlyAdministrator() {
        if (msg.sender != administrator) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PoolPaused();
        _;
    }

    constructor(PoolKey memory key, address administrator_) {
        if (administrator_ == address(0)) revert InvalidAdministrator();
        factory = msg.sender;
        token0 = key.token0;
        token1 = key.token1;
        baseFeePips = key.feePips;
        administrator = administrator_;
        protocolFeeRecipient = administrator_;
    }

    function addLiquidity(uint256 amount0, uint256 amount1, uint256 minimumShares, address recipient, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        _validateCall(recipient, deadline);
        if (amount0 == 0 || amount1 == 0) revert InsufficientInput();
        token0.pullExact(msg.sender, amount0);
        token1.pullExact(msg.sender, amount1);

        uint256 supply = totalShares;
        if (supply == 0) {
            uint256 root = LiquidityMath.sqrt(amount0 * amount1);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            shares = root - MINIMUM_LIQUIDITY;
            _mint(LOCKED_LIQUIDITY_ACCOUNT, MINIMUM_LIQUIDITY);
        } else {
            shares = LiquidityMath.proportionalShares(amount0, amount1, reserve0, reserve1, supply);
        }
        if (shares == 0 || shares < minimumShares) revert SlippageExceeded();
        _mint(recipient, shares);
        _updateReserves(uint256(reserve0) + amount0, uint256(reserve1) + amount1);
        emit LiquidityAdded(msg.sender, recipient, amount0, amount1, shares);
    }

    function removeLiquidity(
        uint256 shares,
        uint256 minimumAmount0,
        uint256 minimumAmount1,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        _validateCall(recipient, deadline);
        if (shares == 0 || shares > sharesOf[msg.sender]) revert InsufficientLiquidity();
        uint256 supply = totalShares;
        amount0 = FullMath.mulDiv(shares, reserve0, supply);
        amount1 = FullMath.mulDiv(shares, reserve1, supply);
        if (amount0 < minimumAmount0 || amount1 < minimumAmount1) revert SlippageExceeded();
        _settleFees(msg.sender);
        sharesOf[msg.sender] -= shares;
        totalShares = supply - shares;
        _syncFeeDebt(msg.sender);
        _updateReserves(uint256(reserve0) - amount0, uint256(reserve1) - amount1);
        token0.push(recipient, amount0);
        token1.push(recipient, amount1);
        emit LiquidityRemoved(msg.sender, recipient, amount0, amount1, shares);
    }

    function swapExactInput(
        address tokenIn,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        _validateCall(recipient, deadline);
        bool zeroForOne;
        if (tokenIn == token0) zeroForOne = true;
        else if (tokenIn != token1) revert InsufficientInput();

        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        uint256 totalFee;
        (amountOut, totalFee) = ConstantProductMath.quoteExactInput(amountIn, reserveIn, reserveOut, feePips());
        if (amountOut < minimumAmountOut) revert SlippageExceeded();
        uint256 protocolFee = FullMath.mulDiv(totalFee, protocolFeeSharePips, PROTOCOL_FEE_SHARE_DENOMINATOR);
        uint256 lpFee = totalFee - protocolFee;

        tokenIn.pullExact(msg.sender, amountIn);
        address tokenOut = zeroForOne ? token1 : token0;
        tokenOut.push(recipient, amountOut);
        if (zeroForOne) {
            protocolFees0 += _toUint128(protocolFee);
            _accrueLpFee(true, lpFee);
            _updateReserves(reserveIn + amountIn - totalFee, reserveOut - amountOut);
        } else {
            protocolFees1 += _toUint128(protocolFee);
            _accrueLpFee(false, lpFee);
            _updateReserves(reserveOut - amountOut, reserveIn + amountIn - totalFee);
        }
        emit Swap(msg.sender, recipient, tokenIn, amountIn, amountOut, protocolFee);
    }

    function quoteExactOutput(address tokenIn, uint256 amountOut)
        public
        view
        returns (uint256 amountIn, uint256 totalFee)
    {
        bool zeroForOne;
        if (tokenIn == token0) zeroForOne = true;
        else if (tokenIn != token1) revert InsufficientInput();
        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        return ConstantProductMath.quoteExactOutput(amountOut, reserveIn, reserveOut, feePips());
    }

    function swapExactOutput(
        address tokenIn,
        uint256 amountOut,
        uint256 maximumAmountIn,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountIn) {
        _validateCall(recipient, deadline);
        bool zeroForOne;
        if (tokenIn == token0) zeroForOne = true;
        else if (tokenIn != token1) revert InsufficientInput();
        uint256 totalFee;
        (amountIn, totalFee) = quoteExactOutput(tokenIn, amountOut);
        if (amountIn > maximumAmountIn) revert SlippageExceeded();
        uint256 protocolFee = FullMath.mulDiv(totalFee, protocolFeeSharePips, PROTOCOL_FEE_SHARE_DENOMINATOR);
        uint256 lpFee = totalFee - protocolFee;
        tokenIn.pullExact(msg.sender, amountIn);
        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        (zeroForOne ? token1 : token0).pushExact(recipient, amountOut);
        if (zeroForOne) {
            protocolFees0 += _toUint128(protocolFee);
            _accrueLpFee(true, lpFee);
            _updateReserves(reserveIn + amountIn - totalFee, reserveOut - amountOut);
        } else {
            protocolFees1 += _toUint128(protocolFee);
            _accrueLpFee(false, lpFee);
            _updateReserves(reserveOut - amountOut, reserveIn + amountIn - totalFee);
        }
        emit Swap(msg.sender, recipient, tokenIn, amountIn, amountOut, protocolFee);
    }

    function setPaused(bool paused_) external onlyAdministrator {
        paused = paused_;
        emit PauseUpdated(paused_);
    }

    function setProtocolFeeConfiguration(address recipient, uint24 sharePips) external onlyAdministrator {
        if (recipient == address(0)) revert InvalidRecipient();
        if (sharePips > PROTOCOL_FEE_SHARE_DENOMINATOR) revert InvalidProtocolFeeShare();
        protocolFeeRecipient = recipient;
        protocolFeeSharePips = sharePips;
        emit ProtocolFeeConfigurationUpdated(recipient, sharePips);
    }

    function setAdministrator(address administrator_) external onlyAdministrator {
        if (administrator_ == address(0)) revert InvalidAdministrator();
        address previous = administrator;
        administrator = administrator_;
        emit AdministratorUpdated(previous, administrator_);
    }

    function setReserveCaps(uint112 reserveCap0_, uint112 reserveCap1_) external onlyAdministrator {
        if (reserveCap0_ == 0 || reserveCap1_ == 0 || reserve0 > reserveCap0_ || reserve1 > reserveCap1_) {
            revert ReserveCapExceeded();
        }
        reserveCap0 = reserveCap0_;
        reserveCap1 = reserveCap1_;
        emit ReserveCapsUpdated(reserveCap0_, reserveCap1_);
    }

    function configureFeeSchedule(uint24 startFeePips, uint24 endFeePips, uint32 durationSeconds, bool exponential)
        external
    {
        if (msg.sender != administrator && msg.sender != factory) revert Unauthorized();
        if (
            totalShares != 0 || scheduledFeeStartedAt != 0 || startFeePips <= endFeePips
                || startFeePips >= PROTOCOL_FEE_SHARE_DENOMINATOR || endFeePips == 0 || durationSeconds == 0
        ) revert InvalidProtocolFeeShare();
        scheduledStartFeePips = startFeePips;
        scheduledEndFeePips = endFeePips;
        scheduledFeeDuration = durationSeconds;
        scheduledFeeStartedAt = uint48(block.timestamp);
        scheduledFeeExponential = exponential;
        emit FeeScheduleSet(startFeePips, endFeePips, durationSeconds, exponential);
    }

    function feePips() public view returns (uint24) {
        uint48 startedAt = scheduledFeeStartedAt;
        if (startedAt == 0) return baseFeePips;
        uint256 elapsed = block.timestamp - startedAt;
        uint256 duration = scheduledFeeDuration;
        if (elapsed >= duration) return scheduledEndFeePips;
        uint256 spread = uint256(scheduledStartFeePips) - scheduledEndFeePips;
        uint256 remaining = duration - elapsed;
        uint256 decay = scheduledFeeExponential
            ? spread * remaining * remaining / (duration * duration)
            : spread * remaining / duration;
        return uint24(uint256(scheduledEndFeePips) + decay);
    }

    function collectProtocolFees() external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (msg.sender != protocolFeeRecipient) {
            revert Unauthorized();
        }
        amount0 = protocolFees0;
        amount1 = protocolFees1;
        protocolFees0 = 0;
        protocolFees1 = 0;
        if (amount0 != 0) token0.push(msg.sender, amount0);
        if (amount1 != 0) token1.push(msg.sender, amount1);
        emit ProtocolFeesCollected(msg.sender, amount0, amount1);
    }

    function claimableFees(address account) external view returns (uint256 amount0, uint256 amount1) {
        uint256 shares = sharesOf[account];
        amount0 = feeCredit0[account]
            + FullMath.mulDiv(shares, lpFeeGrowth0X128 - _feeDebt0X128[account], Q128);
        amount1 = feeCredit1[account]
            + FullMath.mulDiv(shares, lpFeeGrowth1X128 - _feeDebt1X128[account], Q128);
    }

    function claimLpFees(uint256 amount0, uint256 amount1, address recipient) external nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        _settleFees(msg.sender);
        if (amount0 > feeCredit0[msg.sender] || amount1 > feeCredit1[msg.sender]) revert InsufficientLiquidity();
        if (amount0 != 0) {
            feeCredit0[msg.sender] -= amount0;
            unclaimedLpFees0 -= amount0;
            token0.pushExact(recipient, amount0);
        }
        if (amount1 != 0) {
            feeCredit1[msg.sender] -= amount1;
            unclaimedLpFees1 -= amount1;
            token1.pushExact(recipient, amount1);
        }
        emit LpFeesClaimed(msg.sender, recipient, amount0, amount1);
    }

    function _mint(address recipient, uint256 shares) private {
        _settleFees(recipient);
        sharesOf[recipient] += shares;
        totalShares += shares;
        _syncFeeDebt(recipient);
    }

    function _accrueLpFee(bool tokenZero, uint256 amount) private {
        if (amount == 0) return;
        uint256 supply = totalShares;
        if (supply == 0) revert InsufficientLiquidity();
        if (tokenZero) {
            unclaimedLpFees0 += amount;
            lpFeeGrowth0X128 += FullMath.mulDiv(amount, Q128, supply);
        } else {
            unclaimedLpFees1 += amount;
            lpFeeGrowth1X128 += FullMath.mulDiv(amount, Q128, supply);
        }
    }

    function _settleFees(address account) private {
        uint256 shares = sharesOf[account];
        if (shares != 0) {
            feeCredit0[account] += FullMath.mulDiv(shares, lpFeeGrowth0X128 - _feeDebt0X128[account], Q128);
            feeCredit1[account] += FullMath.mulDiv(shares, lpFeeGrowth1X128 - _feeDebt1X128[account], Q128);
        }
        _syncFeeDebt(account);
    }

    function _syncFeeDebt(address account) private {
        _feeDebt0X128[account] = lpFeeGrowth0X128;
        _feeDebt1X128[account] = lpFeeGrowth1X128;
    }

    function _updateReserves(uint256 nextReserve0, uint256 nextReserve1) private {
        if (
            nextReserve0 > type(uint112).max || nextReserve1 > type(uint112).max || reserveCap0 == 0 || reserveCap1 == 0
                || nextReserve0 > reserveCap0 || nextReserve1 > reserveCap1
        ) {
            revert ReserveCapExceeded();
        }
        // Bounds are checked immediately above.
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve0 = uint112(nextReserve0);
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve1 = uint112(nextReserve1);
    }

    function _toUint128(uint256 value) private pure returns (uint128 result) {
        if (value > type(uint128).max) revert InsufficientLiquidity();
        // forge-lint: disable-next-line(unsafe-typecast)
        result = uint128(value);
    }

    function _validateCall(address recipient, uint256 deadline) private view {
        // Deadlines intentionally use the current block timestamp and tolerate normal validator drift.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (recipient == address(0)) revert InvalidRecipient();
    }
}
