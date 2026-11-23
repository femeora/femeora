// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {DlmmPoolV2} from "../core/DlmmPoolV2.sol";
import {DammPool} from "../core/DammPool.sol";
import {PoolRegistry} from "../core/PoolRegistry.sol";
import {IPositionManagerV2} from "../interfaces/IPositionManagerV2.sol";
import {TokenTransfer} from "../libraries/TokenTransfer.sol";
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

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

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
        emit PositionSharesUpdated(id, p.bins, positionShares);
        emit RangePositionCreated(
            id, msg.sender, p.pool, p.bins[0], p.bins[p.bins.length - 1], p.shape, p.tag, p.referrer
        );
    }

    function createDammPosition(CreateDammParams calldata p) external nonReentrant returns (uint256 id) {
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
        _mint(msg.sender, id);
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

    function increaseDamm(uint256 id, uint256 amountX, uint256 amountY, uint256 minShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 sharesAdded)
    {
        _requireDammAuthorized(id);
        DammPool pool = DammPool(positions[id].pool);
        _fundDamm(pool, amountX, amountY);
        sharesAdded = pool.addLiquidity(amountX, amountY, minShares, address(this), deadline);
        _clearDamm(pool);
        dammShares[id] += sharesAdded;
        emit DammPositionIncreased(id, sharesAdded, dammShares[id]);
    }

    function decreaseDamm(uint256 id, uint16 bps, uint256 minX, uint256 minY, address recipient, uint256 deadline)
        public
        nonReentrant
        returns (uint256 amountX, uint256 amountY)
    {
        _requireDammAuthorized(id);
        if (bps == 0 || bps > BPS_DENOMINATOR || recipient == address(0)) revert InvalidRange();
        uint256 owned = dammShares[id];
        uint256 removing = bps == BPS_DENOMINATOR ? owned : owned * bps / BPS_DENOMINATOR;
        if (removing == 0) revert InvalidRange();
        dammShares[id] = owned - removing;
        (amountX, amountY) = DammPool(positions[id].pool).removeLiquidity(removing, minX, minY, recipient, deadline);
        emit DammPositionDecreased(id, bps, amountX, amountY);
        if (bps == BPS_DENOMINATOR) {
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

    function _sharesBefore(DlmmPoolV2 pool, int24[] calldata bins) private view returns (uint256[] memory shares) {
        shares = new uint256[](bins.length);
        for (uint256 i; i < bins.length; ++i) {
            shares[i] = pool.sharesOf(bins[i], address(this));
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
