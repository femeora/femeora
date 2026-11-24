// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";

interface SwapMigrationVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function envBool(string calldata name) external view returns (bool);
    function addr(uint256 privateKey) external view returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function parseJsonInt(string calldata json, string calldata key) external pure returns (int256);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value) external returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value) external returns (string memory);
    function serializeInt(string calldata objectKey, string calldata valueKey, int256 value) external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value) external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value) external returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Deploys migration implementations only and writes governance calldata; it never upgrades or pauses a live pool.
contract PrepareSwapMigration {
    SwapMigrationVm private constant vm = SwapMigrationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (PoolRegistry registryImplementation, PoolFactory factoryImplementation, DlmmPoolV2Deployer deployer) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.envAddress("DEPLOYER_ADDRESS");
        require(privateKey != 0 && vm.addr(privateKey) == deployerAddress, "deployer mismatch");

        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/", network, ".json"));
        string memory initialPool = vm.readFile(string.concat(root, "/deployments/", network, "-initial-pool.json"));
        address registryProxy = vm.parseJsonAddress(deployment, ".poolRegistry");
        address factoryProxy = vm.parseJsonAddress(deployment, ".poolFactory");
        address legacyPool = vm.parseJsonAddress(initialPool, ".pool");
        address baseToken = vm.parseJsonAddress(initialPool, ".baseToken");
        address quoteToken = vm.parseJsonAddress(initialPool, ".quoteToken");
        uint256 feePips = vm.parseJsonUint(initialPool, ".feePips");
        uint256 binStepBps = vm.parseJsonUint(initialPool, ".binStepBps");
        int256 initialActiveBin = vm.parseJsonInt(initialPool, ".initialActiveBin");
        require(registryProxy.code.length != 0 && factoryProxy.code.length != 0 && legacyPool.code.length != 0, "deployment missing");
        require(baseToken.code.length != 0 && quoteToken.code.length != 0, "token missing");
        require(feePips > 0 && feePips < 1_000_000 && binStepBps > 0 && binStepBps <= 1_000, "pool config invalid");
        require(initialActiveBin >= -10_000 && initialActiveBin <= 10_000, "active bin invalid");
        require(!DlmmPoolV2(legacyPool).paused(), "legacy already paused");

        vm.startBroadcast(privateKey);
        registryImplementation = new PoolRegistry();
        factoryImplementation = new PoolFactory();
        deployer = new DlmmPoolV2Deployer(factoryProxy);
        vm.stopBroadcast();

        bytes memory registryUpgrade = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(registryImplementation), bytes(""));
        bytes memory factoryUpgrade = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(factoryImplementation), bytes(""));
        bytes memory activateDeployer = abi.encodeCall(PoolFactory.setPoolDeployers, (PoolFactory(factoryProxy).dammDeployer(), deployer));
        bytes memory pauseLegacy = abi.encodeCall(DlmmPoolV2.setPaused, (true));
        bytes memory replacePool = abi.encodeCall(PoolFactory.replaceDlmmPool, (legacyPool, baseToken, quoteToken, uint24(feePips), uint16(binStepBps), int24(initialActiveBin)));
        PoolKey memory poolKey = PoolKeyLib.normalize(baseToken, quoteToken, PoolModel.DLMM, uint24(feePips), uint16(binStepBps));
        address predictedReplacement = deployer.predict(poolKey, factoryProxy, int24(initialActiveBin));

        string memory key = "swapMigration";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "poolRegistry", registryProxy);
        vm.serializeAddress(key, "poolRegistryImplementation", address(registryImplementation));
        vm.serializeBytes(key, "poolRegistryUpgradeCalldata", registryUpgrade);
        vm.serializeAddress(key, "poolFactory", factoryProxy);
        vm.serializeAddress(key, "poolFactoryImplementation", address(factoryImplementation));
        vm.serializeBytes(key, "poolFactoryUpgradeCalldata", factoryUpgrade);
        vm.serializeAddress(key, "dlmmPoolV2Deployer", address(deployer));
        vm.serializeAddress(key, "predictedReplacementPool", predictedReplacement);
        vm.serializeBytes(key, "activatePoolDeployerCalldata", activateDeployer);
        vm.serializeAddress(key, "legacyPool", legacyPool);
        vm.serializeBytes(key, "pauseLegacyPoolCalldata", pauseLegacy);
        vm.serializeAddress(key, "baseToken", baseToken);
        vm.serializeAddress(key, "quoteToken", quoteToken);
        vm.serializeUint(key, "feePips", feePips);
        vm.serializeUint(key, "binStepBps", binStepBps);
        vm.serializeInt(key, "initialActiveBin", initialActiveBin);
        string memory json = vm.serializeBytes(key, "replacePoolCalldata", replacePool);
        if (vm.envBool("WRITE_SWAP_MIGRATION_MANIFEST")) {
            vm.writeJson(json, string.concat(root, "/deployments/", network, "-swap-migration.json"));
        }
    }
}
