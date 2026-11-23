// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PositionManagerV2} from "../src/liquidity/PositionManagerV2.sol";

interface UpgradePreparationVm {
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
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value)
        external
        returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Deploys the additive accounting implementations without changing any proxy or role.
/// @dev The generated calldata must later be scheduled and executed through ProtocolTimelock.
contract PrepareAccountingUpgrade {
    UpgradePreparationVm private constant vm =
        UpgradePreparationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (
            PoolFactory factoryImplementation,
            PositionManagerV2 positionManagerImplementation,
            DlmmPoolV2Deployer dlmmPoolDeployer
        )
    {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(deployerPrivateKey != 0 && vm.addr(deployerPrivateKey) == deployer, "deployer mismatch");

        string memory deploymentPath = string.concat(vm.projectRoot(), "/deployments/", network, ".json");
        string memory deployment = vm.readFile(deploymentPath);
        address factoryProxy = vm.parseJsonAddress(deployment, ".poolFactory");
        address positionManagerProxy = vm.parseJsonAddress(deployment, ".positionManagerV2");
        address dammPoolDeployer = vm.parseJsonAddress(deployment, ".dammPoolDeployer");
        require(
            factoryProxy.code.length != 0 && positionManagerProxy.code.length != 0 && dammPoolDeployer.code.length != 0,
            "invalid deployment manifest"
        );

        vm.startBroadcast(deployerPrivateKey);
        factoryImplementation = new PoolFactory();
        positionManagerImplementation = new PositionManagerV2();
        dlmmPoolDeployer = new DlmmPoolV2Deployer(factoryProxy);
        vm.stopBroadcast();

        bytes memory factoryUpgrade =
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(factoryImplementation), bytes(""));
        bytes memory positionManagerUpgrade = abi.encodeWithSignature(
            "upgradeToAndCall(address,bytes)", address(positionManagerImplementation), bytes("")
        );
        bytes memory activatePoolDeployer = abi.encodeCall(
            PoolFactory.setPoolDeployers,
            (
                // Preserve the existing DAMM deployer; only DLMM accounting changed.
                // Casts are encoded as addresses by the ABI.
                PoolFactory(factoryProxy).dammDeployer(), dlmmPoolDeployer
            )
        );

        string memory key = "upgrade";
        vm.serializeString(key, "network", network);
        vm.serializeAddress(key, "poolFactory", factoryProxy);
        vm.serializeAddress(key, "poolFactoryImplementation", address(factoryImplementation));
        vm.serializeBytes(key, "poolFactoryUpgradeCalldata", factoryUpgrade);
        vm.serializeAddress(key, "positionManagerV2", positionManagerProxy);
        vm.serializeAddress(key, "positionManagerV2Implementation", address(positionManagerImplementation));
        vm.serializeBytes(key, "positionManagerUpgradeCalldata", positionManagerUpgrade);
        vm.serializeAddress(key, "dammPoolDeployer", dammPoolDeployer);
        vm.serializeAddress(key, "dlmmPoolV2Deployer", address(dlmmPoolDeployer));
        string memory json = vm.serializeBytes(key, "activatePoolDeployerCalldata", activatePoolDeployer);
        if (vm.envBool("WRITE_UPGRADE_MANIFEST")) {
            vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", network, "-accounting-upgrade.json"));
        }
    }
}
