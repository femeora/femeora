// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface SwapMigrationScheduleVm {
    function envString(string calldata name) external view returns (string memory);
    function envBool(string calldata name) external view returns (bool);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonBytes(string calldata json, string calldata key) external pure returns (bytes memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value) external returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value) external returns (string memory);
    function serializeBytes32(string calldata objectKey, string calldata valueKey, bytes32 value) external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value) external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value) external returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Produces five ordered Safe -> timelock operations without scheduling or executing them.
contract PrepareSwapMigrationSchedule {
    SwapMigrationScheduleVm private constant vm = SwapMigrationScheduleVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant DELAY = 5 minutes;

    function run() external returns (string memory json) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        string memory root = vm.projectRoot();
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        string memory migration = vm.readFile(string.concat(root, "/deployments/", network, "-swap-migration.json"));
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelockAddress = vm.parseJsonAddress(governance, ".protocolTimelock");
        ProtocolTimelock timelock = ProtocolTimelock(payable(timelockAddress));
        require(timelock.proposer() == safe && timelock.minDelay() == DELAY, "governance mismatch");

        address registry = vm.parseJsonAddress(migration, ".poolRegistry");
        address factory = vm.parseJsonAddress(migration, ".poolFactory");
        address legacyPool = vm.parseJsonAddress(migration, ".legacyPool");
        bytes32 upgraderRole = ProtocolAccess(factory).UPGRADER_ROLE();
        bytes32 adminRole = ProtocolAccess(factory).DEFAULT_ADMIN_ROLE();
        require(ProtocolAccess(registry).hasRole(upgraderRole, timelockAddress), "registry upgrader missing");
        require(ProtocolAccess(factory).hasRole(upgraderRole, timelockAddress), "factory upgrader missing");
        require(ProtocolAccess(factory).hasRole(adminRole, timelockAddress), "factory admin missing");

        string memory key = "swapMigrationSchedule";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelockAddress);
        vm.serializeUint(key, "minimumDelaySeconds", DELAY);
        json = _operation(key, "01RegistryUpgrade", timelock, registry, vm.parseJsonBytes(migration, ".poolRegistryUpgradeCalldata"), 1);
        json = _operation(key, "02FactoryUpgrade", timelock, factory, vm.parseJsonBytes(migration, ".poolFactoryUpgradeCalldata"), 2);
        json = _operation(key, "03ActivateDeployer", timelock, factory, vm.parseJsonBytes(migration, ".activatePoolDeployerCalldata"), 3);
        json = _operation(key, "04PauseLegacyPool", timelock, legacyPool, vm.parseJsonBytes(migration, ".pauseLegacyPoolCalldata"), 4);
        json = _operation(key, "05ReplaceCanonicalPool", timelock, factory, vm.parseJsonBytes(migration, ".replacePoolCalldata"), 5);
        if (vm.envBool("WRITE_SWAP_MIGRATION_SCHEDULE")) {
            vm.writeJson(json, string.concat(root, "/deployments/", network, "-swap-migration-schedule.json"));
        }
    }

    function _operation(string memory key, string memory prefix, ProtocolTimelock timelock, address target, bytes memory data, uint256 index) private returns (string memory json) {
        bytes32 salt = keccak256(abi.encode("FOMEORA_SWAP_DECIMALS_V2", block.chainid, index, target, keccak256(data)));
        bytes32 id = timelock.operationId(target, 0, data, salt);
        vm.serializeAddress(key, string.concat(prefix, "Target"), target);
        vm.serializeBytes32(key, string.concat(prefix, "Salt"), salt);
        vm.serializeBytes32(key, string.concat(prefix, "OperationId"), id);
        vm.serializeBytes(key, string.concat(prefix, "ScheduleCalldata"), abi.encodeCall(ProtocolTimelock.schedule, (target, 0, data, salt, DELAY)));
        json = vm.serializeBytes(key, string.concat(prefix, "ExecuteCalldata"), abi.encodeCall(ProtocolTimelock.execute, (target, 0, data, salt)));
    }
}
