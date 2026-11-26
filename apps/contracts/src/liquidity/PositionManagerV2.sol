// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {DlmmPoolV2} from "../core/DlmmPoolV2.sol";
import {DammPool} from "../core/DammPool.sol";
import {PoolRegistry} from "../core/PoolRegistry.sol";
import {IPositionManagerV2} from "../interfaces/IPositionManagerV2.sol";
import {TokenTransfer} from "../libraries/TokenTransfer.sol";
import {FullMath} from "../math/FullMath.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "../security/ReentrancyGuard.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 id, bytes calldata data) external returns (bytes4);
}

contract PositionManagerV2 is IPositionManagerV2, ProtocolAccess, UUPSUpgradeable, ReentrancyGuard {
    using TokenTransfer for address;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    string public constant name = "Fomeora Liquidity Position";
    string public constant symbol = "FLP";

    error InvalidPool();
    error InvalidPosition();
    error InvalidRange();
    error InvalidRecipient();
    error UnauthorizedPosition();
    error UnsafeRecipient();

    PoolRegistry public registry;
    uint256 public nextPositionId;
    uint256 private _operationNonce;
    mapping(uint256 => RangePosition) public positions;
    mapping(uint256 => int24[]) private _positionBins;
    mapping(uint256 => mapping(int24 => uint256)) public binShares;
    mapping(uint256 => uint256) public dammShares;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 id => bool locked) public positionLocked;
    mapping(uint256 id => uint256 growthX128) public dammFeeGrowth0Last;
    mapping(uint256 id => uint256 growthX128) public dammFeeGrowth1Last;
    mapping(uint256 id => uint256 amount) public dammFeesOwed0;
    mapping(uint256 id => uint256 amount) public dammFeesOwed1;
    // Appended storage. Links a tailed position to the caller's canonical source position.
    mapping(uint256 tailPositionId => uint256 sourcePositionId) public referrerPosition;
    mapping(uint256 positionId => mapping(int24 binId => uint256 growthX128)) public protocolFeeGrowth0Last;
    mapping(uint256 positionId => mapping(int24 binId => uint256 growthX128)) public protocolFeeGrowth1Last;
    mapping(uint256 positionId => uint256 amount) public tailProtocolFeesOwed0;
    mapping(uint256 positionId => uint256 amount) public tailProtocolFeesOwed1;
    mapping(uint256 positionId => bool supported) public tailFeeGrowthSupported;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event TailProtocolFeesAccrued(uint256 indexed id, uint256 amount0, uint256 amount1);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader, PoolRegistry registry_) external initializer {
        if (address(registry_) == address(0)) revert InvalidPool();
        __ProtocolAccess_init(admin, upgrader);
        registry = registry_;
        nextPositionId = 1;
    }

    function createRangePosition(CreateParams calldata p) external nonReentrant returns (uint256 id) {
        return _createRangePosition(p, 0);
    }

    function createRangePositionForTail(CreateParams calldata p, uint256 referrerPositionId)
        external
        nonReentrant
        returns (uint256 id)
    {
        _validateReferrerPosition(p.pool, p.referrer, referrerPositionId);
        return _createRangePosition(p, referrerPositionId);
    }

    function _createRangePosition(CreateParams calldata p, uint256 referrerPositionId)
        private
        returns (uint256 id)
    {
        _validateCreate(p);
        DlmmPoolV2 pool = DlmmPoolV2(p.pool);
        DlmmPoolV2.AddBin[] memory adds = _additions(p.bins, p.amountsX, p.amountsY, p.minShares);
        _fund(pool, p.amountsX, p.amountsY);
        uint256[] memory beforeShares = _sharesBefore(pool, p.bins);
        pool.addLiquidityBatch(_operationId(), adds, p.expectedActiveBin, address(this), p.deadline);
        _clear(pool);

        id = nextPositionId++;
        positions[id] = RangePosition(p.pool, p.bins[0], p.bins[p.bins.length - 1], p.shape, p.tag, p.referrer, true);
        uint256[] memory positionShares = new uint256[](p.bins.length);
        for (uint256 i; i < p.bins.length; ++i) {
            int24 bin = p.bins[i];
            uint256 minted = pool.sharesOf(bin, address(this)) - beforeShares[i];
            if (minted == 0) revert InvalidRange();
            _positionBins[id].push(bin);
            binShares[id][bin] = minted;
            positionShares[i] = minted;
        }
        _mint(msg.sender, id);
        if (referrerPositionId != 0) {
            referrerPosition[id] = referrerPositionId;
            _initializeTailFeeGrowth(id, pool);
            emit ReferrerPositionLinked(id, referrerPositionId, p.referrer);
        }
        emit PositionSharesUpdated(id, p.bins, positionShares);
        emit RangePositionCreated(
            id, msg.sender, p.pool, p.bins[0], p.bins[p.bins.length - 1], p.shape, p.tag, p.referrer
        );
    }

    function createDammPosition(CreateDammParams calldata p) external nonReentrant returns (uint256 id) {
        return _createDammPosition(p, 0);
    }

    function createDammPositionForTail(CreateDammParams calldata p, uint256 referrerPositionId)
        external
        nonReentrant
        returns (uint256 id)
    {
        _validateReferrerPosition(p.pool, p.referrer, referrerPositionId);
        return _createDammPosition(p, referrerPositionId);
    }

    function _createDammPosition(CreateDammParams calldata p, uint256 referrerPositionId)
        private
        returns (uint256 id)
    {
        if (!registry.isRegisteredPool(p.pool)) revert InvalidPool();
        if (p.referrer == msg.sender || p.amountX == 0 || p.amountY == 0) revert InvalidRange();
        DammPool pool = DammPool(p.pool);
        _fundDamm(pool, p.amountX, p.amountY);
        uint256 shares = pool.addLiquidity(p.amountX, p.amountY, p.minShares, address(this), p.deadline);
        _clearDamm(pool);
        id = nextPositionId++;
        positions[id] = RangePosition({
            pool: p.pool,
            lowerBin: 0,
            upperBin: 0,
            shape: uint8(Shape.Custom),
            tag: p.tag,
            referrer: p.referrer,
            open: true
        });
        dammShares[id] = shares;
        (bool feeAware, uint256 growth0, uint256 growth1) = _dammFeeGrowth(pool);
        if (feeAware) {
            dammFeeGrowth0Last[id] = growth0;
            dammFeeGrowth1Last[id] = growth1;
        }
        _mint(msg.sender, id);
        if (referrerPositionId != 0) {
            referrerPosition[id] = referrerPositionId;
            emit ReferrerPositionLinked(id, referrerPositionId, p.referrer);
        }
        emit DammPositionCreated(id, msg.sender, p.pool, shares, p.tag, p.referrer);
    }

    function increaseRange(
        uint256 id,
        int24 expectedActiveBin,
        int24[] calldata bins,
        uint256[] calldata amountsX,
        uint256[] calldata amountsY,
        uint256[] calldata minShares,
        uint256 deadline
    ) external nonReentrant {
        _requireAuthorized(id);
        _validateArrays(bins, amountsX, amountsY, minShares);
        RangePosition storage position = positions[id];
        for (uint256 i; i < bins.length; ++i) {
            if (bins[i] < position.lowerBin || bins[i] > position.upperBin || binShares[id][bins[i]] == 0) {
                revert InvalidRange();
            }
        }
        DlmmPoolV2 pool = DlmmPoolV2(position.pool);
        _accrueRangeTailProtocolFees(id, pool);
        DlmmPoolV2.AddBin[] memory adds = _additions(bins, amountsX, amountsY, minShares);
        _fund(pool, amountsX, amountsY);
        uint256[] memory beforeShares = _sharesBefore(pool, bins);
        pool.addLiquidityBatch(_operationId(), adds, expectedActiveBin, address(this), deadline);
        _clear(pool);
        uint256[] memory positionShares = new uint256[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            binShares[id][bins[i]] += pool.sharesOf(bins[i], address(this)) - beforeShares[i];
            positionShares[i] = binShares[id][bins[i]];
        }
        emit PositionSharesUpdated(id, bins, positionShares);
        emit RangePositionIncreased(id, bins, amountsX, amountsY);
    }

    function decreaseRange(uint256 id, uint16 bps, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        public
        nonReentrant
        returns (uint256 amountX, uint256 amountY)
    {
        _requireAuthorized(id);
        if (bps == 0 || bps > BPS_DENOMINATOR) revert InvalidRange();
        if (recipient == address(0)) revert InvalidRecipient();
        RangePosition storage position = positions[id];
        _accrueRangeTailProtocolFees(id, DlmmPoolV2(position.pool));
        (amountX, amountY) = DlmmPoolV2(position.pool)
            .removeLiquidityBatch(_operationId(), _removals(id, bps), minX, minY, recipient, deadline);
        int24[] memory bins = _positionBins[id];
        uint256[] memory positionShares = new uint256[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            positionShares[i] = binShares[id][bins[i]];
        }
        emit PositionSharesUpdated(id, bins, positionShares);
        emit RangePositionDecreased(id, bps, amountX, amountY);
        if (bps == BPS_DENOMINATOR) {
            position.open = false;
            _burn(id);
            emit RangePositionClosed(id);
        }
    }

    function closeRange(uint256 id, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY)
    {
        return decreaseRange(id, BPS_DENOMINATOR, minX, minY, recipient, deadline);
    }

    /// @notice Permissionless checkpoint used by FeeSplitter before settling an
    /// attributed tail reward. It cannot move liquidity or change ownership.
    function checkpointTailProtocolFees(uint256 id) external override nonReentrant {
        RangePosition storage position = positions[id];
        if (position.pool == address(0) || referrerPosition[id] == 0) revert InvalidPosition();
        _accrueRangeTailProtocolFees(id, DlmmPoolV2(position.pool));
    }

    function increaseDamm(uint256 id, uint256 amountX, uint256 amountY, uint256 minShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 sharesAdded)
    {
        _requireDammAuthorized(id);
        DammPool pool = DammPool(positions[id].pool);
        bool feeAware = _accrueDammFees(id, pool);
        _fundDamm(pool, amountX, amountY);
        sharesAdded = pool.addLiquidity(amountX, amountY, minShares, address(this), deadline);
        _clearDamm(pool);
        dammShares[id] += sharesAdded;
        if (feeAware) {
            (bool supportedAfter, uint256 growth0, uint256 growth1) = _dammFeeGrowth(pool);
            if (!supportedAfter) revert InvalidPool();
            dammFeeGrowth0Last[id] = growth0;
            dammFeeGrowth1Last[id] = growth1;
        }
        emit DammPositionIncreased(id, sharesAdded, dammShares[id]);
    }

    function decreaseDamm(uint256 id, uint16 bps, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        public
        nonReentrant
        returns (uint256 amountX, uint256 amountY)
    {
        _requireDammAuthorized(id);
        if (positionLocked[id]) revert UnauthorizedPosition();
        if (bps == 0 || bps > BPS_DENOMINATOR || recipient == address(0)) revert InvalidRange();
        uint256 owned = dammShares[id];
        DammPool pool = DammPool(positions[id].pool);
        bool feeAware = _accrueDammFees(id, pool);
        uint256 removing = bps == BPS_DENOMINATOR ? owned : owned * bps / BPS_DENOMINATOR;
        if (removing == 0) revert InvalidRange();
        dammShares[id] = owned - removing;
        (amountX, amountY) = pool.removeLiquidity(removing, minX, minY, recipient, deadline);
        emit DammPositionDecreased(id, bps, amountX, amountY);
        if (bps == BPS_DENOMINATOR) {
            if (feeAware) _payDammFees(id, pool, recipient);
            positions[id].open = false;
            _burn(id);
            emit DammPositionClosed(id);
        }
    }

    function closeDamm(uint256 id, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        external
        returns (uint256 amountX, uint256 amountY)
    {
        return decreaseDamm(id, BPS_DENOMINATOR, minX, minY, recipient, deadline);
    }

    function lockPosition(uint256 id) external {
        _requireDammAuthorized(id);
        positionLocked[id] = true;
        emit PositionLocked(id, ownerOf(id));
    }

    function claimDammFees(uint256 id, address recipient)
        external
        nonReentrant
        returns (uint256 amountX, uint256 amountY)
    {
        _requireDammAuthorized(id);
        if (recipient == address(0)) revert InvalidRecipient();
        DammPool pool = DammPool(positions[id].pool);
        if (!_accrueDammFees(id, pool)) return (0, 0);
        return _payDammFees(id, pool, recipient);
    }

    function positionBins(uint256 id) external view returns (int24[] memory) {
        return _positionBins[id];
    }

    function ownerOf(uint256 id) public view returns (address owner) {
        owner = _owners[id];
        if (owner == address(0)) revert InvalidPosition();
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidRecipient();
        return _balances[owner];
    }

    function getApproved(uint256 id) external view returns (address) {
        ownerOf(id);
        return _tokenApprovals[id];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function approve(address approved, uint256 id) external {
        address owner = ownerOf(id);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) revert UnauthorizedPosition();
        _tokenApprovals[id] = approved;
        emit Approval(owner, approved, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert UnauthorizedPosition();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (!_authorized(msg.sender, id)) revert UnauthorizedPosition();
        if (ownerOf(id) != from || to == address(0)) revert InvalidRecipient();
        delete _tokenApprovals[id];
        unchecked {
            --_balances[from];
            ++_balances[to];
        }
        _owners[id] = to;
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (
            to.code.length != 0
                && IERC721Receiver(to).onERC721Received(msg.sender, from, id, data)
                    != IERC721Receiver.onERC721Received.selector
        ) revert UnsafeRecipient();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd;
    }

    function _validateCreate(CreateParams calldata p) private view {
        if (!registry.isRegisteredPool(p.pool) || DlmmPoolV2(p.pool).version() != 2) revert InvalidPool();
        if (p.shape > uint8(Shape.Custom) || p.referrer == msg.sender) revert InvalidRange();
        _validateArrays(p.bins, p.amountsX, p.amountsY, p.minShares);
    }

    function _validateReferrerPosition(address pool, address referrer, uint256 referrerPositionId) private view {
        if (referrer == address(0) || referrerPositionId == 0 || ownerOf(referrerPositionId) != referrer) {
            revert InvalidPosition();
        }
        RangePosition storage source = positions[referrerPositionId];
        if (!source.open || source.pool != pool) revert InvalidPosition();
    }

    function _validateArrays(
        int24[] calldata bins,
        uint256[] calldata ax,
        uint256[] calldata ay,
        uint256[] calldata mins
    ) private pure {
        uint256 length = bins.length;
        if (length == 0 || length > 61 || ax.length != length || ay.length != length || mins.length != length) {
            revert InvalidRange();
        }
        for (uint256 i = 1; i < length; ++i) {
            if (bins[i - 1] >= bins[i]) revert InvalidRange();
        }
    }

    function _additions(int24[] calldata bins, uint256[] calldata ax, uint256[] calldata ay, uint256[] calldata mins)
        private
        pure
        returns (DlmmPoolV2.AddBin[] memory adds)
    {
        adds = new DlmmPoolV2.AddBin[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            adds[i] = DlmmPoolV2.AddBin(bins[i], ax[i], ay[i], mins[i]);
        }
    }

    function _fund(DlmmPoolV2 pool, uint256[] calldata ax, uint256[] calldata ay) private {
        uint256 totalX;
        uint256 totalY;
        for (uint256 i; i < ax.length; ++i) {
            totalX += ax[i];
            totalY += ay[i];
        }
        if (totalX != 0) pool.token0().pullExact(msg.sender, totalX);
        if (totalY != 0) pool.token1().pullExact(msg.sender, totalY);
        pool.token0().forceApprove(address(pool), totalX);
        pool.token1().forceApprove(address(pool), totalY);
    }

    function _clear(DlmmPoolV2 pool) private {
        pool.token0().forceApprove(address(pool), 0);
        pool.token1().forceApprove(address(pool), 0);
    }

    function _fundDamm(DammPool pool, uint256 amountX, uint256 amountY) private {
        pool.token0().pullExact(msg.sender, amountX);
        pool.token1().pullExact(msg.sender, amountY);
        pool.token0().forceApprove(address(pool), amountX);
        pool.token1().forceApprove(address(pool), amountY);
    }

    function _clearDamm(DammPool pool) private {
        pool.token0().forceApprove(address(pool), 0);
        pool.token1().forceApprove(address(pool), 0);
    }

    function _accrueDammFees(uint256 id, DammPool pool) private returns (bool feeAware) {
        uint256 growth0;
        uint256 growth1;
        (feeAware, growth0, growth1) = _dammFeeGrowth(pool);
        if (!feeAware) return false;
        uint256 shares = dammShares[id];
        uint256 previous0 = dammFeeGrowth0Last[id];
        uint256 previous1 = dammFeeGrowth1Last[id];
        if (growth0 > previous0) dammFeesOwed0[id] += FullMath.mulDiv(shares, growth0 - previous0, 1 << 128);
        if (growth1 > previous1) dammFeesOwed1[id] += FullMath.mulDiv(shares, growth1 - previous1, 1 << 128);
        dammFeeGrowth0Last[id] = growth0;
        dammFeeGrowth1Last[id] = growth1;
    }

    function _dammFeeGrowth(DammPool pool) private view returns (bool supported, uint256 growth0, uint256 growth1) {
        (bool success0, bytes memory data0) = address(pool).staticcall(abi.encodeWithSignature("lpFeeGrowth0X128()"));
        (bool success1, bytes memory data1) = address(pool).staticcall(abi.encodeWithSignature("lpFeeGrowth1X128()"));
        supported = success0 && data0.length == 32 && success1 && data1.length == 32;
        if (supported) {
            growth0 = abi.decode(data0, (uint256));
            growth1 = abi.decode(data1, (uint256));
        }
    }

    function _payDammFees(uint256 id, DammPool pool, address recipient)
        private
        returns (uint256 amountX, uint256 amountY)
    {
        amountX = dammFeesOwed0[id];
        amountY = dammFeesOwed1[id];
        dammFeesOwed0[id] = 0;
        dammFeesOwed1[id] = 0;
        pool.claimLpFees(amountX, amountY, recipient);
        emit DammFeesClaimed(id, recipient, amountX, amountY);
    }

    function _sharesBefore(DlmmPoolV2 pool, int24[] calldata bins) private view returns (uint256[] memory shares) {
        shares = new uint256[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            shares[i] = pool.sharesOf(bins[i], address(this));
        }
    }

    function _initializeTailFeeGrowth(uint256 id, DlmmPoolV2 pool) private {
        int24[] storage bins = _positionBins[id];
        if (bins.length == 0) return;
        (bool supported,,) = _protocolFeeGrowth(pool, bins[0]);
        tailFeeGrowthSupported[id] = supported;
        if (!supported) return;
        for (uint256 i; i < bins.length; ++i) {
            (, uint256 growth0, uint256 growth1) = _protocolFeeGrowth(pool, bins[i]);
            protocolFeeGrowth0Last[id][bins[i]] = growth0;
            protocolFeeGrowth1Last[id][bins[i]] = growth1;
        }
    }

    function _accrueRangeTailProtocolFees(uint256 id, DlmmPoolV2 pool) private {
        if (!tailFeeGrowthSupported[id]) return;
        int24[] storage bins = _positionBins[id];
        uint256 accrued0;
        uint256 accrued1;
        for (uint256 i; i < bins.length; ++i) {
            int24 bin = bins[i];
            (bool supported, uint256 growth0, uint256 growth1) = _protocolFeeGrowth(pool, bin);
            if (!supported) revert InvalidPool();
            uint256 shares = binShares[id][bin];
            uint256 previous0 = protocolFeeGrowth0Last[id][bin];
            uint256 previous1 = protocolFeeGrowth1Last[id][bin];
            if (growth0 > previous0) accrued0 += FullMath.mulDiv(shares, growth0 - previous0, 1 << 128);
            if (growth1 > previous1) accrued1 += FullMath.mulDiv(shares, growth1 - previous1, 1 << 128);
            protocolFeeGrowth0Last[id][bin] = growth0;
            protocolFeeGrowth1Last[id][bin] = growth1;
        }
        if (accrued0 != 0) tailProtocolFeesOwed0[id] += accrued0;
        if (accrued1 != 0) tailProtocolFeesOwed1[id] += accrued1;
        if (accrued0 != 0 || accrued1 != 0) emit TailProtocolFeesAccrued(id, accrued0, accrued1);
    }

    function _protocolFeeGrowth(DlmmPoolV2 pool, int24 bin)
        private
        view
        returns (bool supported, uint256 growth0, uint256 growth1)
    {
        (bool success0, bytes memory data0) = address(pool).staticcall(
            abi.encodeWithSignature("protocolFeeGrowth0X128(int24)", bin)
        );
        (bool success1, bytes memory data1) = address(pool).staticcall(
            abi.encodeWithSignature("protocolFeeGrowth1X128(int24)", bin)
        );
        supported = success0 && data0.length == 32 && success1 && data1.length == 32;
        if (supported) {
            growth0 = abi.decode(data0, (uint256));
            growth1 = abi.decode(data1, (uint256));
        }
    }

    function _removals(uint256 id, uint16 bps) private returns (DlmmPoolV2.RemoveBin[] memory removals) {
        int24[] storage bins = _positionBins[id];
        removals = new DlmmPoolV2.RemoveBin[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            int24 bin = bins[i];
            uint256 owned = binShares[id][bin];
            uint256 removing = bps == BPS_DENOMINATOR ? owned : owned * bps / BPS_DENOMINATOR;
            if (removing == 0) revert InvalidRange();
            binShares[id][bin] = owned - removing;
            removals[i] = DlmmPoolV2.RemoveBin(bin, removing, 0, 0);
        }
    }

    function _operationId() private returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), ++_operationNonce));
    }

    function _requireAuthorized(uint256 id) private view {
        if (!positions[id].open) revert InvalidPosition();
        if (!_authorized(msg.sender, id)) revert UnauthorizedPosition();
    }

    function _requireDammAuthorized(uint256 id) private view {
        _requireAuthorized(id);
        if (dammShares[id] == 0 || _positionBins[id].length != 0) revert InvalidPosition();
    }

    function _authorized(address operator, uint256 id) private view returns (bool) {
        address owner = _owners[id];
        return owner != address(0)
            && (operator == owner || _tokenApprovals[id] == operator || _operatorApprovals[owner][operator]);
    }

    function _mint(address to, uint256 id) private {
        if (to == address(0) || _owners[id] != address(0)) revert InvalidRecipient();
        _owners[id] = to;
        ++_balances[to];
        emit Transfer(address(0), to, id);
    }

    function _burn(uint256 id) private {
        address owner = ownerOf(id);
        delete _tokenApprovals[id];
        delete _owners[id];
        unchecked {
            --_balances[owner];
        }
        emit Transfer(owner, address(0), id);
    }
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
