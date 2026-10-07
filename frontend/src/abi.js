// Human-readable ABIs, matching contracts/AgentVault.sol and contracts/ProofOfThought.sol.
// The owner console only sends owner transactions, but agent entry points are
// included so reads / simulations stay accurate if reused elsewhere.
export const VAULT_ABI = [
  "function depositNative() payable",
  "function depositToken(address token, uint256 amount)",
  "function withdraw(address token, uint256 amount)",
  "function setPolicy(address agent, address token, uint256 dailyLimit, uint256 perTxLimit, uint64 expiresAt)",
  "function setDestination(address agent, address destination, bool allowed)",
  "function setOutputToken(address agent, address token, bool allowed)",
  "function revokeAgent(address agent)",
  "function pay(address owner, address token, address to, uint256 amount)",
  "function callTarget(address owner, address target, uint256 amount, bytes data)",
  "function swapExactIn(address owner, address router, address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256)",
  "function balances(address owner, address token) view returns (uint256)",
  "function agentEnabled(address owner, address agent) view returns (bool)",
  "function policies(address owner, address agent, address token) view returns (uint256 dailyLimit, uint256 perTxLimit, uint256 spentInWindow, uint64 windowStart, uint64 expiresAt)",
  "function allowedDestination(address owner, address agent, address destination) view returns (bool)",
  "function allowedOutputToken(address owner, address agent, address token) view returns (bool)",
  "function remainingBudget(address owner, address agent, address token) view returns (uint256)",
  "event Deposited(address indexed owner, address indexed token, uint256 amount)",
  "event Withdrawn(address indexed owner, address indexed token, uint256 amount)",
  "event PolicySet(address indexed owner, address indexed agent, address indexed token, uint256 dailyLimit, uint256 perTxLimit, uint64 expiresAt)",
  "event AgentRevoked(address indexed owner, address indexed agent)",
];

export const POT_ABI = [
  "function commit(bytes32 promptHash, bytes32 outputHash, string model)",
  "function receiptCount() view returns (uint256)",
  "function verify(address agent, bytes32 promptHash, bytes32 outputHash) view returns (bool found, uint256 id, uint64 timestamp)",
  "function getReceipt(uint256 id) view returns (tuple(address agent, uint64 timestamp, bytes32 promptHash, bytes32 outputHash, string model))",
  "event ReceiptCommitted(uint256 indexed id, address indexed agent, bytes32 indexed outputHash, bytes32 promptHash, string model)",
];

export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
