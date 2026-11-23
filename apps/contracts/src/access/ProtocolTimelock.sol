// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal Safe-controlled timelock for Femeora governance calls.
/// @dev The proposer schedules/cancels operations. Anyone may execute a mature operation.
///      Proposer and delay changes must themselves pass through this timelock.
contract ProtocolTimelock {
    uint48 public constant MINIMUM_DELAY = 5 minutes;

    error InvalidConfiguration();
    error Unauthorized();
    error OperationAlreadyScheduled();
    error OperationNotReady();
    error OperationCallFailed(bytes reason);

    address public proposer;
    uint48 public minDelay;
    mapping(bytes32 operationId => uint48 readyAt) public operationReadyAt;

    event OperationScheduled(
        bytes32 indexed operationId, address indexed target, uint256 value, bytes data, bytes32 salt, uint48 readyAt
    );
    event OperationCancelled(bytes32 indexed operationId);
    event OperationExecuted(bytes32 indexed operationId, address indexed target, uint256 value);
    event ProposerUpdated(address indexed previousProposer, address indexed proposer);
    event MinDelayUpdated(uint48 previousDelay, uint48 minDelay);

    modifier onlyProposer() {
        if (msg.sender != proposer) revert Unauthorized();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    constructor(address proposer_, uint48 minDelay_) {
        if (proposer_ == address(0) || minDelay_ < MINIMUM_DELAY) revert InvalidConfiguration();
        proposer = proposer_;
        minDelay = minDelay_;
        emit ProposerUpdated(address(0), proposer_);
        emit MinDelayUpdated(0, minDelay_);
    }

    receive() external payable {}

    function operationId(address target, uint256 value, bytes calldata data, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(target, value, keccak256(data), salt));
    }

    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt, uint48 delay)
        external
        onlyProposer
        returns (bytes32 id)
    {
        if (target == address(0) || delay < minDelay) revert InvalidConfiguration();
        id = operationId(target, value, data, salt);
        if (operationReadyAt[id] != 0) revert OperationAlreadyScheduled();
        uint256 readyAt = block.timestamp + delay;
        if (readyAt > type(uint48).max) revert InvalidConfiguration();
        operationReadyAt[id] = uint48(readyAt);
        emit OperationScheduled(id, target, value, data, salt, uint48(readyAt));
    }

    function cancel(bytes32 id) external onlyProposer {
        if (operationReadyAt[id] == 0) revert OperationNotReady();
        delete operationReadyAt[id];
        emit OperationCancelled(id);
    }

    function execute(address target, uint256 value, bytes calldata data, bytes32 salt)
        external
        payable
        returns (bytes memory result)
    {
        bytes32 id = operationId(target, value, data, salt);
        uint48 readyAt = operationReadyAt[id];
        if (readyAt == 0 || block.timestamp < readyAt) revert OperationNotReady();
        delete operationReadyAt[id];
        (bool success, bytes memory response) = target.call{value: value}(data);
        if (!success) revert OperationCallFailed(response);
        emit OperationExecuted(id, target, value);
        return response;
    }

    function updateProposer(address proposer_) external onlySelf {
        if (proposer_ == address(0)) revert InvalidConfiguration();
        address previous = proposer;
        proposer = proposer_;
        emit ProposerUpdated(previous, proposer_);
    }

    function updateMinDelay(uint48 minDelay_) external onlySelf {
        if (minDelay_ < MINIMUM_DELAY) revert InvalidConfiguration();
        uint48 previous = minDelay;
        minDelay = minDelay_;
        emit MinDelayUpdated(previous, minDelay_);
    }
}
