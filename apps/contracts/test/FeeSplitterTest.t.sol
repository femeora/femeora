// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeSplitter} from "../src/fees/FeeSplitter.sol";
import {ERC1967Proxy} from "../src/proxy/ERC1967Proxy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ReferrerPositionManagerMock {
    mapping(uint256 positionId => address owner) public owners;
    mapping(uint256 positionId => bool open) public open;
    mapping(uint256 positionId => address pool) public pool;
    mapping(uint256 positionId => address referrer) public referrer;
    mapping(uint256 tailPositionId => uint256 sourcePositionId) public referrerPosition;
    mapping(uint256 tailPositionId => uint256 amount) public tailProtocolFeesOwed0;
    mapping(uint256 tailPositionId => uint256 amount) public tailProtocolFeesOwed1;

    function setPosition(uint256 positionId, address owner, bool isOpen) external {
        owners[positionId] = owner;
        open[positionId] = isOpen;
    }

    function setTail(
        uint256 tailPositionId,
        address pool_,
        address referrer_,
        uint256 sourcePositionId,
        uint256 owed0,
        uint256 owed1
    ) external {
        owners[tailPositionId] = address(this);
        open[tailPositionId] = true;
        pool[tailPositionId] = pool_;
        referrer[tailPositionId] = referrer_;
        referrerPosition[tailPositionId] = sourcePositionId;
        tailProtocolFeesOwed0[tailPositionId] = owed0;
        tailProtocolFeesOwed1[tailPositionId] = owed1;
    }

    function checkpointTailProtocolFees(uint256) external { }

    function ownerOf(uint256 positionId) external view returns (address) {
        address owner = owners[positionId];
        require(owner != address(0), "missing");
        return owner;
    }

    function positions(uint256 positionId)
        external
        view
        returns (address, int24, int24, uint8, bytes32, address, bool)
    {
        address positionPool = pool[positionId];
        return (
            positionPool == address(0) ? address(1) : positionPool,
            0,
            1,
            0,
            bytes32(0),
            referrer[positionId],
            open[positionId]
        );
    }
}

contract ProtocolFeePoolMock {
    address public immutable token0;
    address public immutable token1;
    uint256 public amount0;
    uint256 public amount1;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function fund(uint256 amount0_, uint256 amount1_) external {
        amount0 = amount0_;
        amount1 = amount1_;
        if (amount0_ != 0) MockERC20(token0).transferFrom(msg.sender, address(this), amount0_);
        if (amount1_ != 0) MockERC20(token1).transferFrom(msg.sender, address(this), amount1_);
    }

    function collectProtocolFees() external returns (uint256 collected0, uint256 collected1) {
        collected0 = amount0;
        collected1 = amount1;
        amount0 = 0;
        amount1 = 0;
        if (collected0 != 0) MockERC20(token0).transfer(msg.sender, collected0);
        if (collected1 != 0) MockERC20(token1).transfer(msg.sender, collected1);
    }
}

