// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolTimelock} from "../src/access/ProtocolTimelock.sol";

interface TimelockVm {
    function warp(uint256 timestamp) external;
}

contract TimelockTarget {
    uint256 public value;

    function setValue(uint256 value_) external {
        value = value_;
    }
}

contract ProtocolTimelockTest {
    TimelockVm private constant vm = TimelockVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint48 private constant TESTNET_DELAY = 5 minutes;

    ProtocolTimelock private timelock;
    TimelockTarget private target;

    function setUp() public {
        timelock = new ProtocolTimelock(address(this), TESTNET_DELAY);
        target = new TimelockTarget();
    }

    function test_TestnetOperationExecutesAfterFiveMinutes() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (42));
        bytes32 salt = keccak256("set-value");
        timelock.schedule(address(target), 0, data, salt, TESTNET_DELAY);

        (bool early,) =
            address(timelock).call(abi.encodeCall(ProtocolTimelock.execute, (address(target), 0, data, salt)));
        require(!early, "early execution");

        vm.warp(block.timestamp + TESTNET_DELAY);
        timelock.execute(address(target), 0, data, salt);
        require(target.value() == 42, "execution");
    }

    function test_DelayCannotBeChangedWithoutTimelock() public {
        (bool direct,) = address(timelock).call(abi.encodeCall(ProtocolTimelock.updateMinDelay, (uint48(1 minutes))));
        require(!direct, "direct delay change");

        bytes memory data = abi.encodeCall(ProtocolTimelock.updateMinDelay, (uint48(10 minutes)));
        bytes32 salt = keccak256("raise-delay");
        timelock.schedule(address(timelock), 0, data, salt, TESTNET_DELAY);
        vm.warp(block.timestamp + TESTNET_DELAY);
        timelock.execute(address(timelock), 0, data, salt);
        require(timelock.minDelay() == 10 minutes, "delayed change");
    }

    function test_DelayCannotBeLoweredBelowFiveMinutesEvenThroughTimelock() public {
        bytes memory data = abi.encodeCall(ProtocolTimelock.updateMinDelay, (uint48(1 minutes)));
        bytes32 salt = keccak256("invalid-low-delay");
        timelock.schedule(address(timelock), 0, data, salt, TESTNET_DELAY);
        vm.warp(block.timestamp + TESTNET_DELAY);
        (bool success,) =
            address(timelock).call(abi.encodeCall(ProtocolTimelock.execute, (address(timelock), 0, data, salt)));
        require(!success, "lowered below minimum");
        require(timelock.minDelay() == TESTNET_DELAY, "minimum preserved");
    }

    function test_ProposerCanCancelPendingOperation() public {
        bytes memory data = abi.encodeCall(TimelockTarget.setValue, (7));
        bytes32 salt = keccak256("cancel-value");
        bytes32 id = timelock.schedule(address(target), 0, data, salt, TESTNET_DELAY);
        timelock.cancel(id);
        vm.warp(block.timestamp + TESTNET_DELAY);
        (bool success,) =
            address(timelock).call(abi.encodeCall(ProtocolTimelock.execute, (address(target), 0, data, salt)));
        require(!success, "cancelled execution");
    }
}
