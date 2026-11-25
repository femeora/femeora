// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../src/access/ProtocolAccess.sol";
import {DammPoolDeployer} from "../src/core/DammPoolDeployer.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PositionManagerV2} from "../src/liquidity/PositionManagerV2.sol";
import {ERC1967Proxy} from "../src/proxy/ERC1967Proxy.sol";
import {Graduator} from "../src/launch/Graduator.sol";
import {LaunchConfigRegistry} from "../src/launch/LaunchConfigRegistry.sol";
import {LaunchFactory} from "../src/launch/LaunchFactory.sol";
import {LaunchIdentityVerifier} from "../src/launch/LaunchIdentityVerifier.sol";
import {LaunchpadFactory} from "../src/launch/LaunchpadFactory.sol";
import {LaunchpadRegistry} from "../src/launch/LaunchpadRegistry.sol";

interface LaunchPreparationVm {
    function envAddress(string calldata name) external view returns (address);
    function envString(string calldata name) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
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
    function serializeBytes(string calldata objectKey, string calldata valueKey, bytes calldata value)
        external
        returns (string memory);
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

/// @notice Deploys the additive Launch stack and fresh core implementations.
/// @dev It deliberately does not upgrade existing proxies or mutate PoolFactory roles.
///      Those calls are serialized for the existing governance timelock/Safe.
contract PrepareLaunchDeployment {
    LaunchPreparationVm private constant vm =
        LaunchPreparationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Stack {
        PoolFactory factoryImplementation;
        PositionManagerV2 positionManagerImplementation;
        DammPoolDeployer dammPoolDeployer;
        LaunchpadRegistry launchpadRegistryImplementation;
        LaunchpadRegistry launchpadRegistry;
        LaunchConfigRegistry launchConfigRegistryImplementation;
        LaunchConfigRegistry launchConfigRegistry;
        LaunchpadFactory launchpadFactoryImplementation;
        LaunchpadFactory launchpadFactory;
        LaunchIdentityVerifier identityVerifierImplementation;
        LaunchIdentityVerifier identityVerifier;
        Graduator graduatorImplementation;
        Graduator graduator;
        LaunchFactory launchFactoryImplementation;
        LaunchFactory launchFactory;
    }

    function run() external returns (Stack memory stack) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");
        require(vm.envBool("WRITE_LAUNCH_MANIFEST"), "launch manifest required");

        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address admin = vm.envAddress("CONTRACT_ADMIN_ADDRESS");
        address upgrader = vm.envAddress("CONTRACT_UPGRADER_ADDRESS");
        address weth = vm.envAddress("INITIAL_POOL_BASE_TOKEN_ADDRESS");
        address usdg = vm.envAddress("QUOTE_TOKEN_ADDRESS");
        uint256 identitySignerPrivateKey = vm.envUint("LAUNCH_IDENTITY_SIGNER_PRIVATE_KEY");
        address trustedSigner = vm.addr(identitySignerPrivateKey);
        require(privateKey != 0 && vm.addr(privateKey) == deployer, "deployer mismatch");
        require(
            admin != address(0) && upgrader != address(0) && identitySignerPrivateKey != 0
                && trustedSigner != address(0),
            "invalid roles"
        );
        require(weth.code.length != 0 && usdg.code.length != 0 && weth != usdg, "invalid launch quotes");

        string memory deploymentPath = string.concat(vm.projectRoot(), "/deployments/", network, ".json");
        string memory deployment = vm.readFile(deploymentPath);
        address factoryProxy = vm.parseJsonAddress(deployment, ".poolFactory");
        address positionManagerProxy = vm.parseJsonAddress(deployment, ".positionManagerV2");
        address currentDlmmPoolDeployer = vm.parseJsonAddress(deployment, ".dlmmPoolV2Deployer");
        address treasury = vm.parseJsonAddress(deployment, ".treasury");
        require(
            factoryProxy.code.length != 0 && positionManagerProxy.code.length != 0
                && currentDlmmPoolDeployer.code.length != 0 && treasury != address(0),
            "invalid manifest"
        );

        vm.startBroadcast(privateKey);
        stack.factoryImplementation = new PoolFactory();
        stack.positionManagerImplementation = new PositionManagerV2();
        stack.dammPoolDeployer = new DammPoolDeployer(factoryProxy);

        stack.launchpadRegistryImplementation = new LaunchpadRegistry();
        stack.launchpadRegistry = LaunchpadRegistry(
            address(
                new ERC1967Proxy(
                    address(stack.launchpadRegistryImplementation),
                    abi.encodeCall(LaunchpadRegistry.initialize, (deployer, deployer))
                )
            )
        );
        stack.launchConfigRegistryImplementation = new LaunchConfigRegistry();
        stack.launchConfigRegistry = LaunchConfigRegistry(
            address(
                new ERC1967Proxy(
                    address(stack.launchConfigRegistryImplementation),
                    abi.encodeCall(LaunchConfigRegistry.initialize, (deployer, deployer))
                )
            )
        );
        stack.launchpadFactoryImplementation = new LaunchpadFactory();
        address[] memory launchQuoteTokens = new address[](2);
        launchQuoteTokens[0] = weth;
        launchQuoteTokens[1] = usdg;
        stack.launchpadFactory = LaunchpadFactory(
            address(
                new ERC1967Proxy(
                    address(stack.launchpadFactoryImplementation),
                    abi.encodeCall(
                        LaunchpadFactory.initialize,
                        (deployer, deployer, stack.launchpadRegistry, stack.launchConfigRegistry, launchQuoteTokens)
                    )
                )
            )
        );
        stack.identityVerifierImplementation = new LaunchIdentityVerifier();
        stack.identityVerifier = LaunchIdentityVerifier(
            address(
                new ERC1967Proxy(
                    address(stack.identityVerifierImplementation),
                    abi.encodeCall(LaunchIdentityVerifier.initialize, (deployer, deployer, trustedSigner))
                )
            )
        );
        stack.graduatorImplementation = new Graduator();
        stack.graduator = Graduator(
            address(
                new ERC1967Proxy(
                    address(stack.graduatorImplementation),
                    abi.encodeCall(
                        Graduator.initialize,
                        (deployer, deployer, PoolFactory(factoryProxy), PositionManagerV2(positionManagerProxy))
                    )
                )
            )
        );
        stack.launchFactoryImplementation = new LaunchFactory();
        stack.launchFactory = LaunchFactory(
            address(
                new ERC1967Proxy(
                    address(stack.launchFactoryImplementation),
                    abi.encodeCall(
                        LaunchFactory.initialize,
                        (
                            deployer,
                            deployer,
                            stack.launchpadRegistry,
                            stack.launchConfigRegistry,
                            stack.graduator,
                            stack.identityVerifier,
                            treasury
                        )
                    )
                )
            )
        );

        stack.launchpadRegistry.setRole(stack.launchpadRegistry.FACTORY_ROLE(), address(stack.launchpadFactory), true);
        stack.launchConfigRegistry
            .setRole(stack.launchConfigRegistry.FACTORY_ROLE(), address(stack.launchpadFactory), true);
        stack.identityVerifier.setRole(stack.identityVerifier.FACTORY_ROLE(), address(stack.launchFactory), true);
        stack.graduator.setLaunchFactory(address(stack.launchFactory));

        _handover(address(stack.launchpadRegistry), admin, upgrader, deployer);
        _handover(address(stack.launchConfigRegistry), admin, upgrader, deployer);
        _handover(address(stack.launchpadFactory), admin, upgrader, deployer);
        _handover(address(stack.identityVerifier), admin, upgrader, deployer);
        _handover(address(stack.graduator), admin, upgrader, deployer);
        _handover(address(stack.launchFactory), admin, upgrader, deployer);
        vm.stopBroadcast();

        _writeManifest(
            network, factoryProxy, positionManagerProxy, DlmmPoolV2Deployer(currentDlmmPoolDeployer), weth, usdg, stack
        );
    }