contract FeeSplitterTest {
    FeeSplitter private splitter;
    MockERC20 private token;
    ReferrerPositionManagerMock private manager;
    address private constant TREASURY = address(0xA11CE);
    address private constant REFERRER = address(0xBEEF);
    uint256 private constant POSITION_ID = 42;

    function setUp() public {
        FeeSplitter implementation = new FeeSplitter();
        splitter = FeeSplitter(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(FeeSplitter.initialize, (address(this), address(this), TREASURY))
                )
            )
        );
        manager = new ReferrerPositionManagerMock();
        token = new MockERC20("Fee Token", "FEE", 18);
        splitter.setPositionManager(address(manager));
        splitter.setTailRewardBps(1_000);
        splitter.setRole(splitter.DISTRIBUTOR_ROLE(), address(this), true);
        token.mint(address(this), 1_000 ether);
        token.approve(address(splitter), type(uint256).max);
    }

    function testEligibleOpenPositionReceivesTailReward() public {
        manager.setPosition(POSITION_ID, REFERRER, true);
        splitter.distributeForTail(address(token), REFERRER, POSITION_ID, 100 ether);
        require(token.balanceOf(REFERRER) == 10 ether, "reward");
        require(token.balanceOf(TREASURY) == 90 ether, "treasury");
    }

    function testClosedPositionFallsBackToTreasury() public {
        manager.setPosition(POSITION_ID, REFERRER, false);
        splitter.distributeForTail(address(token), REFERRER, POSITION_ID, 100 ether);
        require(token.balanceOf(REFERRER) == 0, "closed reward");
        require(token.balanceOf(TREASURY) == 100 ether, "treasury");
    }

    function testTransferredPositionDoesNotRewardPreviousOwner() public {
        manager.setPosition(POSITION_ID, address(0xCAFE), true);
        splitter.distributeForTail(address(token), REFERRER, POSITION_ID, 100 ether);
        require(token.balanceOf(REFERRER) == 0, "previous owner reward");
        require(token.balanceOf(TREASURY) == 100 ether, "treasury");
    }

    function testLegacyDistributionCannotCreateUnattributedReward() public {
        manager.setPosition(POSITION_ID, REFERRER, true);
        splitter.distribute(address(token), REFERRER, 100 ether);
        require(token.balanceOf(REFERRER) == 0, "legacy reward");
        require(token.balanceOf(TREASURY) == 100 ether, "treasury");
    }

    function testMissingPositionIsIneligibleWithoutRevertingDistribution() public {
        splitter.distributeForTail(address(token), REFERRER, POSITION_ID, 100 ether);
        require(token.balanceOf(REFERRER) == 0, "missing reward");
        require(token.balanceOf(TREASURY) == 100 ether, "treasury");
    }

    function testCollectedPoolFeesReserveAndSettleExactTailRewardOnce() public {
        MockERC20 other = new MockERC20("Other", "OTHER", 18);
        ProtocolFeePoolMock pool = new ProtocolFeePoolMock(address(token), address(other));
        uint256 tailId = 43;
        manager.setPosition(POSITION_ID, REFERRER, true);
        manager.setTail(tailId, address(pool), REFERRER, POSITION_ID, 100 ether, 0);
        token.approve(address(pool), 100 ether);
        pool.fund(100 ether, 0);

        splitter.collectPoolProtocolFees(address(pool));
        require(token.balanceOf(TREASURY) == 90 ether, "immediate treasury share");
        require(splitter.reservedRewards(address(token)) == 10 ether, "reward reserve");

        splitter.claimTailRewards(tailId);
        require(token.balanceOf(REFERRER) == 10 ether, "caller reward");
        require(splitter.reservedRewards(address(token)) == 0, "reserve consumed");

        splitter.claimTailRewards(tailId);
        require(token.balanceOf(REFERRER) == 10 ether, "double claim");
    }

    function testClosedSourceRedirectsReservedRewardToTreasury() public {
        MockERC20 other = new MockERC20("Other", "OTHER", 18);
        ProtocolFeePoolMock pool = new ProtocolFeePoolMock(address(token), address(other));
        uint256 tailId = 43;
        manager.setPosition(POSITION_ID, REFERRER, false);
        manager.setTail(tailId, address(pool), REFERRER, POSITION_ID, 100 ether, 0);
        token.approve(address(pool), 100 ether);
        pool.fund(100 ether, 0);

        splitter.collectPoolProtocolFees(address(pool));
        splitter.claimTailRewards(tailId);

        require(token.balanceOf(REFERRER) == 0, "closed caller reward");
        require(token.balanceOf(TREASURY) == 100 ether, "full treasury amount");
        require(splitter.reservedRewards(address(token)) == 0, "reserve redirected");
    }

    function testBatchClaimSettlesMultipleTailPositions() public {
        MockERC20 other = new MockERC20("Other", "OTHER", 18);
        ProtocolFeePoolMock pool = new ProtocolFeePoolMock(address(token), address(other));
        manager.setPosition(POSITION_ID, REFERRER, true);
        manager.setTail(43, address(pool), REFERRER, POSITION_ID, 50 ether, 0);
        manager.setTail(44, address(pool), REFERRER, POSITION_ID, 50 ether, 0);
        token.approve(address(pool), 100 ether);
        pool.fund(100 ether, 0);

        uint256[] memory tailIds = new uint256[](2);
        tailIds[0] = 43;
        tailIds[1] = 44;
        splitter.claimTailRewardsBatch(tailIds);

        require(token.balanceOf(REFERRER) == 10 ether, "batched caller reward");
        require(token.balanceOf(TREASURY) == 90 ether, "batched treasury share");
        require(splitter.reservedRewards(address(token)) == 0, "batch reserve consumed");
    }
}
