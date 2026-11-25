// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface LaunchScheduleVm {
    function envString(string calldata name) external view returns (string memory);
    function envBool(string calldata name) external view returns (bool);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonBytes(string calldata json, string calldata key) external pure returns (bytes memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value)
        external
        returns (string memory);
    function serializeBytes32(string calldata objectKey, string calldata valueKey, bytes32 value)
        external
        returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external
        returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Converts the deployed Launch manifest into deterministic Safe → timelock operations.
/// @dev This script is read-only on-chain. The Safe owners schedule each operation and anyone may
///      execute it after the five-minute delay.
contract PrepareLaunchSchedule {
    LaunchScheduleVm private constant vm =
        LaunchScheduleVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant DELAY = 5 minutes;

    function run() external returns (string memory json) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");
        require(vm.envBool("WRITE_LAUNCH_SCHEDULE_MANIFEST"), "launch schedule manifest required");

        string memory root = vm.projectRoot();
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        string memory launch = vm.readFile(string.concat(root, "/deployments/", network, "-launch.json"));
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelockAddress = vm.parseJsonAddress(governance, ".protocolTimelock");
        ProtocolTimelock timelock = ProtocolTimelock(payable(timelockAddress));
        require(timelock.proposer() == safe && timelock.minDelay() == DELAY, "governance mismatch");

        address factory = vm.parseJsonAddress(launch, ".poolFactory");
        address manager = vm.parseJsonAddress(launch, ".positionManagerV2");
        address[4] memory targets = [factory, manager, factory, factory];
        bytes[4] memory calls = [
            vm.parseJsonBytes(launch, ".poolFactoryUpgradeCalldata"),
            vm.parseJsonBytes(launch, ".positionManagerUpgradeCalldata"),
            vm.parseJsonBytes(launch, ".activatePoolDeployersCalldata"),
            vm.parseJsonBytes(launch, ".grantGraduatorFactoryRoleCalldata")
        ];

        bytes32 upgraderRole = ProtocolAccess(factory).UPGRADER_ROLE();
        bytes32 adminRole = ProtocolAccess(factory).DEFAULT_ADMIN_ROLE();
        require(ProtocolAccess(factory).hasRole(upgraderRole, timelockAddress), "factory upgrader missing");
        require(ProtocolAccess(manager).hasRole(upgraderRole, timelockAddress), "manager upgrader missing");
        require(ProtocolAccess(factory).hasRole(adminRole, timelockAddress), "factory admin missing");

        string memory key = "launchSchedule";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelockAddress);
        vm.serializeUint(key, "minimumDelaySeconds", DELAY);
        _serializeOperation(key, "01FactoryUpgrade", timelock, targets[0], calls[0], 0);
        _serializeOperation(key, "02PositionManagerUpgrade", timelock, targets[1], calls[1], 1);
        _serializeOperation(key, "03ActivateDeployers", timelock, targets[2], calls[2], 2);
        json = _serializeOperation(key, "04GrantGraduator", timelock, targets[3], calls[3], 3);
        vm.writeJson(json, string.concat(root, "/deployments/", network, "-launch-schedule.json"));
    }

    function _serializeOperation(
        string memory key,
        string memory prefix,
        ProtocolTimelock timelock,
        address target,
        bytes memory data,
        uint256 index
    ) private returns (string memory json) {
        bytes32 salt = keccak256(abi.encode("FEMEORA_LAUNCH_V1", block.chainid, index, target, keccak256(data)));
        bytes32 id = timelock.operationId(target, 0, data, salt);
        bytes memory schedule = abi.encodeCall(ProtocolTimelock.schedule, (target, 0, data, salt, DELAY));
        bytes memory execute = abi.encodeCall(ProtocolTimelock.execute, (target, 0, data, salt));
        vm.serializeAddress(key, string.concat(prefix, "Target"), target);
        vm.serializeBytes32(key, string.concat(prefix, "Salt"), salt);
        vm.serializeBytes32(key, string.concat(prefix, "OperationId"), id);
        vm.serializeBytes(key, string.concat(prefix, "ScheduleCalldata"), schedule);
        json = vm.serializeBytes(key, string.concat(prefix, "ExecuteCalldata"), execute);
    }
}
