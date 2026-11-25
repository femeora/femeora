// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract LaunchConfigRegistry is ProtocolAccess, UUPSUpgradeable {
    error InvalidConfiguration();
    error ConfigurationMissing();

    struct Config {
        LaunchTypes.Economics economics;
        LaunchTypes.GraduationConfig graduation;
        LaunchTypes.ProtectionConfig protection;
        bool exists;
    }

    mapping(uint256 launchpadId => Config config) private _configs;

    event LaunchConfigurationStored(
        uint256 indexed launchpadId, address indexed quoteToken, uint128 graduationThreshold
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader) external initializer {
        __ProtocolAccess_init(admin, upgrader);
    }

    function storeConfiguration(
        uint256 launchpadId,
        LaunchTypes.Economics calldata economics,
        LaunchTypes.GraduationConfig calldata graduation,
        LaunchTypes.ProtectionConfig calldata protection
    ) external onlyRole(FACTORY_ROLE) {
        if (
            launchpadId == 0 || !LaunchTypes.validateEconomics(economics) || !LaunchTypes.validateGraduation(graduation)
                || !LaunchTypes.validateProtection(protection)
        ) revert InvalidConfiguration();
        _configs[launchpadId] = Config(economics, graduation, protection, true);
        emit LaunchConfigurationStored(launchpadId, economics.quoteToken, economics.graduationThreshold);
    }

    function configuration(uint256 launchpadId) external view returns (Config memory result) {
        result = _configs[launchpadId];
        if (!result.exists) revert ConfigurationMissing();
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
