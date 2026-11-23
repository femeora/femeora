// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";

interface GovernanceVerificationVm {
    function envString(string calldata name) external view returns (string memory);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
}

/// @notice Read-only post-handover assertion script. It never starts a broadcast.
contract VerifyGovernanceHandover {
    GovernanceVerificationVm private constant vm =
        GovernanceVerificationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/", network, ".json"));
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        address oldAdmin = vm.parseJsonAddress(deployment, ".contractAdmin");
        address oldUpgrader = vm.parseJsonAddress(deployment, ".contractUpgrader");
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelock = vm.parseJsonAddress(governance, ".protocolTimelock");
        address[5] memory targets = [
            vm.parseJsonAddress(deployment, ".poolRegistry"),
            vm.parseJsonAddress(deployment, ".poolFactory"),
            vm.parseJsonAddress(deployment, ".positionManagerV2"),
            vm.parseJsonAddress(deployment, ".swapRouter"),
            vm.parseJsonAddress(deployment, ".feeSplitter")
        ];
        bytes32 adminRole = ProtocolAccess(targets[0]).DEFAULT_ADMIN_ROLE();
        bytes32 upgraderRole = ProtocolAccess(targets[0]).UPGRADER_ROLE();
        require(ProtocolTimelock(payable(timelock)).proposer() == safe, "Safe proposer mismatch");
        require(ProtocolTimelock(payable(timelock)).minDelay() == 5 minutes, "delay mismatch");
        for (uint256 i; i < targets.length; ++i) {
            require(ProtocolAccess(targets[i]).hasRole(adminRole, timelock), "timelock admin missing");
            require(ProtocolAccess(targets[i]).hasRole(upgraderRole, timelock), "timelock upgrader missing");
            require(!ProtocolAccess(targets[i]).hasRole(adminRole, oldAdmin), "old admin retained");
            require(!ProtocolAccess(targets[i]).hasRole(upgraderRole, oldUpgrader), "old upgrader retained");
            require(!ProtocolAccess(targets[i]).hasRole(adminRole, oldUpgrader), "old upgrader has admin");
            require(!ProtocolAccess(targets[i]).hasRole(upgraderRole, oldAdmin), "old admin has upgrader");
        }
        require(PoolFactory(targets[1]).poolAdministrator() == timelock, "pool governance mismatch");
    }
}