    function _writeManifest(
        string memory network,
        address factoryProxy,
        address positionManagerProxy,
        DlmmPoolV2Deployer currentDlmmPoolDeployer,
        address weth,
        address usdg,
        Stack memory stack
    ) private {
        bytes memory factoryUpgrade = abi.encodeWithSignature(
            "upgradeToAndCall(address,bytes)", address(stack.factoryImplementation), bytes("")
        );
        bytes memory positionManagerUpgrade = abi.encodeWithSignature(
            "upgradeToAndCall(address,bytes)", address(stack.positionManagerImplementation), bytes("")
        );
        bytes memory activateDeployers =
            abi.encodeCall(PoolFactory.setPoolDeployers, (stack.dammPoolDeployer, currentDlmmPoolDeployer));
        bytes memory grantGraduator = abi.encodeWithSignature(
            "setRole(bytes32,address,bool)", PoolFactory(factoryProxy).FACTORY_ROLE(), address(stack.graduator), true
        );

        string memory key = "launch";
        vm.serializeString(key, "network", network);
        vm.serializeAddress(key, "poolFactory", factoryProxy);
        vm.serializeAddress(key, "poolFactoryImplementation", address(stack.factoryImplementation));
        vm.serializeBytes(key, "poolFactoryUpgradeCalldata", factoryUpgrade);
        vm.serializeAddress(key, "positionManagerV2", positionManagerProxy);
        vm.serializeAddress(key, "positionManagerV2Implementation", address(stack.positionManagerImplementation));
        vm.serializeBytes(key, "positionManagerUpgradeCalldata", positionManagerUpgrade);
        vm.serializeAddress(key, "dammPoolDeployer", address(stack.dammPoolDeployer));
        vm.serializeBytes(key, "activatePoolDeployersCalldata", activateDeployers);
        vm.serializeBytes(key, "grantGraduatorFactoryRoleCalldata", grantGraduator);
        vm.serializeAddress(key, "launchpadRegistry", address(stack.launchpadRegistry));
        vm.serializeAddress(key, "launchpadRegistryImplementation", address(stack.launchpadRegistryImplementation));
        vm.serializeAddress(key, "launchConfigRegistry", address(stack.launchConfigRegistry));
        vm.serializeAddress(
            key, "launchConfigRegistryImplementation", address(stack.launchConfigRegistryImplementation)
        );
        vm.serializeAddress(key, "launchpadFactory", address(stack.launchpadFactory));
        vm.serializeAddress(key, "launchpadFactoryImplementation", address(stack.launchpadFactoryImplementation));
        vm.serializeAddress(key, "launchQuoteWeth", weth);
        vm.serializeAddress(key, "launchQuoteUsdg", usdg);
        vm.serializeAddress(key, "launchIdentityVerifier", address(stack.identityVerifier));
        vm.serializeAddress(key, "launchIdentityVerifierImplementation", address(stack.identityVerifierImplementation));
        vm.serializeAddress(key, "launchIdentityTrustedSigner", stack.identityVerifier.trustedSigner());
        vm.serializeAddress(key, "graduator", address(stack.graduator));
        vm.serializeAddress(key, "graduatorImplementation", address(stack.graduatorImplementation));
        vm.serializeAddress(key, "launchFactoryImplementation", address(stack.launchFactoryImplementation));
        string memory json = vm.serializeAddress(key, "launchFactory", address(stack.launchFactory));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", network, "-launch.json"));
    }

    function _handover(address target, address admin, address upgrader, address deployer) private {
        ProtocolAccess access = ProtocolAccess(target);
        access.setRole(access.DEFAULT_ADMIN_ROLE(), admin, true);
        access.setRole(access.UPGRADER_ROLE(), upgrader, true);
        if (upgrader != deployer) access.setRole(access.UPGRADER_ROLE(), deployer, false);
        if (admin != deployer) access.setRole(access.DEFAULT_ADMIN_ROLE(), deployer, false);
    }
}
