// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface SafeDeployVm {
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

interface ISafeProxyFactory {
    function proxyCreationCode() external view returns (bytes memory);
    function createProxyWithNonce(address singleton, bytes calldata initializer, uint256 saltNonce)
        external
        returns (address payable proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

/// @notice Deploys the canonical Safe v1.4.1 L2 proxy used as Fomeora governance.
contract DeployGovernanceSafe {
    SafeDeployVm private constant vm = SafeDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address private constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address private constant COMPATIBILITY_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;
    uint256 private constant THRESHOLD = 2;
    uint256 private constant SALT_NONCE = uint256(keccak256("FOMEORA_GOVERNANCE_SAFE_V1"));

    function run() external returns (address governanceSafe) {
        string memory network = vm.envString("APP_NETWORK");
        bool isTestnet = keccak256(bytes(network)) == keccak256("testnet");
        bool isMainnet = keccak256(bytes(network)) == keccak256("mainnet");
        require(isTestnet || isMainnet, "invalid network");
        require(block.chainid == (isTestnet ? 46_630 : 4_663), "chain mismatch");
        require(!isMainnet || vm.envBool("MAINNET_DEPLOYMENT_APPROVED"), "mainnet locked");

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(deployerPrivateKey != 0 && vm.addr(deployerPrivateKey) == deployer, "deployer mismatch");
        require(SAFE_L2_SINGLETON.code.length != 0, "Safe singleton missing");
        require(SAFE_PROXY_FACTORY.code.length != 0, "Safe factory missing");
        require(COMPATIBILITY_FALLBACK_HANDLER.code.length != 0, "Safe handler missing");

        address[] memory owners = new address[](3);
        owners[0] = vm.envAddress("CONTRACT_ADMIN_ADDRESS");
        owners[1] = vm.envAddress("CONTRACT_UPGRADER_ADDRESS");
        owners[2] = vm.envAddress("TREASURY_ADDRESS");
        for (uint256 i; i < owners.length; ++i) {
            require(owners[i] != address(0), "zero Safe owner");
            for (uint256 j = i + 1; j < owners.length; ++j) {
                require(owners[i] != owners[j], "duplicate Safe owner");
            }
        }

        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (
                owners,
                THRESHOLD,
                address(0),
                bytes(""),
                COMPATIBILITY_FALLBACK_HANDLER,
                address(0),
                0,
                payable(address(0))
            )
        );
        governanceSafe = _predictedAddress(initializer);
        if (governanceSafe.code.length == 0) {
            vm.startBroadcast(deployerPrivateKey);
            address deployed =
                ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(SAFE_L2_SINGLETON, initializer, SALT_NONCE);
            vm.stopBroadcast();
            require(deployed == governanceSafe, "unexpected Safe address");
        }

        require(ISafe(governanceSafe).getThreshold() == THRESHOLD, "Safe threshold mismatch");
        address[] memory actualOwners = ISafe(governanceSafe).getOwners();
        require(actualOwners.length == owners.length, "Safe owner count mismatch");
        for (uint256 i; i < owners.length; ++i) {
            require(_contains(actualOwners, owners[i]), "Safe owner mismatch");
        }

        string memory key = "governanceSafe";
        vm.serializeString(key, "network", network);
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "threshold", THRESHOLD);
        string memory json = vm.serializeAddress(key, "address", governanceSafe);
        if (vm.envBool("WRITE_SAFE_MANIFEST")) {
            vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", network, "-safe.json"));
        }
    }

    function _predictedAddress(bytes memory initializer) private view returns (address predicted) {
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), SALT_NONCE));
        bytes memory deploymentData = abi.encodePacked(
            ISafeProxyFactory(SAFE_PROXY_FACTORY).proxyCreationCode(), uint256(uint160(SAFE_L2_SINGLETON))
        );
        predicted = address(
            uint160(
                uint256(keccak256(abi.encodePacked(bytes1(0xff), SAFE_PROXY_FACTORY, salt, keccak256(deploymentData))))
            )
        );
    }

    function _contains(address[] memory values, address expected) private pure returns (bool) {
        for (uint256 i; i < values.length; ++i) {
            if (values[i] == expected) return true;
        }
        return false;
    }
}
