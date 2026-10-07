// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "../interfaces/ISwapRouter.sol";

/// @dev Test-only router. Fixed-rate swap with knobs to simulate partial fills and greedy routers.
contract MockSwapRouter is ISwapRouter {
    uint256 public rateBps = 10000; // amountOut = pulled * rateBps / 10000
    uint256 public pullBps = 10000; // share of amountIn actually pulled (20000 = tries to pull double)

    function setRate(uint256 bps) external {
        rateBps = bps;
    }

    function setPull(uint256 bps) external {
        pullBps = bps;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        require(block.timestamp <= p.deadline, "Transaction too old");
        uint256 pull = (p.amountIn * pullBps) / 10000;
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), pull);
        out = (pull * rateBps) / 10000;
        require(out >= p.amountOutMinimum, "Too little received");
        IERC20(p.tokenOut).transfer(p.recipient, out);
    }
}
