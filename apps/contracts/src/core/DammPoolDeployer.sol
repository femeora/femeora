// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DammPool } from "./DammPool.sol";
import { PoolKey, PoolKeyLib, PoolModel } from "./PoolTypes.sol";

contract DammPoolDeployer {
    error Unauthorized();
    error InvalidModel();

    address public immutable factory;

    constructor(address factory_) { factory = factory_; }

    function deploy(PoolKey calldata key, address administrator) external returns (address) {
        if (msg.sender != factory) revert Unauthorized();
        if (key.model != PoolModel.DAMM) revert InvalidModel();
        return address(new DammPool{ salt: PoolKeyLib.id(key) }(key, administrator));
    }

    function predict(PoolKey calldata key, address administrator) external view returns (address) {
        bytes32 salt = PoolKeyLib.id(key);
        bytes32 hash = keccak256(abi.encodePacked(type(DammPool).creationCode, abi.encode(key, administrator)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))));
    }
}
