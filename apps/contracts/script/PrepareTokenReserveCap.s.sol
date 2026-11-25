// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface TokenReserveCapVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function envBool(string calldata name) external view returns (bool);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external returns (string memory);
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value)
        external returns (string memory);
    function serializeBytes32(string calldata objectKey, string calldata valueKey, bytes32 value)
        external returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Produces Safe -> timelock schedule/execute calldata for one curated token cap.
/// @dev Preparation only; this script never broadcasts a transaction.
contract PrepareTokenReserveCap {
    TokenReserveCapVm private constant vm =
        TokenReserveCapVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant DELAY = 5 minutes;

    function run() external returns (string memory json) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        address token = vm.envAddress("TOKEN_RESERVE_CAP_ADDRESS");
        uint256 cap = vm.envUint("TOKEN_RESERVE_CAP");
        require(token != address(0) && token.code.length != 0, "token code missing");
        require(cap != 0 && cap <= type(uint112).max, "invalid reserve cap");

        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/", network, ".json"));
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        address factoryAddress = vm.parseJsonAddress(deployment, ".poolFactory");
        address safe = vm.parseJsonAddress(governance, ".governanceSafe");
        address timelockAddress = vm.parseJsonAddress(governance, ".protocolTimelock");
        PoolFactory factory = PoolFactory(factoryAddress);
        ProtocolTimelock timelock = ProtocolTimelock(payable(timelockAddress));
        require(factoryAddress.code.length != 0 && timelockAddress.code.length != 0, "deployment missing");
        require(timelock.proposer() == safe && timelock.minDelay() == DELAY, "governance mismatch");
        require(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), timelockAddress), "factory admin missing");

        bytes memory data = abi.encodeCall(PoolFactory.setTokenReserveCap, (token, cap));
        bytes32 salt = keccak256(abi.encode("FOMEORA_TOKEN_CAP_V1", block.chainid, token, cap));
        bytes32 id = timelock.operationId(factoryAddress, 0, data, salt);
        bytes memory schedule = abi.encodeCall(ProtocolTimelock.schedule, (factoryAddress, 0, data, salt, DELAY));
        bytes memory execute = abi.encodeCall(ProtocolTimelock.execute, (factoryAddress, 0, data, salt));

        string memory key = "tokenReserveCap";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelockAddress);
        vm.serializeAddress(key, "poolFactory", factoryAddress);
        vm.serializeAddress(key, "token", token);
        vm.serializeUint(key, "reserveCap", cap);
        vm.serializeUint(key, "minimumDelaySeconds", DELAY);
        vm.serializeBytes32(key, "operationId", id);
        vm.serializeBytes(key, "scheduleCalldata", schedule);
        json = vm.serializeBytes(key, "executeCalldata", execute);
        if (vm.envBool("WRITE_TOKEN_RESERVE_CAP_MANIFEST")) {
            string memory manifestName = vm.envString("TOKEN_RESERVE_CAP_MANIFEST_NAME");
            vm.writeJson(
                json,
                string.concat(root, "/deployments/", network, "-", manifestName, "-reserve-cap.json")
            );
        }
    }
}
