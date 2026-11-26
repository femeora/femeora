// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeSplitter} from "../src/fees/FeeSplitter.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {DlmmPoolV2} from "../src/core/DlmmPoolV2.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "../src/core/PoolTypes.sol";

interface TailFeeVerifyVm {
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function load(address target, bytes32 slot) external view returns (bytes32);
    function toString(uint256 value) external pure returns (string memory);
}

contract VerifyTailFeeMigration {
    TailFeeVerifyVm private constant vm =
        TailFeeVerifyVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function run() external view {
        require(block.chainid == 4_663, "mainnet only");
        string memory migration =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/mainnet-tail-fee-migration.json"));
        PoolFactory factory = PoolFactory(vm.parseJsonAddress(migration, ".poolFactory"));
        PoolRegistry registry = factory.registry();
        address manager = vm.parseJsonAddress(migration, ".positionManagerV2");
        FeeSplitter splitter = FeeSplitter(vm.parseJsonAddress(migration, ".feeSplitter"));

        require(
            _implementation(address(factory)) == vm.parseJsonAddress(migration, ".poolFactoryImplementation"),
            "factory implementation mismatch"
        );
        require(
            _implementation(manager) == vm.parseJsonAddress(migration, ".positionManagerV2Implementation"),
            "manager implementation mismatch"
        );
        require(
            _implementation(address(splitter)) == vm.parseJsonAddress(migration, ".feeSplitterImplementation"),
            "splitter implementation mismatch"
        );
        require(splitter.positionManager() == manager, "position manager mismatch");
        require(splitter.tailRewardBps() == 1_000, "tail reward inactive");
        require(factory.protocolFeeRecipient() == address(splitter), "future fee recipient mismatch");
        require(
            address(factory.dlmmDeployer()) == vm.parseJsonAddress(migration, ".dlmmPoolV2Deployer"),
            "dlmm deployer mismatch"
        );

        uint256 poolCount = vm.parseJsonUint(migration, ".poolCount");
        for (uint256 i; i < poolCount; ++i) {
            string memory prefix = string.concat(".pool", vm.toString(i));
            address legacy = vm.parseJsonAddress(migration, string.concat(prefix, "Expected"));
            address tokenA = vm.parseJsonAddress(migration, string.concat(prefix, "TokenA"));
            address tokenB = vm.parseJsonAddress(migration, string.concat(prefix, "TokenB"));
            uint24 feePips = uint24(vm.parseJsonUint(migration, string.concat(prefix, "FeePips")));
            uint16 binStepBps = uint16(vm.parseJsonUint(migration, string.concat(prefix, "BinStepBps")));
            PoolKey memory key = PoolKeyLib.normalize(tokenA, tokenB, PoolModel.DLMM, feePips, binStepBps);
            address replacement = registry.poolById(PoolKeyLib.id(key));

            require(replacement != address(0) && replacement != legacy, "canonical pool not replaced");
            require(DlmmPoolV2(legacy).paused(), "legacy pool not paused");
            require(registry.isRegisteredPool(legacy), "legacy pool orphaned");
            require(registry.isRegisteredPool(replacement), "replacement not registered");
            require(DlmmPoolV2(replacement).activeBin() == DlmmPoolV2(legacy).activeBin(), "price continuity mismatch");
            require(DlmmPoolV2(replacement).protocolFeeRecipient() == address(splitter), "pool fee recipient mismatch");
            require(DlmmPoolV2(replacement).protocolFeeSharePips() == factory.protocolFeeSharePips(), "fee share mismatch");
            require(DlmmPoolV2(replacement).reserveCap0() == factory.tokenReserveCaps(key.token0), "token0 cap mismatch");
            require(DlmmPoolV2(replacement).reserveCap1() == factory.tokenReserveCaps(key.token1), "token1 cap mismatch");
            // Getter calls prove the replacement bytecode exposes the v3 fee-growth surface.
            DlmmPoolV2(replacement).protocolFeeGrowth0X128(DlmmPoolV2(replacement).activeBin());
            DlmmPoolV2(replacement).protocolFeeGrowth1X128(DlmmPoolV2(replacement).activeBin());
        }
    }

    function _implementation(address proxy) private view returns (address) {
        return address(uint160(uint256(vm.load(proxy, IMPLEMENTATION_SLOT))));
    }
}
