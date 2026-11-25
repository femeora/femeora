// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract LaunchToken {
    error InvalidRecipient();
    error InsufficientBalance();
    error InsufficientAllowance();

    string public name;
    string public symbol;
    string public metadataURI;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        uint256 supply,
        address recipient
    ) {
        if (recipient == address(0) || supply == 0) revert InvalidRecipient();
        name = name_;
        symbol = symbol_;
        metadataURI = metadataURI_;
        totalSupply = supply;
        balanceOf[recipient] = supply;
        emit Transfer(address(0), recipient, supply);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 approved = allowance[sender][msg.sender];
        if (approved != type(uint256).max) {
            if (approved < amount) revert InsufficientAllowance();
            allowance[sender][msg.sender] = approved - amount;
            emit Approval(sender, msg.sender, approved - amount);
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        if (recipient == address(0)) revert InvalidRecipient();
        uint256 balance = balanceOf[sender];
        if (balance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[sender] = balance - amount;
            balanceOf[recipient] += amount;
        }
        emit Transfer(sender, recipient, amount);
    }
}
