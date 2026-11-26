// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";

interface TailFeeScheduleVm {
    function envBool(string calldata name) external view returns (bool);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonBytes(string calldata json, string calldata key) external pure returns (bytes memory);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value) external returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value) external returns (string memory);
    function serializeBytes32(string calldata objectKey, string calldata valueKey, bytes32 value) external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value) external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value) external returns (string memory);
    function toString(uint256 value) external pure returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Produces ordered Safe -> 5 minute timelock operations. It never schedules or executes them.
contract PrepareTailFeeMigrationSchedule {
    TailFeeScheduleVm private constant vm =
        TailFeeScheduleVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant DELAY = 5 minutes;

    function run() external returns (string memory json) {
        require(block.chainid == 4_663, "mainnet only");
        require(vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");
        require(vm.envBool("TAIL_FEE_GOVERNANCE_APPROVED"), "tail fee governance locked");

        string memory root = vm.projectRoot();
        string memory governance = vm.readFile(string.concat(root, "/deployments/mainnet-governance.json"));
        string memory migration = vm.readFile(string.concat(root, "/deployments/mainnet-tail-fee-migration.json"));
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelockAddress = vm.parseJsonAddress(governance, ".protocolTimelock");
        ProtocolTimelock timelock = ProtocolTimelock(payable(timelockAddress));
        require(timelock.proposer() == safe && timelock.minDelay() == DELAY, "governance mismatch");

        address factory = vm.parseJsonAddress(migration, ".poolFactory");
        address manager = vm.parseJsonAddress(migration, ".positionManagerV2");
        address splitter = vm.parseJsonAddress(migration, ".feeSplitter");
        bytes32 upgraderRole = ProtocolAccess(factory).UPGRADER_ROLE();
        bytes32 adminRole = ProtocolAccess(factory).DEFAULT_ADMIN_ROLE();
        require(ProtocolAccess(factory).hasRole(upgraderRole, timelockAddress), "factory upgrader missing");
        require(ProtocolAccess(factory).hasRole(adminRole, timelockAddress), "factory admin missing");
        require(ProtocolAccess(manager).hasRole(upgraderRole, timelockAddress), "manager upgrader missing");
        require(ProtocolAccess(splitter).hasRole(upgraderRole, timelockAddress), "splitter upgrader missing");
        require(ProtocolAccess(splitter).hasRole(adminRole, timelockAddress), "splitter admin missing");

        string memory key = "tailFeeMigrationSchedule";
        vm.serializeString(key, "network", "mainnet");
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelockAddress);
        vm.serializeUint(key, "minimumDelaySeconds", DELAY);

        uint256 index = 1;
        json = _operation(key, "01FactoryUpgrade", timelock, factory, vm.parseJsonBytes(migration, ".poolFactoryUpgradeCalldata"), index++);
        json = _operation(key, "02PositionManagerUpgrade", timelock, manager, vm.parseJsonBytes(migration, ".positionManagerUpgradeCalldata"), index++);
        json = _operation(key, "03FeeSplitterUpgrade", timelock, splitter, vm.parseJsonBytes(migration, ".feeSplitterUpgradeCalldata"), index++);
        json = _operation(key, "04SetPositionManager", timelock, splitter, vm.parseJsonBytes(migration, ".setPositionManagerCalldata"), index++);
        json = _operation(key, "05RouteFutureProtocolFees", timelock, factory, vm.parseJsonBytes(migration, ".routeFutureProtocolFeesCalldata"), index++);
        json = _operation(key, "06ActivateDlmmDeployer", timelock, factory, vm.parseJsonBytes(migration, ".activatePoolDeployerCalldata"), index++);

        uint256 poolCount = vm.parseJsonUint(migration, ".poolCount");
        require(poolCount != 0 && poolCount <= 16, "pool count invalid");
        for (uint256 i; i < poolCount; ++i) {
            string memory poolPrefix = string.concat("pool", vm.toString(i));
            address expectedPool = vm.parseJsonAddress(migration, string.concat(".", poolPrefix, "Expected"));
            require(DlmmPoolV2(expectedPool).administrator() == timelockAddress, "pool admin mismatch");
            string memory number = vm.toString(i + 1);
            json = _operation(
                key,
                string.concat("07Pool", number, "Pause"),
                timelock,
                expectedPool,
                vm.parseJsonBytes(migration, string.concat(".", poolPrefix, "PauseCalldata")),
                index++
            );
            json = _operation(
                key,
                string.concat("08Pool", number, "Replace"),
                timelock,
                factory,
                vm.parseJsonBytes(migration, string.concat(".", poolPrefix, "ReplaceCalldata")),
                index++
            );
        }
        json = _operation(
            key,
            "99EnableTailReward",
            timelock,
            splitter,
            vm.parseJsonBytes(migration, ".enableTailRewardCalldata"),
            index
        );
        json = vm.serializeUint(key, "operationCount", index);
        if (vm.envBool("WRITE_TAIL_FEE_MIGRATION_SCHEDULE")) {
            vm.writeJson(json, string.concat(root, "/deployments/mainnet-tail-fee-migration-schedule.json"));
        }
    }

    function _operation(
        string memory key,
        string memory prefix,
        ProtocolTimelock timelock,
        address target,
        bytes memory data,
        uint256 index
    ) private returns (string memory json) {
        bytes32 salt = keccak256(abi.encode("FEMEORA_TAIL_FEE_V1", block.chainid, index, target, keccak256(data)));
        bytes32 id = timelock.operationId(target, 0, data, salt);
        vm.serializeAddress(key, string.concat(prefix, "Target"), target);
        vm.serializeBytes32(key, string.concat(prefix, "Salt"), salt);
        vm.serializeBytes32(key, string.concat(prefix, "OperationId"), id);
        vm.serializeBytes(
            key,
            string.concat(prefix, "ScheduleCalldata"),
            abi.encodeCall(ProtocolTimelock.schedule, (target, 0, data, salt, DELAY))
        );
        json = vm.serializeBytes(
            key,
            string.concat(prefix, "ExecuteCalldata"),
            abi.encodeCall(ProtocolTimelock.execute, (target, 0, data, salt))
        );
    }
}
