// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";
import {PoolKey, PoolKeyLib, PoolModel} from "./PoolTypes.sol";
import {PoolRegistry} from "./PoolRegistry.sol";
import {DammPool} from "./DammPool.sol";
import {DlmmPoolV2} from "./DlmmPoolV2.sol";
import {DammPoolDeployer} from "./DammPoolDeployer.sol";
import {DlmmPoolV2Deployer} from "./DlmmPoolV2Deployer.sol";

contract PoolFactory is ProtocolAccess, UUPSUpgradeable {
    error InvalidConfiguration();
    error PoolAlreadyExists();
    error TokenReserveCapMissing();

    PoolRegistry public registry;
    address public poolAdministrator;
    address public protocolFeeRecipient;
    uint24 public protocolFeeSharePips;
    DammPoolDeployer public dammDeployer;
    DlmmPoolV2Deployer public dlmmDeployer;
    mapping(address token => uint256 reserveCap) public tokenReserveCaps;

    event PoolCreated(bytes32 indexed poolId, address indexed pool, PoolKey key);
    event DlmmPoolInitialized(address indexed pool, int24 initialActiveBin);
    event PoolGovernanceConfigured(address indexed administrator, address indexed feeRecipient, uint24 feeSharePips);
    event PoolDeployersUpdated(address indexed dammDeployer, address indexed dlmmDeployer);
    event TokenReserveCapUpdated(address indexed token, uint256 reserveCap);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address upgrader,
        PoolRegistry registry_,
        address feeRecipient,
        uint24 feeSharePips,
        DammPoolDeployer dammDeployer_,
        DlmmPoolV2Deployer dlmmDeployer_
    ) external initializer {
        if (
            address(registry_) == address(0) || feeRecipient == address(0) || address(dammDeployer_) == address(0)
                || address(dlmmDeployer_) == address(0) || dammDeployer_.factory() != address(this)
                || dlmmDeployer_.factory() != address(this) || feeSharePips > 1_000_000
        ) revert InvalidConfiguration();
        __ProtocolAccess_init(admin, upgrader);
        registry = registry_;
        poolAdministrator = admin;
        protocolFeeRecipient = feeRecipient;
        protocolFeeSharePips = feeSharePips;
        dammDeployer = dammDeployer_;
        dlmmDeployer = dlmmDeployer_;
        emit PoolGovernanceConfigured(admin, feeRecipient, feeSharePips);
    }

    function setPoolGovernance(address administrator, address feeRecipient, uint24 feeSharePips)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (administrator == address(0) || feeRecipient == address(0) || feeSharePips > 1_000_000) {
            revert InvalidConfiguration();
        }
        poolAdministrator = administrator;
        protocolFeeRecipient = feeRecipient;
        protocolFeeSharePips = feeSharePips;
        emit PoolGovernanceConfigured(administrator, feeRecipient, feeSharePips);
    }

    /// @notice Replaces immutable CREATE2 deployer helpers without changing the factory proxy.
    /// @dev Required when a pre-launch pool implementation gains new accounting events.
    function setPoolDeployers(DammPoolDeployer dammDeployer_, DlmmPoolV2Deployer dlmmDeployer_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (
            address(dammDeployer_) == address(0) || address(dlmmDeployer_) == address(0)
                || dammDeployer_.factory() != address(this) || dlmmDeployer_.factory() != address(this)
        ) revert InvalidConfiguration();
        dammDeployer = dammDeployer_;
        dlmmDeployer = dlmmDeployer_;
        emit PoolDeployersUpdated(address(dammDeployer_), address(dlmmDeployer_));
    }

    /// @notice Sets the maximum raw reserve of `token` allowed in each newly created pool.
    /// @dev A zero cap disables future pool creation involving the token.
    function setTokenReserveCap(address token, uint256 reserveCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token.code.length == 0 || reserveCap > type(uint112).max) {
            revert InvalidConfiguration();
        }
        tokenReserveCaps[token] = reserveCap;
        emit TokenReserveCapUpdated(token, reserveCap);
    }

    /// @notice Creation is public; governance and upgrade roles remain restricted.
    function permissionlessCreation() external pure returns (bool) {
        return true;
    }

    function createPool(address tokenA, address tokenB, PoolModel model, uint24 feePips, uint16 binStepBps)
        external
        returns (address pool)
    {
        if (tokenA.code.length == 0 || tokenB.code.length == 0) revert InvalidConfiguration();
        if (feePips == 0 || feePips >= 1_000_000) revert InvalidConfiguration();
        if (model == PoolModel.DAMM && binStepBps != 0) revert InvalidConfiguration();
        if (model == PoolModel.DLMM && (binStepBps == 0 || binStepBps > 1_000)) {
            revert InvalidConfiguration();
        }
        PoolKey memory key = PoolKeyLib.normalize(tokenA, tokenB, model, feePips, binStepBps);
        pool = _createPool(key, 0);
    }

    function createDlmmPool(address tokenA, address tokenB, uint24 feePips, uint16 binStepBps, int24 initialActiveBin)
        external
        returns (address pool)
    {
        if (tokenA.code.length == 0 || tokenB.code.length == 0) revert InvalidConfiguration();
        if (feePips == 0 || feePips >= 1_000_000) {
            revert InvalidConfiguration();
        }
        if (binStepBps == 0 || binStepBps > 1_000) revert InvalidConfiguration();
        PoolKey memory key = PoolKeyLib.normalize(tokenA, tokenB, PoolModel.DLMM, feePips, binStepBps);
        pool = _createPool(key, initialActiveBin);
    }

    function predictPoolAddress(PoolKey calldata key, address administrator) external view returns (address predicted) {
        predicted = key.model == PoolModel.DAMM
            ? dammDeployer.predict(key, administrator)
            : dlmmDeployer.predict(key, administrator, 0);
    }

    function predictDlmmPoolAddress(PoolKey calldata key, address administrator, int24 initialActiveBin)
        external
        view
        returns (address predicted)
    {
        if (key.model != PoolModel.DLMM || key.binStepBps == 0 || key.binStepBps > 1_000) {
            revert InvalidConfiguration();
        }
        predicted = dlmmDeployer.predict(key, administrator, initialActiveBin);
    }

    function _createPool(PoolKey memory key, int24 initialActiveBin) private returns (address pool) {
        bytes32 poolId = PoolKeyLib.id(key);
        if (registry.poolById(poolId) != address(0)) revert PoolAlreadyExists();
        uint256 reserveCap0 = tokenReserveCaps[key.token0];
        uint256 reserveCap1 = tokenReserveCaps[key.token1];
        if (reserveCap0 == 0 || reserveCap1 == 0) revert TokenReserveCapMissing();
        pool = key.model == PoolModel.DAMM
            ? dammDeployer.deploy(key, address(this))
            : dlmmDeployer.deploy(key, address(this), initialActiveBin);
        if (key.model == PoolModel.DAMM) {
            DammPool(pool).setReserveCaps(uint112(reserveCap0), uint112(reserveCap1));
            DammPool(pool).setProtocolFeeConfiguration(protocolFeeRecipient, protocolFeeSharePips);
            DammPool(pool).setAdministrator(poolAdministrator);
        } else {
            DlmmPoolV2(pool).setReserveCaps(reserveCap0, reserveCap1);
            DlmmPoolV2(pool).setProtocolFeeConfiguration(protocolFeeRecipient, protocolFeeSharePips);
            DlmmPoolV2(pool).setAdministrator(poolAdministrator);
        }
        registry.registerPool(poolId, pool, key);
        emit PoolCreated(poolId, pool, key);
        if (key.model == PoolModel.DLMM) emit DlmmPoolInitialized(pool, initialActiveBin);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
