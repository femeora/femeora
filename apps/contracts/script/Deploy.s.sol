// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { PoolRegistry } from "../src/core/PoolRegistry.sol";
import { PoolFactory } from "../src/core/PoolFactory.sol";
import { DammPoolDeployer } from "../src/core/DammPoolDeployer.sol";
import { DlmmPoolV2Deployer } from "../src/core/DlmmPoolV2Deployer.sol";
import { PositionManagerV2 } from "../src/liquidity/PositionManagerV2.sol";
import { SwapRouter } from "../src/router/SwapRouter.sol";
import { DlmmLens } from "../src/periphery/DlmmLens.sol";
import { FeeSplitter } from "../src/fees/FeeSplitter.sol";
import { ERC1967Proxy } from "../src/proxy/ERC1967Proxy.sol";

interface Vm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function envBool(string calldata name) external view returns (bool);
    function startBroadcast(uint256 privateKey) external;
    function addr(uint256 privateKey) external view returns (address);
    function stopBroadcast() external;
    function projectRoot() external view returns (string memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value) external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value) external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value) external returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

contract Deploy {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        require(deployerPrivateKey != 0, "invalid deployer key");
        require(vm.addr(deployerPrivateKey) == deployer, "deployer key/address mismatch");
        address admin = vm.envAddress("CONTRACT_ADMIN_ADDRESS");
        address upgrader = vm.envAddress("CONTRACT_UPGRADER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        require(admin != address(0) && upgrader != address(0) && treasury != address(0), "zero governance address");
        uint256 protocolFeeShareRaw = vm.envUint("PROTOCOL_FEE_SHARE_PIPS");
        require(protocolFeeShareRaw <= 1_000_000, "invalid protocol fee share");
        uint24 protocolFeeSharePips = uint24(protocolFeeShareRaw);
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet deployment locked");

        vm.startBroadcast(deployerPrivateKey);

        PoolRegistry registryImplementation = new PoolRegistry();
        PoolRegistry registry = PoolRegistry(address(new ERC1967Proxy(
            address(registryImplementation),
            abi.encodeCall(PoolRegistry.initialize, (deployer, deployer, deployer))
        )));

        PoolFactory factoryImplementation = new PoolFactory();
        PoolFactory factory = PoolFactory(address(new ERC1967Proxy(address(factoryImplementation), "")));
        DammPoolDeployer dammDeployer = new DammPoolDeployer(address(factory));
        DlmmPoolV2Deployer dlmmDeployer = new DlmmPoolV2Deployer(address(factory));
        factory.initialize(
            deployer,
            deployer,
            registry,
            treasury,
            protocolFeeSharePips,
            dammDeployer,
            dlmmDeployer
        );
        factory.setPoolGovernance(admin, treasury, protocolFeeSharePips);
        registry.setRole(registry.FACTORY_ROLE(), address(factory), true);
        registry.setRole(registry.FACTORY_ROLE(), deployer, false);

        PositionManagerV2 positionManagerImplementation = new PositionManagerV2();
        PositionManagerV2 positionManager = PositionManagerV2(address(new ERC1967Proxy(
            address(positionManagerImplementation),
            abi.encodeCall(PositionManagerV2.initialize, (deployer, deployer, registry))
        )));

        SwapRouter routerImplementation = new SwapRouter();
        SwapRouter router = SwapRouter(address(new ERC1967Proxy(
            address(routerImplementation),
            abi.encodeCall(SwapRouter.initialize, (deployer, deployer, registry))
        )));

        FeeSplitter feeSplitterImplementation = new FeeSplitter();
        FeeSplitter feeSplitter = FeeSplitter(address(new ERC1967Proxy(
            address(feeSplitterImplementation),
            abi.encodeCall(FeeSplitter.initialize, (deployer, deployer, treasury))
        )));
        DlmmLens lens = new DlmmLens();

        _handover(registry, admin, upgrader, deployer);
        _handover(factory, admin, upgrader, deployer);
        _handover(positionManager, admin, upgrader, deployer);
        _handover(router, admin, upgrader, deployer);
        _handover(feeSplitter, admin, upgrader, deployer);

        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "contractAdmin", admin);
        vm.serializeAddress(key, "contractUpgrader", upgrader);
        vm.serializeAddress(key, "treasury", treasury);
        vm.serializeUint(key, "protocolFeeSharePips", protocolFeeSharePips);
        vm.serializeAddress(key, "poolRegistry", address(registry));
        vm.serializeAddress(key, "poolRegistryImplementation", address(registryImplementation));
        vm.serializeAddress(key, "poolFactory", address(factory));
        vm.serializeAddress(key, "poolFactoryImplementation", address(factoryImplementation));
        vm.serializeAddress(key, "dammPoolDeployer", address(dammDeployer));
        vm.serializeAddress(key, "dlmmPoolV2Deployer", address(dlmmDeployer));
        vm.serializeAddress(key, "positionManagerV2", address(positionManager));
        vm.serializeAddress(key, "positionManagerV2Implementation", address(positionManagerImplementation));
        vm.serializeAddress(key, "swapRouter", address(router));
        vm.serializeAddress(key, "swapRouterImplementation", address(routerImplementation));
        vm.serializeAddress(key, "feeSplitter", address(feeSplitter));
        vm.serializeAddress(key, "feeSplitterImplementation", address(feeSplitterImplementation));
        string memory json = vm.serializeAddress(key, "dlmmLens", address(lens));
        if (vm.envBool("WRITE_DEPLOYMENT_MANIFEST")) {
            vm.writeJson(
                json, string.concat(vm.projectRoot(), "/deployments/", network, ".json")
            );
        }
    }

    function _handover(PoolRegistry target, address admin, address upgrader, address deployer) private {
        target.setRole(target.DEFAULT_ADMIN_ROLE(), admin, true);
        target.setRole(target.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) target.setRole(target.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) target.setRole(target.DEFAULT_ADMIN_ROLE(), deployer, false);
    }

    function _handover(PoolFactory target, address admin, address upgrader, address deployer) private {
        target.setRole(target.DEFAULT_ADMIN_ROLE(), admin, true);
        target.setRole(target.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) target.setRole(target.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) target.setRole(target.DEFAULT_ADMIN_ROLE(), deployer, false);
    }

    function _handover(PositionManagerV2 target, address admin, address upgrader, address deployer) private {
        target.setRole(target.DEFAULT_ADMIN_ROLE(), admin, true);
        target.setRole(target.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) target.setRole(target.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) target.setRole(target.DEFAULT_ADMIN_ROLE(), deployer, false);
    }

    function _handover(SwapRouter target, address admin, address upgrader, address deployer) private {
        target.setRole(target.DEFAULT_ADMIN_ROLE(), admin, true);
        target.setRole(target.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) target.setRole(target.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) target.setRole(target.DEFAULT_ADMIN_ROLE(), deployer, false);
    }

    function _handover(FeeSplitter target, address admin, address upgrader, address deployer) private {
        target.setRole(target.DEFAULT_ADMIN_ROLE(), admin, true);
        target.setRole(target.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) target.setRole(target.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) target.setRole(target.DEFAULT_ADMIN_ROLE(), deployer, false);
    }
}
