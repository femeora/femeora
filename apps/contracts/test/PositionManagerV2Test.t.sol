// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DlmmPoolV2 } from "../src/core/DlmmPoolV2.sol";
import { DammPool } from "../src/core/DammPool.sol";
import { PoolRegistry } from "../src/core/PoolRegistry.sol";
import { PoolKey, PoolKeyLib, PoolModel } from "../src/core/PoolTypes.sol";
import { IPositionManagerV2 } from "../src/interfaces/IPositionManagerV2.sol";
import { PositionManagerV2 } from "../src/liquidity/PositionManagerV2.sol";
import { DlmmLens } from "../src/periphery/DlmmLens.sol";
import { ERC1967Proxy } from "../src/proxy/ERC1967Proxy.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

interface VmTest {
    function warp(uint256 timestamp) external;
}

contract PositionManagerV2Test {
    VmTest private constant vm = VmTest(address(uint160(uint256(keccak256("hevm cheat code")))));
    PoolRegistry private registry;
    PositionManagerV2 private manager;
    DlmmPoolV2 private pool;
    MockERC20 private token0;
    MockERC20 private token1;

    function setUp() public {
        MockERC20 a = new MockERC20("Token A", "A", 18);
        MockERC20 b = new MockERC20("USDG", "USDG", 18);
        PoolKey memory key = PoolKeyLib.normalize(address(a), address(b), PoolModel.DLMM, 3_000, 10);
        token0 = MockERC20(key.token0);
        token1 = MockERC20(key.token1);

        PoolRegistry implementation = new PoolRegistry();
        registry = PoolRegistry(address(new ERC1967Proxy(
            address(implementation), abi.encodeCall(PoolRegistry.initialize, (address(this), address(this), address(this)))
        )));
        pool = new DlmmPoolV2(key, address(this), 0);
        registry.registerPool(PoolKeyLib.id(key), address(pool), key);

        PositionManagerV2 managerImplementation = new PositionManagerV2();
        manager = PositionManagerV2(address(new ERC1967Proxy(
            address(managerImplementation), abi.encodeCall(PositionManagerV2.initialize, (address(this), address(this), registry))
        )));
        token0.mint(address(this), 100 ether);
        token1.mint(address(this), 100 ether);
        token0.approve(address(manager), type(uint256).max);
        token1.approve(address(manager), type(uint256).max);
    }

    function testCreatesThirtySixBinQuoteOnlyBidAskInOneCall() public {
        IPositionManagerV2.CreateParams memory p = _params(false, keccak256("quote-callout"));
        uint256 id = manager.createRangePosition(p);
        require(manager.ownerOf(id) == address(this), "owner");
        require(manager.positionBins(id).length == 36, "bin count");
        require(manager.binShares(id, -36) != 0 && manager.binShares(id, -1) != 0, "shares");
        (,,,, bytes32 tag,, bool open) = manager.positions(id);
        require(tag == keccak256("quote-callout") && open, "metadata");
    }

    function testCreatesThirtySixBinTokenOnlyBidAskInOneCall() public {
        IPositionManagerV2.CreateParams memory p = _params(true, keccak256("token-callout"));
        uint256 id = manager.createRangePosition(p);
        require(manager.positionBins(id).length == 36, "bin count");
        require(manager.binShares(id, 1) != 0 && manager.binShares(id, 36) != 0, "shares");
    }

    function testLensReturnsPerBinPositionValue() public {
        uint256 id = manager.createRangePosition(_params(false, bytes32(0)));
        DlmmLens lens = new DlmmLens();
        (address poolAddress, uint256 amount0, uint256 amount1, DlmmLens.PositionBinValue[] memory values) =
            lens.positionValue(manager, id);
        require(poolAddress == address(pool), "pool");
        require(amount0 == 0 && amount1 != 0, "single side value");
        require(values.length == 36 && values[0].amount1 != 0, "per-bin values");
    }

    function testPositionIsTransferableERC721() public {
        uint256 id = manager.createRangePosition(_params(false, bytes32(0)));
        address recipient = address(0xBEEF);
        manager.transferFrom(address(this), recipient, id);
        require(manager.ownerOf(id) == recipient, "new owner");
        require(manager.balanceOf(address(this)) == 0 && manager.balanceOf(recipient) == 1, "balances");
    }

    function testCloseBurnsNftAndReturnsLiquidity() public {
        uint256 beforeBalance = token1.balanceOf(address(this));
        uint256 id = manager.createRangePosition(_params(false, bytes32(0)));
        manager.closeRange(id, 0, 0, address(this), block.timestamp + 1);
        require(token1.balanceOf(address(this)) > beforeBalance - 36 ether, "liquidity returned");
        (,,,,,, bool open) = manager.positions(id);
        require(!open && manager.balanceOf(address(this)) == 0, "closed");
        (bool success,) = address(manager).call(abi.encodeCall(PositionManagerV2.ownerOf, (id)));
        require(!success, "burned");
    }

    function testRejectsSelfReferrer() public {
        IPositionManagerV2.CreateParams memory p = _params(false, bytes32(0));
        p.referrer = address(this);
        (bool success,) = address(manager).call(
            abi.encodeCall(PositionManagerV2.createRangePosition, (p))
        );
        require(!success, "self referrer accepted");
    }

    function testDlmmExactOutputCrossesBinsWithBoundedInput() public {
        manager.createRangePosition(_params(false, bytes32(0)));
        token0.approve(address(pool), type(uint256).max);
        uint256 beforeInput = token0.balanceOf(address(this));
        uint256 beforeOutput = token1.balanceOf(address(this));
        (uint256 amountIn, uint16 crossed) = pool.swapExactOutput(
            true, 2 ether, 3 ether, 4, address(this), block.timestamp + 1
        );
        require(amountIn <= 3 ether && crossed >= 2, "execution bounds");
        require(beforeInput - token0.balanceOf(address(this)) == amountIn, "exact input");
        require(token1.balanceOf(address(this)) - beforeOutput == 2 ether, "exact output");
    }

    function testDlmmExactOutputRevertsWhenMaximumInputTooLow() public {
        manager.createRangePosition(_params(false, bytes32(0)));
        token0.approve(address(pool), type(uint256).max);
        uint256 beforeInput = token0.balanceOf(address(this));
        (bool success,) = address(pool).call(abi.encodeCall(
            DlmmPoolV2.swapExactOutput,
            (true, 2 ether, 1, uint16(4), address(this), block.timestamp + 1)
        ));
        require(!success && token0.balanceOf(address(this)) == beforeInput, "atomic slippage");
    }

    function testDynamicFeeAccumulatesAndDecaysWithinCap() public {
        manager.createRangePosition(_params(false, bytes32(0)));
        token0.approve(address(pool), type(uint256).max);
        require(pool.currentFeePips() == 3_000, "base fee");
        pool.swapExactOutput(true, 2 ether, 3 ether, 4, address(this), block.timestamp + 1);
        uint24 elevated = pool.currentFeePips();
        require(elevated > 3_000 && elevated <= pool.MAX_TOTAL_FEE_PIPS(), "dynamic bounds");
        vm.warp(block.timestamp + pool.VOLATILITY_DECAY_PERIOD());
        require(pool.currentFeePips() == 3_000, "fee decay");
    }

    function testDammPositionCarriesTagReferrerAndCloses() public {
        PoolKey memory key = PoolKeyLib.normalize(
            address(token0), address(token1), PoolModel.DAMM, 3_000, 0
        );
        DammPool damm = new DammPool(key, address(this));
        registry.registerPool(PoolKeyLib.id(key), address(damm), key);
        IPositionManagerV2.CreateDammParams memory p = IPositionManagerV2.CreateDammParams({
            pool: address(damm),
            amountX: 10 ether,
            amountY: 10 ether,
            minShares: 0,
            tag: keccak256("damm-callout"),
            referrer: address(0xCA11),
            deadline: block.timestamp + 1
        });
        uint256 id = manager.createDammPosition(p);
        require(manager.ownerOf(id) == address(this) && manager.dammShares(id) != 0, "damm nft");
        (,,,, bytes32 tag, address referrer, bool open) = manager.positions(id);
        require(tag == p.tag && referrer == p.referrer && open, "damm metadata");
        manager.closeDamm(id, 0, 0, address(this), block.timestamp + 1);
        require(manager.dammShares(id) == 0 && manager.balanceOf(address(this)) == 0, "damm close");
    }

    function _params(bool above, bytes32 tag)
        private view returns (IPositionManagerV2.CreateParams memory p)
    {
        p.pool = address(pool);
        p.shape = uint8(IPositionManagerV2.Shape.BidAsk);
        p.tag = tag;
        p.expectedActiveBin = 0;
        p.deadline = block.timestamp + 1;
        p.bins = new int24[](36);
        p.amountsX = new uint256[](36);
        p.amountsY = new uint256[](36);
        p.minShares = new uint256[](36);
        for (uint256 i; i < 36; ++i) {
            p.bins[i] = above ? int24(int256(i + 1)) : int24(int256(i) - 36);
            if (above) p.amountsX[i] = 1 ether;
            else p.amountsY[i] = 1 ether;
        }
    }
}
