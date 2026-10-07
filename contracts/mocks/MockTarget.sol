// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only contract that accepts native BOT through a function call.
contract MockTarget {
    uint256 public pings;
    uint256 public received;

    event Pinged(address indexed from, uint256 value);

    function ping() external payable {
        pings += 1;
        received += msg.value;
        emit Pinged(msg.sender, msg.value);
    }

    function fail() external pure {
        revert("MockTarget: nope");
    }
}
