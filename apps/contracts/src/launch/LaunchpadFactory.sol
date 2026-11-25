// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {LaunchConfigRegistry} from "./LaunchConfigRegistry.sol";
import {LaunchpadRegistry} from "./LaunchpadRegistry.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract LaunchpadFactory is ProtocolAccess, UUPSUpgradeable {
    error InvalidConfiguration();
    error UnauthorizedOwner();

    LaunchpadRegistry public launchpadRegistry;
    LaunchConfigRegistry public configRegistry;
    mapping(address quoteToken => bool supported) public supportedQuoteToken;

    event LaunchpadCreated(uint256 indexed launchpadId, address indexed owner, string slug);
    event QuoteTokenSupportUpdated(address indexed quoteToken, bool supported);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address upgrader,
        LaunchpadRegistry launchpadRegistry_,
        LaunchConfigRegistry configRegistry_,
        address[] calldata quoteTokens
    ) external initializer {
        if (address(launchpadRegistry_) == address(0) || address(configRegistry_) == address(0)) {
            revert InvalidConfiguration();
        }
        __ProtocolAccess_init(admin, upgrader);
        launchpadRegistry = launchpadRegistry_;
        configRegistry = configRegistry_;
        for (uint256 i; i < quoteTokens.length; ++i) {
            _setQuoteTokenSupport(quoteTokens[i], true);
        }
    }

    function createLaunchpad(
        address owner,
        address feeRecipient,
        address[] calldata admins,
        LaunchTypes.Identity calldata identity,
        LaunchTypes.Economics calldata economics,
        LaunchTypes.GraduationConfig calldata graduation,
        LaunchTypes.ProtectionConfig calldata protection
    ) external returns (uint256 launchpadId) {
        if (owner != msg.sender || feeRecipient == address(0)) {
            revert UnauthorizedOwner();
        }
        if (
            !LaunchTypes.validateIdentity(identity) || !LaunchTypes.validateEconomics(economics)
                || !LaunchTypes.validateGraduation(graduation) || !LaunchTypes.validateProtection(protection)
                || !supportedQuoteToken[economics.quoteToken]
        ) revert InvalidConfiguration();
        LaunchTypes.Launchpad memory launchpad = LaunchTypes.Launchpad({
            owner: owner,
            feeRecipient: feeRecipient,
            identity: identity,
            economics: economics,
            graduation: graduation,
            protection: protection,
            active: true
        });
        launchpadId = launchpadRegistry.registerLaunchpad(launchpad, admins);
        configRegistry.storeConfiguration(launchpadId, economics, graduation, protection);
        emit LaunchpadCreated(launchpadId, owner, identity.slug);
    }

    function setLaunchpadStatus(uint256 launchpadId, bool active) external {
        LaunchTypes.Launchpad memory record = launchpadRegistry.launchpad(launchpadId);
        if (record.owner != msg.sender && !launchpadRegistry.isLaunchpadAdmin(launchpadId, msg.sender)) {
            revert UnauthorizedOwner();
        }
        launchpadRegistry.setLaunchpadStatus(launchpadId, active);
    }

    function setQuoteTokenSupport(address quoteToken, bool supported) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setQuoteTokenSupport(quoteToken, supported);
    }

    function _setQuoteTokenSupport(address quoteToken, bool supported) private {
        if (quoteToken == address(0) || quoteToken.code.length == 0) revert InvalidConfiguration();
        supportedQuoteToken[quoteToken] = supported;
        emit QuoteTokenSupportUpdated(quoteToken, supported);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
