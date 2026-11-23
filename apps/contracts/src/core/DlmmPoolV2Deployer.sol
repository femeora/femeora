// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DlmmPoolV2 } from "./DlmmPoolV2.sol";
import { PoolKey, PoolKeyLib, PoolModel } from "./PoolTypes.sol";

contract DlmmPoolV2Deployer {
    error Unauthorized();
    error InvalidModel();

    address public immutable factory;

    constructor(address factory_) { factory = factory_; }

    function deploy(PoolKey calldata key, address administrator, int24 initialActiveBin)
        external returns (address)
    {
        if (msg.sender != factory) revert Unauthorized();
        if (key.model != PoolModel.DLMM) revert InvalidModel();
        return address(new DlmmPoolV2{ salt: PoolKeyLib.id(key) }(key, administrator, initialActiveBin));
    }

    function predict(PoolKey calldata key, address administrator, int24 initialActiveBin)
        external view returns (address)
    {
        bytes32 salt = PoolKeyLib.id(key);
        bytes32 hash = keccak256(abi.encodePacked(type(DlmmPoolV2).creationCode, abi.encode(key, administrator, initialActiveBin)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))));
    }
}
