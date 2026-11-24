// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";

interface SwapMigrationVerifyVm {
    function envString(string calldata name) external view returns (string memory);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function parseJsonInt(string calldata json, string calldata key) external pure returns (int256);
}

contract VerifySwapMigration {
    SwapMigrationVerifyVm private constant vm = SwapMigrationVerifyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external view {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        require(isTestnet || keccak256(bytes(network)) == keccak256("mainnet"), "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        string memory migration = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", network, "-swap-migration.json"));

        PoolRegistry registry = PoolRegistry(vm.parseJsonAddress(migration, ".poolRegistry"));
        PoolFactory factory = PoolFactory(vm.parseJsonAddress(migration, ".poolFactory"));
        address legacyPool = vm.parseJsonAddress(migration, ".legacyPool");
        address replacement = vm.parseJsonAddress(migration, ".predictedReplacementPool");
        address baseToken = vm.parseJsonAddress(migration, ".baseToken");
        address quoteToken = vm.parseJsonAddress(migration, ".quoteToken");
        uint24 feePips = uint24(vm.parseJsonUint(migration, ".feePips"));
        uint16 binStepBps = uint16(vm.parseJsonUint(migration, ".binStepBps"));
        int24 activeBin = int24(vm.parseJsonInt(migration, ".initialActiveBin"));
        PoolKey memory key = PoolKeyLib.normalize(baseToken, quoteToken, PoolModel.DLMM, feePips, binStepBps);
        bytes32 poolId = PoolKeyLib.id(key);

        require(DlmmPoolV2(legacyPool).paused(), "legacy pool not paused");
        require(registry.isRegisteredPool(legacyPool), "legacy pool orphaned");
        require(registry.isRegisteredPool(replacement), "replacement not registered");
        require(registry.poolById(poolId) == replacement, "replacement not canonical");
        require(DlmmPoolV2(replacement).swapMathVersion() == 2, "swap math version mismatch");
        require(DlmmPoolV2(replacement).activeBin() == activeBin, "active bin mismatch");
        require(DlmmPoolV2(replacement).administrator() == factory.poolAdministrator(), "administrator mismatch");
        require(DlmmPoolV2(replacement).protocolFeeRecipient() == factory.protocolFeeRecipient(), "treasury mismatch");
        require(DlmmPoolV2(replacement).protocolFeeSharePips() == factory.protocolFeeSharePips(), "fee share mismatch");
        require(DlmmPoolV2(replacement).reserveCap0() == factory.tokenReserveCaps(key.token0), "token0 cap mismatch");
        require(DlmmPoolV2(replacement).reserveCap1() == factory.tokenReserveCaps(key.token1), "token1 cap mismatch");
    }
}
