// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token. Do not deploy to mainnet.
contract MockToken is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
