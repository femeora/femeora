// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface TimelockDeployVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function envBool(string calldata name) external view returns (bool);
    function addr(uint256 privateKey) external view returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function projectRoot() external view returns (string memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
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

contract DeployTimelock {
    TimelockDeployVm private constant vm = TimelockDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 public constant FOMEORA_TIMELOCK_DELAY = 5 minutes;

    function run() external returns (ProtocolTimelock timelock) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address governanceSafe = vm.envAddress("GOVERNANCE_SAFE_ADDRESS");
        require(deployerPrivateKey != 0 && vm.addr(deployerPrivateKey) == deployer, "deployer mismatch");
        require(governanceSafe != address(0), "invalid governance Safe");

        vm.startBroadcast(deployerPrivateKey);
        timelock = new ProtocolTimelock(governanceSafe, FOMEORA_TIMELOCK_DELAY);
        vm.stopBroadcast();

        string memory key = "governance";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "governanceSafe", governanceSafe);
        vm.serializeUint(key, "minimumDelaySeconds", FOMEORA_TIMELOCK_DELAY);
        string memory json = vm.serializeAddress(key, "protocolTimelock", address(timelock));
        if (vm.envBool("WRITE_TIMELOCK_MANIFEST")) {
            vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", network, "-governance.json"));
        }
    }
}
