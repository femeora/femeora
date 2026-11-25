// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {BondingCurveLaunch} from "./BondingCurveLaunch.sol";
import {IGraduator} from "./IGraduator.sol";
import {LaunchConfigRegistry} from "./LaunchConfigRegistry.sol";
import {LaunchIdentityVerifier} from "./LaunchIdentityVerifier.sol";
import {LaunchpadRegistry} from "./LaunchpadRegistry.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract LaunchFactory is ProtocolAccess, UUPSUpgradeable {
    uint24 public constant VIRTUAL_QUOTE_RESERVE_PIPS = 1_000;

    error InvalidLaunchpad();
    error InvalidLaunch();
    error IdentityRequired();
    error ProtectedIdentityConflict();
    error DeveloperAllocationExceedsCap();

    struct LaunchRecord {
        uint256 launchpadId;
        address creator;
        address token;
        address curve;
        uint48 createdAt;
    }

    LaunchpadRegistry public launchpadRegistry;
    LaunchConfigRegistry public configRegistry;
    IGraduator public graduator;
    LaunchIdentityVerifier public identityVerifier;
    address public protocolFeeRecipient;
    uint256 public nextLaunchId;
    mapping(uint256 launchId => LaunchRecord record) public launches;
    mapping(address token => uint256 launchId) public launchByToken;
    mapping(bytes32 normalizedNameHash => address creator) public protectedNameOwner;
    mapping(bytes32 normalizedSymbolHash => address creator) public protectedSymbolOwner;

    event TokenLaunched(
        uint256 indexed launchId,
        uint256 indexed launchpadId,
        address indexed creator,
        address token,
        address curve,
        string name,
        string symbol,
        string metadataURI,
        uint256 totalSupply
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address upgrader,
        LaunchpadRegistry launchpadRegistry_,
        LaunchConfigRegistry configRegistry_,
        IGraduator graduator_,
        LaunchIdentityVerifier identityVerifier_,
        address protocolFeeRecipient_
    ) external initializer {
        if (
            address(launchpadRegistry_) == address(0) || address(configRegistry_) == address(0)
                || address(graduator_) == address(0) || protocolFeeRecipient_ == address(0)
                || address(identityVerifier_) == address(0)
        ) revert InvalidLaunch();
        __ProtocolAccess_init(admin, upgrader);
        launchpadRegistry = launchpadRegistry_;
        configRegistry = configRegistry_;
        graduator = graduator_;
        identityVerifier = identityVerifier_;
        protocolFeeRecipient = protocolFeeRecipient_;
        nextLaunchId = 1;
    }

    function launchToken(
        uint256 launchpadId,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 totalSupply,
        uint256 identityDeadline,
        bytes calldata identityProof
    ) external returns (uint256 launchId, address token, address curve) {
        LaunchTypes.Launchpad memory launchpad = launchpadRegistry.launchpad(launchpadId);
        LaunchConfigRegistry.Config memory config = configRegistry.configuration(launchpadId);
        if (!launchpad.active || !config.exists) revert InvalidLaunchpad();
        // The reserve is a ratio of this launchpad's threshold rather than a
        // global raw token amount. That keeps WETH (18 decimals) and USDG
        // (6 decimals) curves economically equivalent and bounds the final
        // curve/DAMM seed-price deviation well below 1%.
        uint128 virtualQuoteReserve = uint128(
            uint256(config.economics.graduationThreshold) * VIRTUAL_QUOTE_RESERVE_PIPS / LaunchTypes.PIPS_DENOMINATOR
        );
        if (virtualQuoteReserve == 0) revert InvalidLaunch();
        bytes32 nameHash = keccak256(_asciiLower(bytes(name)));
        bytes32 symbolHash = keccak256(_asciiLower(bytes(symbol)));
        if (config.protection.xRequired) {
            if (identityProof.length == 0) revert IdentityRequired();
            identityVerifier.consumeVerification(msg.sender, nameHash, symbolHash, identityDeadline, identityProof);
        }
        if (
            bytes(name).length < 2 || bytes(name).length > 120 || bytes(symbol).length < 2 || bytes(symbol).length > 16
                || bytes(metadataURI).length == 0 || bytes(metadataURI).length > 2_048
                || totalSupply < config.economics.curveTokenSupply
        ) {
            revert InvalidLaunch();
        }
        uint256 creatorAllocation = totalSupply - config.economics.curveTokenSupply;
        if (config.protection.enabled) {
            uint256 developerCap = uint256(config.economics.curveTokenSupply) * config.protection.devBuyCapPips
                / LaunchTypes.PIPS_DENOMINATOR;
            if (creatorAllocation > developerCap) revert DeveloperAllocationExceedsCap();
            _reserveProtectedIdentity(nameHash, symbolHash, msg.sender);
        }
        LaunchToken createdToken = new LaunchToken(name, symbol, metadataURI, totalSupply, address(this));
        BondingCurveLaunch createdCurve = new BondingCurveLaunch(
            launchpadId,
            address(createdToken),
            config.economics.quoteToken,
            msg.sender,
            launchpad.feeRecipient,
            protocolFeeRecipient,
            graduator,
            config.economics,
            config.protection,
            virtualQuoteReserve,
            creatorAllocation
        );
        graduator.registerLaunch(
            address(createdCurve),
            launchpadId,
            msg.sender,
            launchpad.feeRecipient,
            protocolFeeRecipient,
            config.economics,
            config.graduation
        );
        createdToken.transfer(address(createdCurve), config.economics.curveTokenSupply);
        if (creatorAllocation != 0) createdToken.transfer(msg.sender, creatorAllocation);
        launchId = nextLaunchId++;
        token = address(createdToken);
        curve = address(createdCurve);
        launches[launchId] = LaunchRecord(launchpadId, msg.sender, token, curve, uint48(block.timestamp));
        launchByToken[token] = launchId;
        emit TokenLaunched(launchId, launchpadId, msg.sender, token, curve, name, symbol, metadataURI, totalSupply);
    }

    function _reserveProtectedIdentity(bytes32 nameHash, bytes32 symbolHash, address creator) private {
        address nameOwner = protectedNameOwner[nameHash];
        address symbolOwner = protectedSymbolOwner[symbolHash];
        if ((nameOwner != address(0) && nameOwner != creator) || (symbolOwner != address(0) && symbolOwner != creator))
        {
            revert ProtectedIdentityConflict();
        }
        protectedNameOwner[nameHash] = creator;
        protectedSymbolOwner[symbolHash] = creator;
    }

    function _asciiLower(bytes memory value) private pure returns (bytes memory) {
        for (uint256 i; i < value.length; ++i) {
            uint8 character = uint8(value[i]);
            if (character >= 65 && character <= 90) value[i] = bytes1(character + 32);
        }
        return value;
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
