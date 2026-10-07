// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/**
 * @title AgentVault
 * @notice A non-custodial "allowance account" for AI agents on BOT Chain.
 *         An owner deposits BOT (native) or ERC-20 tokens and authorises agent
 *         addresses to spend them under hard limits:
 *           - a per-transaction cap
 *           - a rolling 24h budget
 *           - an allowlist of recipients / target contracts
 *           - an optional expiry
 *         The owner can revoke an agent instantly and withdraw at any time.
 *         The agent never holds the owner's funds or keys.
 *         Agents can also swap vault tokens through BDEX (swapExactIn); proceeds stay in the vault.
 *
 *         Token address(0) represents the native coin (BOT).
 */
contract AgentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE = address(0);
    uint64 public constant WINDOW = 1 days;

    struct Policy {
        uint256 dailyLimit;      // max spend per rolling window (0 = no policy)
        uint256 perTxLimit;      // max spend per single action
        uint256 spentInWindow;   // spent so far in the current window
        uint64 windowStart;      // timestamp the current window began
        uint64 expiresAt;        // 0 = never expires
    }

    // owner => token => deposited balance
    mapping(address => mapping(address => uint256)) public balances;
    // owner => agent => enabled
    mapping(address => mapping(address => bool)) public agentEnabled;
    // owner => agent => token => policy
    mapping(address => mapping(address => mapping(address => Policy))) public policies;
    // owner => agent => destination => allowed
    mapping(address => mapping(address => mapping(address => bool))) public allowedDestination;
    // owner => agent => token => allowed as a swap output
    mapping(address => mapping(address => mapping(address => bool))) public allowedOutputToken;

    event Deposited(address indexed owner, address indexed token, uint256 amount);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event PolicySet(
        address indexed owner,
        address indexed agent,
        address indexed token,
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint64 expiresAt
    );
    event OutputTokenSet(address indexed owner, address indexed agent, address indexed token, bool allowed);
    event Swapped(
        address indexed owner,
        address indexed agent,
        address indexed router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event DestinationSet(address indexed owner, address indexed agent, address indexed destination, bool allowed);
    event AgentRevoked(address indexed owner, address indexed agent);
    event Spent(
        address indexed owner,
        address indexed agent,
        address indexed token,
        address to,
        uint256 amount,
        bytes4 selector
    );

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error AgentNotEnabled();
    error NoPolicy();
    error PolicyExpired();
    error InvalidPolicy();
    error PerTxLimitExceeded();
    error DailyLimitExceeded();
    error DestinationNotAllowed();
    error TransferFailed();
    error DirectTransferNotAllowed();
    error NativeNotSupported();
    error SameToken();
    error OutputTokenNotAllowed();
    error SlippageExceeded();
    error RouterOverspent();

    // ---------------------------------------------------------------- owner

    /// @notice Deposit native BOT into your vault balance.
    function depositNative() external payable {
        if (msg.value == 0) revert ZeroAmount();
        balances[msg.sender][NATIVE] += msg.value;
        emit Deposited(msg.sender, NATIVE, msg.value);
    }

    /// @notice Deposit an ERC-20 (requires prior approval). Credits the amount actually received.
    function depositToken(address token, uint256 amount) external nonReentrant {
        if (token == NATIVE) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        balances[msg.sender][token] += received;
        emit Deposited(msg.sender, token, received);
    }

    /// @notice Withdraw native BOT or tokens from your vault balance. Always available.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balances[msg.sender][token];
        if (bal < amount) revert InsufficientBalance();
        balances[msg.sender][token] = bal - amount;
        _send(token, msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Create or replace an agent's spending policy for one token and enable the agent.
    /// @param expiresAt unix time after which the policy stops working (0 = never)
    function setPolicy(
        address agent,
        address token,
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint64 expiresAt
    ) external {
        if (agent == address(0)) revert ZeroAddress();
        if (dailyLimit == 0 || perTxLimit == 0 || perTxLimit > dailyLimit) revert InvalidPolicy();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidPolicy();

        policies[msg.sender][agent][token] = Policy({
            dailyLimit: dailyLimit,
            perTxLimit: perTxLimit,
            spentInWindow: 0,
            windowStart: 0,
            expiresAt: expiresAt
        });
        agentEnabled[msg.sender][agent] = true;
        emit PolicySet(msg.sender, agent, token, dailyLimit, perTxLimit, expiresAt);
    }

    /// @notice Allow or disallow a destination (recipient or contract) for an agent.
    function setDestination(address agent, address destination, bool allowed) external {
        if (agent == address(0) || destination == address(0)) revert ZeroAddress();
        allowedDestination[msg.sender][agent][destination] = allowed;
        emit DestinationSet(msg.sender, agent, destination, allowed);
    }

    /// @notice Allow or disallow a token as the output of agent swaps.
    function setOutputToken(address agent, address token, bool allowed) external {
        if (agent == address(0) || token == address(0)) revert ZeroAddress();
        allowedOutputToken[msg.sender][agent][token] = allowed;
        emit OutputTokenSet(msg.sender, agent, token, allowed);
    }

    /// @notice Instantly disable an agent across all tokens. Re-enable by calling setPolicy again.
    function revokeAgent(address agent) external {
        agentEnabled[msg.sender][agent] = false;
        emit AgentRevoked(msg.sender, agent);
    }

    // --------------------------------------------------------------- agent

    /// @notice Agent sends `amount` of `token` from `owner`'s vault to an allowlisted `to`.
    function pay(address owner, address token, address to, uint256 amount) external nonReentrant {
        _spend(owner, msg.sender, token, to, amount);
        _send(token, to, amount);
        emit Spent(owner, msg.sender, token, to, amount, bytes4(0));
    }

    /// @notice Agent calls an allowlisted contract, attaching native BOT from `owner`'s vault.
    /// @dev The vault never approves ERC-20s to targets, so a target can only ever receive `amount` native BOT.
    function callTarget(address owner, address target, uint256 amount, bytes calldata data)
        external
        nonReentrant
        returns (bytes memory result)
    {
        _spend(owner, msg.sender, NATIVE, target, amount);
        bool ok;
        (ok, result) = target.call{value: amount}(data);
        if (!ok) {
            // bubble up the target's revert reason
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit Spent(owner, msg.sender, NATIVE, target, amount, data.length >= 4 ? bytes4(data[:4]) : bytes4(0));
    }

    /// @notice Agent swaps `amountIn` of `tokenIn` held in `owner`'s vault for `tokenOut` through a
    ///         Uniswap-V3-style router (BDEX). Proceeds are credited back to the owner's vault balance,
    ///         never to the agent.
    /// @dev The router must be an allowlisted destination, `tokenOut` must be an allowlisted output token,
    ///      and `amountIn` counts against the agent's `tokenIn` policy. The router is approved for exactly
    ///      `amountIn` for the duration of the call, then the approval is reset to zero.
    function swapExactIn(
        address owner,
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (tokenIn == NATIVE || tokenOut == NATIVE) revert NativeNotSupported();
        if (tokenIn == tokenOut) revert SameToken();
        if (minAmountOut == 0) revert ZeroAmount();

        // checks agent, policy, router allowlist, limits; deducts amountIn from the owner's balance
        _spend(owner, msg.sender, tokenIn, router, amountIn);
        if (!allowedOutputToken[owner][msg.sender][tokenOut]) revert OutputTokenNotAllowed();

        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).forceApprove(router, amountIn);
        ISwapRouter(router).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(tokenIn).forceApprove(router, 0);

        uint256 spent = inBefore - IERC20(tokenIn).balanceOf(address(this));
        if (spent > amountIn) revert RouterOverspent();
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < minAmountOut) revert SlippageExceeded();

        // credit proceeds, and refund any input the router did not consume (partial fill)
        if (spent < amountIn) balances[owner][tokenIn] += amountIn - spent;
        balances[owner][tokenOut] += amountOut;
        emit Swapped(owner, msg.sender, router, tokenIn, tokenOut, spent, amountOut);
    }

    // ---------------------------------------------------------------- views

    /// @notice How much `agent` can still spend right now for `token` (ignores vault balance).
    function remainingBudget(address owner, address agent, address token) external view returns (uint256) {
        Policy memory p = policies[owner][agent][token];
        if (!agentEnabled[owner][agent] || p.dailyLimit == 0) return 0;
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) return 0;
        if (block.timestamp >= uint256(p.windowStart) + WINDOW) return p.dailyLimit;
        return p.dailyLimit - p.spentInWindow;
    }

    // ------------------------------------------------------------- internal

    function _spend(address owner, address agent, address token, address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (!agentEnabled[owner][agent]) revert AgentNotEnabled();

        Policy storage p = policies[owner][agent][token];
        if (p.dailyLimit == 0) revert NoPolicy();
        if (p.expiresAt != 0 && block.timestamp > p.expiresAt) revert PolicyExpired();
        if (!allowedDestination[owner][agent][to]) revert DestinationNotAllowed();
        if (amount > p.perTxLimit) revert PerTxLimitExceeded();

        if (block.timestamp >= uint256(p.windowStart) + WINDOW) {
            p.windowStart = uint64(block.timestamp);
            p.spentInWindow = 0;
        }
        uint256 newSpent = p.spentInWindow + amount;
        if (newSpent > p.dailyLimit) revert DailyLimitExceeded();

        uint256 bal = balances[owner][token];
        if (bal < amount) revert InsufficientBalance();

        // effects before interactions
        p.spentInWindow = newSpent;
        balances[owner][token] = bal - amount;
    }

    function _send(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @dev Reject accidental plain transfers so funds are always attributed to an owner.
    receive() external payable {
        revert DirectTransferNotAllowed();
    }
}
