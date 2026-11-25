// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LaunchTypes} from "./LaunchTypes.sol";

interface IGraduator {
    function registerLaunch(
        address curve,
        uint256 launchpadId,
        address creator,
        address launchpadFeeRecipient,
        address protocolFeeRecipient,
        LaunchTypes.Economics calldata economics,
        LaunchTypes.GraduationConfig calldata config
    ) external;

    function graduate(
        uint256 launchpadId,
        address token,
        address quoteToken,
        address creator,
        uint256 tokenAmount,
        uint256 quoteAmount
    ) external returns (address pool, uint256 positionId);
}
