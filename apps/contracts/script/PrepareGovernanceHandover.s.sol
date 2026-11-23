// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";

interface GovernanceHandoverVm {
    function envString(string calldata name) external view returns (string memory);
    function envBool(string calldata name) external view returns (bool);
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
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Produces public calldata for the one-time EOA-admin to timelock handover.
/// @dev It never broadcasts. Execute grants first, pool governance next, revocations last.
contract PrepareGovernanceHandover {
    GovernanceHandoverVm private constant vm =
        GovernanceHandoverVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (string memory json) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/", network, ".json"));
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        address oldAdmin = vm.parseJsonAddress(deployment, ".contractAdmin");
        address oldUpgrader = vm.parseJsonAddress(deployment, ".contractUpgrader");
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelock = vm.parseJsonAddress(governance, ".protocolTimelock");
        require(safe != address(0) && timelock.code.length != 0, "invalid governance manifest");
        require(ProtocolTimelock(payable(timelock)).proposer() == safe, "Safe is not proposer");
        require(ProtocolTimelock(payable(timelock)).minDelay() == 5 minutes, "unexpected delay");

        address[5] memory targets = [
            vm.parseJsonAddress(deployment, ".poolRegistry"),
            vm.parseJsonAddress(deployment, ".poolFactory"),
            vm.parseJsonAddress(deployment, ".positionManagerV2"),
            vm.parseJsonAddress(deployment, ".swapRouter"),
            vm.parseJsonAddress(deployment, ".feeSplitter")
        ];
        bytes32 adminRole = ProtocolAccess(targets[0]).DEFAULT_ADMIN_ROLE();
        bytes32 upgraderRole = ProtocolAccess(targets[0]).UPGRADER_ROLE();
        for (uint256 i; i < targets.length; ++i) {
            require(targets[i].code.length != 0, "proxy code missing");
            require(ProtocolAccess(targets[i]).hasRole(adminRole, oldAdmin), "old admin role missing");
            require(ProtocolAccess(targets[i]).hasRole(upgraderRole, oldUpgrader), "old upgrader role missing");
            require(
                oldAdmin == oldUpgrader || !ProtocolAccess(targets[i]).hasRole(adminRole, oldUpgrader),
                "unexpected admin role"
            );
            require(
                oldAdmin == oldUpgrader || !ProtocolAccess(targets[i]).hasRole(upgraderRole, oldAdmin),
                "unexpected upgrader role"
            );
            require(!ProtocolAccess(targets[i]).hasRole(adminRole, timelock), "handover already started");
        }

        bytes memory grantAdmin = abi.encodeCall(ProtocolAccess.setRole, (adminRole, timelock, true));
        bytes memory grantUpgrader = abi.encodeCall(ProtocolAccess.setRole, (upgraderRole, timelock, true));
        bytes memory revokeUpgrader = abi.encodeCall(ProtocolAccess.setRole, (upgraderRole, oldUpgrader, false));
        bytes memory revokeAdmin = abi.encodeCall(ProtocolAccess.setRole, (adminRole, oldAdmin, false));
        PoolFactory factory = PoolFactory(targets[1]);
        bytes memory setPoolGovernance = abi.encodeCall(
            PoolFactory.setPoolGovernance, (timelock, factory.protocolFeeRecipient(), factory.protocolFeeSharePips())
        );

        string memory key = "handover";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelock);
        vm.serializeAddress(key, "oldAdmin", oldAdmin);
        vm.serializeAddress(key, "oldUpgrader", oldUpgrader);
        _serializeTarget(key, "poolRegistry", targets[0], grantAdmin, grantUpgrader, revokeUpgrader, revokeAdmin);
        _serializeTarget(key, "poolFactory", targets[1], grantAdmin, grantUpgrader, revokeUpgrader, revokeAdmin);
        _serializeTarget(key, "positionManagerV2", targets[2], grantAdmin, grantUpgrader, revokeUpgrader, revokeAdmin);
        _serializeTarget(key, "swapRouter", targets[3], grantAdmin, grantUpgrader, revokeUpgrader, revokeAdmin);
        _serializeTarget(key, "feeSplitter", targets[4], grantAdmin, grantUpgrader, revokeUpgrader, revokeAdmin);
        json = vm.serializeBytes(key, "poolFactorySetGovernanceCalldata", setPoolGovernance);
        if (vm.envBool("WRITE_HANDOVER_MANIFEST")) {
            vm.writeJson(json, string.concat(root, "/deployments/", network, "-governance-handover.json"));
        }
    }

    function _serializeTarget(
        string memory key,
        string memory prefix,
        address target,
        bytes memory grantAdmin,
        bytes memory grantUpgrader,
        bytes memory revokeUpgrader,
        bytes memory revokeAdmin
    ) private returns (string memory json) {
        vm.serializeAddress(key, string.concat(prefix, "Target"), target);
        vm.serializeBytes(key, string.concat(prefix, "GrantAdminCalldata"), grantAdmin);
        vm.serializeBytes(key, string.concat(prefix, "GrantUpgraderCalldata"), grantUpgrader);
        vm.serializeBytes(key, string.concat(prefix, "RevokeOldUpgraderCalldata"), revokeUpgrader);
        json = vm.serializeBytes(key, string.concat(prefix, "RevokeOldAdminCalldata"), revokeAdmin);
    }
}
