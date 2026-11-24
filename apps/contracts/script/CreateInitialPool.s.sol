// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";

interface InitialPoolVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function envInt(string calldata name) external view returns (int256);
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
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external
        returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory);
    function serializeInt(string calldata objectKey, string calldata valueKey, int256 value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Creates the first canonical DLMM pool only after governance and accounting upgrades are active.
contract CreateInitialPool {
    InitialPoolVm private constant vm = InitialPoolVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (address pool) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(privateKey != 0 && vm.addr(privateKey) == deployer, "deployer mismatch");

        address baseToken = vm.envAddress("INITIAL_POOL_BASE_TOKEN_ADDRESS");
        address quoteToken = vm.envAddress("QUOTE_TOKEN_ADDRESS");
        require(baseToken != address(0) && quoteToken != address(0) && baseToken != quoteToken, "invalid tokens");
        require(baseToken.code.length != 0 && quoteToken.code.length != 0, "token code missing");
        _validatedDecimals(baseToken);
        _validatedDecimals(quoteToken);

        uint256 feeRaw = vm.envUint("INITIAL_POOL_FEE_PIPS");
        uint256 stepRaw = vm.envUint("INITIAL_POOL_BIN_STEP_BPS");
        uint256 baseReserveCap = vm.envUint("INITIAL_POOL_BASE_RESERVE_CAP");
        uint256 quoteReserveCap = vm.envUint("INITIAL_POOL_QUOTE_RESERVE_CAP");
        int256 activeRaw = vm.envInt("INITIAL_POOL_ACTIVE_BIN");
        require(feeRaw > 0 && feeRaw < 1_000_000, "invalid fee");
        require(stepRaw > 0 && stepRaw <= 1_000, "invalid bin step");
        require(activeRaw >= type(int24).min && activeRaw <= type(int24).max, "invalid active bin");
        require(baseReserveCap != 0 && quoteReserveCap != 0, "reserve cap missing");

        string memory root = vm.projectRoot();
        string memory deployment = vm.readFile(string.concat(root, "/deployments/", network, ".json"));
        string memory governance = vm.readFile(string.concat(root, "/deployments/", network, "-governance.json"));
        PoolFactory factory = PoolFactory(vm.parseJsonAddress(deployment, ".poolFactory"));
        PoolRegistry registry = PoolRegistry(vm.parseJsonAddress(deployment, ".poolRegistry"));
        address timelock = vm.parseJsonAddress(governance, ".protocolTimelock");
        address expectedDlmmDeployer;
        if (isMainnet) {
            // Mainnet was deployed from the accounting-complete frozen source, so the
            // canonical deployer is already recorded in the primary deployment manifest.
            expectedDlmmDeployer = vm.parseJsonAddress(deployment, ".dlmmPoolV2Deployer");
        } else {
            string memory accounting =
                vm.readFile(string.concat(root, "/deployments/", network, "-accounting-upgrade.json"));
            expectedDlmmDeployer = vm.parseJsonAddress(accounting, ".dlmmPoolV2Deployer");
        }
        address oldAdmin = vm.parseJsonAddress(deployment, ".contractAdmin");
        address oldUpgrader = vm.parseJsonAddress(deployment, ".contractUpgrader");
        require(address(factory).code.length != 0 && address(registry).code.length != 0, "deployment missing");
        require(timelock.code.length != 0 && expectedDlmmDeployer.code.length != 0, "deployer missing");
        require(factory.poolAdministrator() == timelock, "pool governance not timelock");
        require(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), timelock), "timelock missing admin");
        require(factory.hasRole(factory.UPGRADER_ROLE(), timelock), "timelock missing upgrader");
        require(!factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), oldAdmin), "old admin retained");
        require(!factory.hasRole(factory.UPGRADER_ROLE(), oldUpgrader), "old upgrader retained");
        require(address(factory.dlmmDeployer()) == expectedDlmmDeployer, "accounting deployer inactive");
        require(factory.tokenReserveCaps(baseToken) == baseReserveCap, "base reserve cap inactive");
        require(factory.tokenReserveCaps(quoteToken) == quoteReserveCap, "quote reserve cap inactive");

        PoolKey memory key =
            PoolKeyLib.normalize(baseToken, quoteToken, PoolModel.DLMM, uint24(feeRaw), uint16(stepRaw));
        bytes32 poolId = PoolKeyLib.id(key);
        require(registry.poolById(poolId) == address(0), "pool already exists");
        int24 initialActiveBin = int24(activeRaw);
        // CREATE2 constructor administrator is the factory; the factory atomically hands
        // pool administration to poolAdministrator (the timelock) after deployment.
        address predicted = factory.predictDlmmPoolAddress(key, address(factory), initialActiveBin);
        require(predicted.code.length == 0, "predicted address already used");

        vm.startBroadcast(privateKey);
        pool = factory.createDlmmPool(baseToken, quoteToken, uint24(feeRaw), uint16(stepRaw), initialActiveBin);
        vm.stopBroadcast();
        require(pool == predicted && registry.poolById(poolId) == pool, "pool registration mismatch");

        string memory manifestKey = "initialPool";
        vm.serializeString(manifestKey, "network", network);
        vm.serializeUint(manifestKey, "chainId", block.chainid);
        vm.serializeAddress(manifestKey, "pool", pool);
        vm.serializeAddress(manifestKey, "baseToken", baseToken);
        vm.serializeAddress(manifestKey, "quoteToken", quoteToken);
        vm.serializeUint(manifestKey, "feePips", feeRaw);
        vm.serializeUint(manifestKey, "binStepBps", stepRaw);
        vm.serializeUint(manifestKey, "baseReserveCap", baseReserveCap);
        vm.serializeUint(manifestKey, "quoteReserveCap", quoteReserveCap);
        vm.serializeAddress(manifestKey, "governanceTimelock", timelock);
        string memory json = vm.serializeInt(manifestKey, "initialActiveBin", activeRaw);
        if (vm.envBool("WRITE_INITIAL_POOL_MANIFEST")) {
            vm.writeJson(json, string.concat(root, "/deployments/", network, "-initial-pool.json"));
        }
    }

    function _validatedDecimals(address token) private view returns (uint8 decimals) {
        (bool ok, bytes memory result) = token.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && result.length >= 32, "token decimals unavailable");
        uint256 raw = abi.decode(result, (uint256));
        require(raw <= 36, "unsupported token decimals");
        decimals = uint8(raw);
    }
}
