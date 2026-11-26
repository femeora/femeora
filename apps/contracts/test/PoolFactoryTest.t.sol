// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DammPool} from "../src/core/DammPool.sol";
import {DammPoolDeployer} from "../src/core/DammPoolDeployer.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";
import {ERC1967Proxy} from "../src/proxy/ERC1967Proxy.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PoolFactoryTest {
    PoolFactory private factory;
    PoolRegistry private registry;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    address private constant TREASURY = address(0xCAFE);

    function setUp() public {
        tokenA = new MockERC20("Token A", "A", 18);
        tokenB = new MockERC20("Token B", "B", 18);
        PoolRegistry registryImplementation = new PoolRegistry();
        registry = PoolRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImplementation),
                    abi.encodeCall(PoolRegistry.initialize, (address(this), address(this), address(this)))
                )
            )
        );
        PoolFactory factoryImplementation = new PoolFactory();
        factory = PoolFactory(address(new ERC1967Proxy(address(factoryImplementation), "")));
        DammPoolDeployer dammDeployer = new DammPoolDeployer(address(factory));
        DlmmPoolV2Deployer dlmmDeployer = new DlmmPoolV2Deployer(address(factory));
        factory.initialize(address(this), address(this), registry, TREASURY, 100_000, dammDeployer, dlmmDeployer);
        factory.setTokenReserveCap(address(tokenA), 1_000_000 ether);
        factory.setTokenReserveCap(address(tokenB), 2_000_000 ether);
        registry.setRole(registry.FACTORY_ROLE(), address(factory), true);
    }

    function testDlmmPoolGovernanceCannotBeCapturedByPermissionlessCreator() public {
        address poolAddress = factory.createDlmmPool(address(tokenA), address(tokenB), 3_000, 10, 0);
        DlmmPoolV2 pool = DlmmPoolV2(poolAddress);
        require(pool.administrator() == address(this), "administrator");
        require(pool.protocolFeeRecipient() == TREASURY, "treasury");
        require(pool.protocolFeeSharePips() == 100_000, "fee share");
        require(pool.reserveCap0() != 0 && pool.reserveCap1() != 0, "reserve caps");
        PoolKey memory key = PoolKeyLib.normalize(address(tokenA), address(tokenB), PoolModel.DLMM, 3_000, 10);
        require(registry.poolById(PoolKeyLib.id(key)) == poolAddress, "registry");
        require(factory.predictDlmmPoolAddress(key, address(factory), 0) == poolAddress, "prediction");
    }

    function testDammPoolReceivesProtocolGovernance() public {
        address poolAddress = factory.createPool(address(tokenA), address(tokenB), PoolModel.DAMM, 3_000, 0);
        DammPool pool = DammPool(poolAddress);
        require(pool.administrator() == address(this), "administrator");
        require(pool.protocolFeeRecipient() == TREASURY, "treasury");
        require(pool.protocolFeeSharePips() == 100_000, "fee share");
        require(pool.reserveCap0() != 0 && pool.reserveCap1() != 0, "reserve caps");
    }

    function testPoolCreationRequiresBothTokenReserveCaps() public {
        MockERC20 tokenC = new MockERC20("Token C", "C", 18);
        (bool ok,) = address(factory)
            .call(abi.encodeCall(PoolFactory.createDlmmPool, (address(tokenA), address(tokenC), 3_000, 10, int24(0))));
        require(!ok, "missing token cap accepted");
    }

    function testGovernanceCanReplacePoolDeployersBeforeLaunch() public {
        DammPoolDeployer nextDamm = new DammPoolDeployer(address(factory));
        DlmmPoolV2Deployer nextDlmm = new DlmmPoolV2Deployer(address(factory));
        factory.setPoolDeployers(nextDamm, nextDlmm);
        require(address(factory.dammDeployer()) == address(nextDamm), "damm deployer");
        require(address(factory.dlmmDeployer()) == address(nextDlmm), "dlmm deployer");
    }

    function testGovernanceCanReplaceCanonicalDlmmWithoutOrphaningLegacyPositions() public {
        address previousPool = factory.createDlmmPool(address(tokenA), address(tokenB), 3_000, 10, 0);
        PoolKey memory key = PoolKeyLib.normalize(address(tokenA), address(tokenB), PoolModel.DLMM, 3_000, 10);

        (bool unpausedSuccess,) = address(factory).call(
            abi.encodeCall(
                PoolFactory.replaceDlmmPool,
                (previousPool, address(tokenA), address(tokenB), uint24(3_000), uint16(10), int24(0))
            )
        );
        require(!unpausedSuccess, "unpaused legacy pool replaced");

        DlmmPoolV2(previousPool).setPaused(true);
        DlmmPoolV2Deployer correctedDeployer = new DlmmPoolV2Deployer(address(factory));
        factory.setPoolDeployers(factory.dammDeployer(), correctedDeployer);
        address replacement = factory.replaceDlmmPool(
            previousPool, address(tokenA), address(tokenB), 3_000, 10, 0
        );

        require(replacement != previousPool, "replacement address unchanged");
        require(registry.poolById(PoolKeyLib.id(key)) == replacement, "replacement not canonical");
        require(registry.isRegisteredPool(previousPool), "legacy positions orphaned");
        require(registry.isRegisteredPool(replacement), "replacement not registered");
        require(DlmmPoolV2(replacement).swapMathVersion() == 2, "incorrect swap math");
        require(DlmmPoolV2(replacement).administrator() == address(this), "replacement administrator");
        require(DlmmPoolV2(replacement).protocolFeeRecipient() == TREASURY, "replacement treasury");
    }

    function testReplacementReadsFinalActiveBinAtExecution() public {
        int24 liveActiveBin = 37;
        address previousPool =
            factory.createDlmmPool(address(tokenA), address(tokenB), 3_000, 10, liveActiveBin);
        DlmmPoolV2(previousPool).setPaused(true);
        factory.setPoolDeployers(factory.dammDeployer(), new DlmmPoolV2Deployer(address(factory)));

        address replacement = factory.replaceDlmmPoolAtCurrentBin(
            previousPool, address(tokenA), address(tokenB), 3_000, 10
        );

        require(DlmmPoolV2(replacement).activeBin() == liveActiveBin, "stale replacement price");
    }
}
