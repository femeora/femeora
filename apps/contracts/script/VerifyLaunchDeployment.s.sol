// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {DammPoolDeployer} from "../src/core/DammPoolDeployer.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PositionManagerV2} from "../src/liquidity/PositionManagerV2.sol";
import {Graduator} from "../src/launch/Graduator.sol";
import {LaunchConfigRegistry} from "../src/launch/LaunchConfigRegistry.sol";
import {LaunchFactory} from "../src/launch/LaunchFactory.sol";
import {LaunchIdentityVerifier} from "../src/launch/LaunchIdentityVerifier.sol";
import {LaunchpadFactory} from "../src/launch/LaunchpadFactory.sol";
import {LaunchpadRegistry} from "../src/launch/LaunchpadRegistry.sol";

interface LaunchDeploymentVerifyVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function projectRoot() external view returns (string memory);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonAddress(string calldata json, string calldata key) external pure returns (address);
    function load(address target, bytes32 slot) external view returns (bytes32);
}

/// @notice Read-only post-deployment acceptance for the additive Launch stack.
/// @dev This script never broadcasts. It verifies proxy implementations, role
///      handoff, core wiring and the retained DLMM deployer on the active chain.
contract VerifyLaunchDeployment {
    LaunchDeploymentVerifyVm private constant vm =
        LaunchDeploymentVerifyVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function run() external view {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        require(isTestnet || keccak256(bytes(network)) == keccak256("mainnet"), "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");

        string memory base = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", network, ".json"));
        string memory launch = vm.readFile(string.concat(vm.projectRoot(), "/deployments/", network, "-launch.json"));
        address admin = vm.envAddress("CONTRACT_ADMIN_ADDRESS");
        address upgrader = vm.envAddress("CONTRACT_UPGRADER_ADDRESS");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        PoolFactory poolFactory = PoolFactory(vm.parseJsonAddress(launch, ".poolFactory"));
        PositionManagerV2 positionManager = PositionManagerV2(vm.parseJsonAddress(launch, ".positionManagerV2"));
        DammPoolDeployer dammDeployer = DammPoolDeployer(vm.parseJsonAddress(launch, ".dammPoolDeployer"));
        LaunchpadRegistry launchpadRegistry = LaunchpadRegistry(vm.parseJsonAddress(launch, ".launchpadRegistry"));
        LaunchConfigRegistry configRegistry = LaunchConfigRegistry(vm.parseJsonAddress(launch, ".launchConfigRegistry"));
        LaunchpadFactory launchpadFactory = LaunchpadFactory(vm.parseJsonAddress(launch, ".launchpadFactory"));
        LaunchIdentityVerifier identityVerifier =
            LaunchIdentityVerifier(vm.parseJsonAddress(launch, ".launchIdentityVerifier"));
        Graduator graduator = Graduator(vm.parseJsonAddress(launch, ".graduator"));
        LaunchFactory launchFactory = LaunchFactory(vm.parseJsonAddress(launch, ".launchFactory"));

        require(address(poolFactory) == vm.parseJsonAddress(base, ".poolFactory"), "factory proxy mismatch");
        require(
            address(positionManager) == vm.parseJsonAddress(base, ".positionManagerV2"),
            "position manager proxy mismatch"
        );
        require(address(poolFactory.dammDeployer()) == address(dammDeployer), "DAMM deployer inactive");
        require(
            address(poolFactory.dlmmDeployer()) == vm.parseJsonAddress(base, ".dlmmPoolV2Deployer"),
            "DLMM deployer changed"
        );
        require(dammDeployer.factory() == address(poolFactory), "DAMM deployer factory mismatch");
        require(poolFactory.hasRole(poolFactory.FACTORY_ROLE(), address(graduator)), "graduator factory role missing");

        require(address(launchpadFactory.launchpadRegistry()) == address(launchpadRegistry), "pad registry mismatch");
        require(address(launchpadFactory.configRegistry()) == address(configRegistry), "config registry mismatch");
        require(
            launchpadFactory.supportedQuoteToken(vm.parseJsonAddress(launch, ".launchQuoteWeth")),
            "WETH launch quote missing"
        );
        require(
            launchpadFactory.supportedQuoteToken(vm.parseJsonAddress(launch, ".launchQuoteUsdg")),
            "USDG launch quote missing"
        );
        require(address(launchFactory.launchpadRegistry()) == address(launchpadRegistry), "launch registry mismatch");
        require(address(launchFactory.configRegistry()) == address(configRegistry), "launch config mismatch");
        require(address(launchFactory.graduator()) == address(graduator), "launch graduator mismatch");
        require(address(launchFactory.identityVerifier()) == address(identityVerifier), "identity verifier mismatch");
        require(
            launchFactory.protocolFeeRecipient() == vm.parseJsonAddress(base, ".treasury"),
            "protocol recipient mismatch"
        );
        require(launchFactory.VIRTUAL_QUOTE_RESERVE_PIPS() == 1_000, "virtual reserve ratio mismatch");
        require(address(graduator.poolFactory()) == address(poolFactory), "graduator factory mismatch");
        require(address(graduator.positionManager()) == address(positionManager), "graduator manager mismatch");
        require(graduator.launchFactory() == address(launchFactory), "graduator launch factory mismatch");
        require(
            identityVerifier.trustedSigner() == vm.parseJsonAddress(launch, ".launchIdentityTrustedSigner"),
            "identity signer mismatch"
        );
        require(
            launchpadRegistry.hasRole(launchpadRegistry.FACTORY_ROLE(), address(launchpadFactory)),
            "pad registry factory role missing"
        );
        require(
            configRegistry.hasRole(configRegistry.FACTORY_ROLE(), address(launchpadFactory)),
            "config factory role missing"
        );
        require(
            identityVerifier.hasRole(identityVerifier.FACTORY_ROLE(), address(launchFactory)),
            "identity factory role missing"
        );

        _requireImplementation(
            address(poolFactory), vm.parseJsonAddress(launch, ".poolFactoryImplementation"), "factory implementation"
        );
        _requireImplementation(
            address(positionManager),
            vm.parseJsonAddress(launch, ".positionManagerV2Implementation"),
            "position implementation"
        );
        _requireImplementation(
            address(launchpadRegistry),
            vm.parseJsonAddress(launch, ".launchpadRegistryImplementation"),
            "pad registry implementation"
        );
        _requireImplementation(
            address(configRegistry),
            vm.parseJsonAddress(launch, ".launchConfigRegistryImplementation"),
            "config implementation"
        );
        _requireImplementation(
            address(launchpadFactory),
            vm.parseJsonAddress(launch, ".launchpadFactoryImplementation"),
            "pad factory implementation"
        );
        _requireImplementation(
            address(identityVerifier),
            vm.parseJsonAddress(launch, ".launchIdentityVerifierImplementation"),
            "identity implementation"
        );
        _requireImplementation(
            address(graduator), vm.parseJsonAddress(launch, ".graduatorImplementation"), "graduator implementation"
        );
        _requireImplementation(
            address(launchFactory),
            vm.parseJsonAddress(launch, ".launchFactoryImplementation"),
            "launch factory implementation"
        );

        _requireGovernance(address(launchpadRegistry), admin, upgrader, deployer);
        _requireGovernance(address(configRegistry), admin, upgrader, deployer);
        _requireGovernance(address(launchpadFactory), admin, upgrader, deployer);
        _requireGovernance(address(identityVerifier), admin, upgrader, deployer);
        _requireGovernance(address(graduator), admin, upgrader, deployer);
        _requireGovernance(address(launchFactory), admin, upgrader, deployer);
    }

    function _requireImplementation(address proxy, address expected, string memory label) private view {
        require(expected.code.length != 0, string.concat(label, " missing"));
        address actual = address(uint160(uint256(vm.load(proxy, IMPLEMENTATION_SLOT))));
        require(actual == expected, string.concat(label, " mismatch"));
    }

    function _requireGovernance(address target, address admin, address upgrader, address deployer) private view {
        ProtocolAccess access = ProtocolAccess(target);
        require(access.hasRole(access.DEFAULT_ADMIN_ROLE(), admin), "admin role missing");
        require(access.hasRole(access.UPGRADER_ROLE(), upgrader), "upgrader role missing");
        if (admin != deployer) {
            require(!access.hasRole(access.DEFAULT_ADMIN_ROLE(), deployer), "deployer admin retained");
        }
        if (upgrader != deployer) {
            require(!access.hasRole(access.UPGRADER_ROLE(), deployer), "deployer upgrade retained");
        }
    }
}
