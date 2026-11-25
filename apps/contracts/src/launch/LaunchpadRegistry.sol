// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {LaunchTypes} from "./LaunchTypes.sol";

contract LaunchpadRegistry is ProtocolAccess, UUPSUpgradeable {
    error InvalidLaunchpad();
    error LaunchpadExists();
    error SlugUnavailable();

    uint256 public nextLaunchpadId;
    mapping(uint256 launchpadId => LaunchTypes.Launchpad launchpad) private _launchpads;
    mapping(bytes32 slugHash => uint256 launchpadId) public launchpadBySlug;
    mapping(address owner => uint256[] launchpadIds) private _ownedLaunchpads;
    mapping(uint256 launchpadId => address[] admins) private _launchpadAdmins;
    mapping(uint256 launchpadId => mapping(address account => bool enabled)) private _isLaunchpadAdmin;

    event LaunchpadRegistered(
        uint256 indexed launchpadId, address indexed owner, bytes32 indexed slugHash, string slug
    );
    event LaunchpadStatusUpdated(uint256 indexed launchpadId, bool active);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader) external initializer {
        __ProtocolAccess_init(admin, upgrader);
        nextLaunchpadId = 1;
    }

    function registerLaunchpad(LaunchTypes.Launchpad calldata launchpad, address[] calldata admins)
        external
        onlyRole(FACTORY_ROLE)
        returns (uint256 launchpadId)
    {
        bytes32 slugHash = keccak256(bytes(launchpad.identity.slug));
        if (
            launchpad.owner == address(0) || bytes(launchpad.identity.name).length == 0
                || bytes(launchpad.identity.slug).length == 0
        ) {
            revert InvalidLaunchpad();
        }
        if (launchpadBySlug[slugHash] != 0) revert SlugUnavailable();
        launchpadId = nextLaunchpadId++;
        _launchpads[launchpadId] = launchpad;
        launchpadBySlug[slugHash] = launchpadId;
        _ownedLaunchpads[launchpad.owner].push(launchpadId);
        for (uint256 i; i < admins.length; ++i) {
            address admin = admins[i];
            if (admin == address(0) || admin == launchpad.owner || _isLaunchpadAdmin[launchpadId][admin]) {
                revert InvalidLaunchpad();
            }
            _isLaunchpadAdmin[launchpadId][admin] = true;
            _launchpadAdmins[launchpadId].push(admin);
        }
        emit LaunchpadRegistered(launchpadId, launchpad.owner, slugHash, launchpad.identity.slug);
    }

    function setLaunchpadStatus(uint256 launchpadId, bool active) external onlyRole(FACTORY_ROLE) {
        if (_launchpads[launchpadId].owner == address(0)) revert InvalidLaunchpad();
        _launchpads[launchpadId].active = active;
        emit LaunchpadStatusUpdated(launchpadId, active);
    }

    function launchpad(uint256 launchpadId) external view returns (LaunchTypes.Launchpad memory result) {
        result = _launchpads[launchpadId];
        if (result.owner == address(0)) revert InvalidLaunchpad();
    }

    function ownedLaunchpads(address owner) external view returns (uint256[] memory) {
        return _ownedLaunchpads[owner];
    }

    function launchpadAdmins(uint256 launchpadId) external view returns (address[] memory) {
        if (_launchpads[launchpadId].owner == address(0)) revert InvalidLaunchpad();
        return _launchpadAdmins[launchpadId];
    }

    function isLaunchpadAdmin(uint256 launchpadId, address account) external view returns (bool) {
        return _isLaunchpadAdmin[launchpadId][account];
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
