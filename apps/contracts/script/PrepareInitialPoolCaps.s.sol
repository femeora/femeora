// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface PoolCapScheduleVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
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

/// @notice Produces Safe -> timelock schedule/execute calldata for initial-pair reserve caps.
/// @dev This script does not broadcast. Once executed, pool creation remains permissionless for the capped assets.
contract PrepareInitialPoolCaps {
    PoolCapScheduleVm private constant vm = PoolCapScheduleVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant DELAY = 5 minutes;

    function run() external returns (string memory json) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        address baseToken = vm.envAddress("INITIAL_POOL_BASE_TOKEN_ADDRESS");
        address quoteToken = vm.envAddress("QUOTE_TOKEN_ADDRESS");
        uint256 baseCap = vm.envUint("INITIAL_POOL_BASE_RESERVE_CAP");
        uint256 quoteCap = vm.envUint("INITIAL_POOL_QUOTE_RESERVE_CAP");
        require(baseToken != address(0) && quoteToken != address(0) && baseToken != quoteToken, "invalid tokens");
        require(baseToken.code.length != 0 && quoteToken.code.length != 0, "token code missing");
        require(baseCap != 0 && quoteCap != 0, "reserve cap missing");
        require(baseCap <= type(uint112).max && quoteCap <= type(uint112).max, "reserve cap too large");

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

        string memory key = "initialPoolCaps";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", safe);
        vm.serializeAddress(key, "protocolTimelock", timelockAddress);
        vm.serializeAddress(key, "poolFactory", factoryAddress);
        vm.serializeUint(key, "minimumDelaySeconds", DELAY);
        json = _serializeOperation(key, "base", timelock, factoryAddress, baseToken, baseCap, 0);
        json = _serializeOperation(key, "quote", timelock, factoryAddress, quoteToken, quoteCap, 1);
        if (vm.envBool("WRITE_POOL_CAP_SCHEDULE_MANIFEST")) {
            vm.writeJson(json, string.concat(root, "/deployments/", network, "-initial-pool-caps.json"));
        }
    }

    function _serializeOperation(
        string memory key,
        string memory prefix,
        ProtocolTimelock timelock,
        address factory,
        address token,
        uint256 cap,
        uint256 index
    ) private returns (string memory json) {
        bytes memory data = abi.encodeCall(PoolFactory.setTokenReserveCap, (token, cap));
        bytes32 salt = keccak256(abi.encode("FOMEORA_POOL_CAP_V1", block.chainid, index, token, cap));
        bytes32 id = timelock.operationId(factory, 0, data, salt);
        bytes memory schedule = abi.encodeCall(ProtocolTimelock.schedule, (factory, 0, data, salt, DELAY));
        bytes memory execute = abi.encodeCall(ProtocolTimelock.execute, (factory, 0, data, salt));
        vm.serializeAddress(key, string.concat(prefix, "Token"), token);
        vm.serializeUint(key, string.concat(prefix, "ReserveCap"), cap);
        vm.serializeBytes32(key, string.concat(prefix, "OperationId"), id);
        vm.serializeBytes(key, string.concat(prefix, "ScheduleCalldata"), schedule);
        json = vm.serializeBytes(key, string.concat(prefix, "ExecuteCalldata"), execute);
    }
}
