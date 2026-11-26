// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeSplitter} from "../src/fees/FeeSplitter.sol";
import {PositionManagerV2} from "../src/liquidity/PositionManagerV2.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";

interface TailFeeMigrationVm {
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
    function parseJsonAddressArray(string calldata json, string calldata key) external pure returns (address[] memory);
    function parseJsonUintArray(string calldata json, string calldata key) external pure returns (uint256[] memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value) external returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value) external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value) external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value) external returns (string memory);
    function toString(uint256 value) external pure returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Deploys implementations/helpers only and writes governance calldata.
/// It never upgrades a proxy, pauses a pool, changes a fee recipient or enables rewards.
contract PrepareTailFeeMigration {
    TailFeeMigrationVm private constant vm =
        TailFeeMigrationVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint16 private constant INITIAL_TAIL_REWARD_BPS = 1_000;

    function run()
        external
        returns (
            PoolFactory factoryImplementation,
            PositionManagerV2 positionManagerImplementation,
            FeeSplitter feeSplitterImplementation,
            DlmmPoolV2Deployer dlmmDeployer
        )
    {
        string memory network = vm.envString("APP_NETWORK");
        require(keccak256(bytes(network)) == keccak256("mainnet"), "mainnet only");
        require(block.chainid == 4_663, "chain mismatch");
        require(vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");
        require(vm.envBool("TAIL_FEE_DEPLOYMENT_APPROVED"), "tail fee deployment locked");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.envAddress("DEPLOYER_ADDRESS");
        require(privateKey != 0 && vm.addr(privateKey) == deployerAddress, "deployer mismatch");

        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/mainnet.json"));
        string memory input = vm.readFile(string.concat(root, "/deployments/mainnet-tail-fee-input.json"));
        address factoryProxy = vm.parseJsonAddress(deployment, ".poolFactory");
        address registryProxy = vm.parseJsonAddress(deployment, ".poolRegistry");
        address positionManagerProxy = vm.parseJsonAddress(deployment, ".positionManagerV2");
        address feeSplitterProxy = vm.parseJsonAddress(deployment, ".feeSplitter");
        require(
            factoryProxy.code.length != 0 && registryProxy.code.length != 0
                && positionManagerProxy.code.length != 0 && feeSplitterProxy.code.length != 0,
            "deployment missing"
        );

        address[] memory expectedPools = vm.parseJsonAddressArray(input, ".expectedPools");
        address[] memory tokenA = vm.parseJsonAddressArray(input, ".tokenA");
        address[] memory tokenB = vm.parseJsonAddressArray(input, ".tokenB");
        uint256[] memory feePips = vm.parseJsonUintArray(input, ".feePips");
        uint256[] memory binStepBps = vm.parseJsonUintArray(input, ".binStepBps");
        uint256 count = expectedPools.length;
        require(
            count != 0 && count == tokenA.length && count == tokenB.length && count == feePips.length
                && count == binStepBps.length,
            "input length mismatch"
        );
        for (uint256 i; i < count; ++i) {
            PoolKey memory key = PoolKeyLib.normalize(
                tokenA[i], tokenB[i], PoolModel.DLMM, uint24(feePips[i]), uint16(binStepBps[i])
            );
            require(PoolRegistry(registryProxy).poolById(PoolKeyLib.id(key)) == expectedPools[i], "canonical mismatch");
            require(!DlmmPoolV2(expectedPools[i]).paused(), "canonical pool paused");
        }

        vm.startBroadcast(privateKey);
        factoryImplementation = new PoolFactory();
        positionManagerImplementation = new PositionManagerV2();
        feeSplitterImplementation = new FeeSplitter();
        dlmmDeployer = new DlmmPoolV2Deployer(factoryProxy);
        vm.stopBroadcast();

        string memory keyName = "tailFeeMigration";
        vm.serializeString(keyName, "network", network);
        vm.serializeUint(keyName, "chainId", block.chainid);
        vm.serializeAddress(keyName, "poolFactory", factoryProxy);
        vm.serializeAddress(keyName, "poolFactoryImplementation", address(factoryImplementation));
        vm.serializeBytes(
            keyName,
            "poolFactoryUpgradeCalldata",
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(factoryImplementation), bytes(""))
        );
        vm.serializeAddress(keyName, "positionManagerV2", positionManagerProxy);
        vm.serializeAddress(keyName, "positionManagerV2Implementation", address(positionManagerImplementation));
        vm.serializeBytes(
            keyName,
            "positionManagerUpgradeCalldata",
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(positionManagerImplementation), bytes(""))
        );
        vm.serializeAddress(keyName, "feeSplitter", feeSplitterProxy);
        vm.serializeAddress(keyName, "feeSplitterImplementation", address(feeSplitterImplementation));
        vm.serializeBytes(
            keyName,
            "feeSplitterUpgradeCalldata",
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(feeSplitterImplementation), bytes(""))
        );
        vm.serializeBytes(
            keyName,
            "setPositionManagerCalldata",
            abi.encodeCall(FeeSplitter.setPositionManager, (positionManagerProxy))
        );
        vm.serializeBytes(
            keyName,
            "routeFutureProtocolFeesCalldata",
            abi.encodeCall(
                PoolFactory.setPoolGovernance,
                (
                    PoolFactory(factoryProxy).poolAdministrator(),
                    feeSplitterProxy,
                    PoolFactory(factoryProxy).protocolFeeSharePips()
                )
            )
        );
        vm.serializeAddress(keyName, "dlmmPoolV2Deployer", address(dlmmDeployer));
        vm.serializeBytes(
            keyName,
            "activatePoolDeployerCalldata",
            abi.encodeCall(
                PoolFactory.setPoolDeployers,
                (PoolFactory(factoryProxy).dammDeployer(), dlmmDeployer)
            )
        );
        vm.serializeUint(keyName, "tailRewardBps", INITIAL_TAIL_REWARD_BPS);
        vm.serializeBytes(
            keyName,
            "enableTailRewardCalldata",
            abi.encodeCall(FeeSplitter.setTailRewardBps, (INITIAL_TAIL_REWARD_BPS))
        );
        vm.serializeUint(keyName, "poolCount", count);

        string memory json;
        for (uint256 i; i < count; ++i) {
            string memory prefix = string.concat("pool", vm.toString(i));
            PoolKey memory poolKey = PoolKeyLib.normalize(
                tokenA[i], tokenB[i], PoolModel.DLMM, uint24(feePips[i]), uint16(binStepBps[i])
            );
            int24 activeBin = DlmmPoolV2(expectedPools[i]).activeBin();
            vm.serializeAddress(keyName, string.concat(prefix, "Expected"), expectedPools[i]);
            vm.serializeAddress(keyName, string.concat(prefix, "TokenA"), tokenA[i]);
            vm.serializeAddress(keyName, string.concat(prefix, "TokenB"), tokenB[i]);
            vm.serializeUint(keyName, string.concat(prefix, "FeePips"), feePips[i]);
            vm.serializeUint(keyName, string.concat(prefix, "BinStepBps"), binStepBps[i]);
            vm.serializeBytes(
                keyName,
                string.concat(prefix, "PauseCalldata"),
                abi.encodeCall(DlmmPoolV2.setPaused, (true))
            );
            vm.serializeAddress(
                keyName,
                string.concat(prefix, "PredictedReplacementAtPreparation"),
                dlmmDeployer.predict(poolKey, factoryProxy, activeBin)
            );
            json = vm.serializeBytes(
                keyName,
                string.concat(prefix, "ReplaceCalldata"),
                abi.encodeCall(
                    PoolFactory.replaceDlmmPoolAtCurrentBin,
                    (expectedPools[i], tokenA[i], tokenB[i], uint24(feePips[i]), uint16(binStepBps[i]))
                )
            );
        }
        if (vm.envBool("WRITE_TAIL_FEE_MIGRATION_MANIFEST")) {
            vm.writeJson(json, string.concat(root, "/deployments/mainnet-tail-fee-migration.json"));
        }
    }
}
