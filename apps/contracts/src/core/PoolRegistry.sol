// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ProtocolAccess } from "../access/ProtocolAccess.sol";
import { UUPSUpgradeable } from "../proxy/UUPSUpgradeable.sol";
import { PoolKey } from "./PoolTypes.sol";

contract PoolRegistry is ProtocolAccess, UUPSUpgradeable {
    error PoolAlreadyRegistered();
    error InvalidPool();
    error PoolNotRegistered();

    mapping(bytes32 poolId => address pool) private _pools;
    mapping(address pool => bytes32 poolId) private _poolIds;
    mapping(address pool => bool registered) private _registeredPools;
    uint256 public poolCount;

    event PoolRegistered(bytes32 indexed poolId, address indexed pool, PoolKey key);
    event PoolReplaced(bytes32 indexed poolId, address indexed previousPool, address indexed pool, PoolKey key);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader, address initialFactory)
        external
        initializer
    {
        if (initialFactory == address(0)) revert InvalidAccount();
        __ProtocolAccess_init(admin, upgrader);
        _setRole(FACTORY_ROLE, initialFactory, true);
    }

    function registerPool(bytes32 poolId, address pool, PoolKey calldata key)
        external
        onlyRole(FACTORY_ROLE)
    {
        if (pool == address(0) || pool.code.length == 0) revert InvalidPool();
        if (_pools[poolId] != address(0) || _poolIds[pool] != bytes32(0)) {
            revert PoolAlreadyRegistered();
        }
        _pools[poolId] = pool;
        _poolIds[pool] = poolId;
        _registeredPools[pool] = true;
        unchecked {
            ++poolCount;
        }
        emit PoolRegistered(poolId, pool, key);
    }

    /// @notice Moves canonical discovery to a corrected pool without invalidating legacy positions.
    /// @dev The previous pool remains registered so users can decrease or close positions created there.
    function replacePool(bytes32 poolId, address expectedPool, address pool, PoolKey calldata key)
        external
        onlyRole(FACTORY_ROLE)
    {
        address previousPool = _pools[poolId];
        if (previousPool == address(0) || previousPool != expectedPool) revert PoolNotRegistered();
        if (pool == address(0) || pool.code.length == 0) revert InvalidPool();
        if (_poolIds[pool] != bytes32(0) || _registeredPools[pool]) revert PoolAlreadyRegistered();
        _pools[poolId] = pool;
        _poolIds[pool] = poolId;
        _registeredPools[pool] = true;
        unchecked {
            ++poolCount;
        }
        emit PoolReplaced(poolId, previousPool, pool, key);
    }

    function poolById(bytes32 poolId) external view returns (address) {
        return _pools[poolId];
    }

    function idByPool(address pool) external view returns (bytes32) {
        return _poolIds[pool];
    }

    function isRegisteredPool(address pool) external view returns (bool) {
        return _registeredPools[pool];
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) { }
}
