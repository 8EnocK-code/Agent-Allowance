export const BOT_CHAIN = {
  chainId: 677,
  hex: "0x2a5",
  params: {
    chainId: "0x2a5",
    chainName: "BOT Chain",
    rpcUrls: ["https://rpc.botchain.ai"],
    blockExplorerUrls: ["https://scan.botchain.ai"],
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
};

export const BOT_CHAIN_TESTNET = {
  chainId: 968,
  hex: "0x3c8",
  params: {
    chainId: "0x3c8",
    chainName: "BOT Chain Testnet",
    rpcUrls: [],
    blockExplorerUrls: ["https://scan.botchain.ai"],
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
};

export const EXPLORER = "https://scan.botchain.ai";
export const addressUrl = (a) => `${EXPLORER}/address/${a}`;
export const txUrl = (h) => `${EXPLORER}/tx/${h}`;

export async function ensureBotChain(eth) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BOT_CHAIN.hex }] });
  } catch (e) {
    if (e.code === 4902 || e?.error?.code === 4902) {
      await eth.request({ method: "wallet_addEthereumChain", params: [BOT_CHAIN.params] });
    } else throw e;
  }
}

// Turn contract custom errors into something a human can act on.
// Covers every custom error in AgentVault.sol and ProofOfThought.sol.
const ERR = {
  ZeroAmount: "Amount must be greater than zero.",
  ZeroAddress: "An address field is empty or zero.",
  InsufficientBalance: "Not enough vault balance for this action.",
  AgentNotEnabled: "This agent is not enabled (or was revoked). Set a policy first.",
  NoPolicy: "No policy for this agent + token. Set a policy first.",
  PolicyExpired: "This agent's policy has expired. Set a new one.",
  InvalidPolicy: "Invalid policy: limits must be > 0, per-tx ≤ daily, expiry in the future.",
  PerTxLimitExceeded: "Above the per-transaction limit. Lower the amount or raise the cap.",
  DailyLimitExceeded: "Would exceed the remaining 24h budget. Wait for reset or raise the limit.",
  DestinationNotAllowed: "Destination is not allowlisted. Add it under Agents → Allowlists.",
  OutputTokenNotAllowed: "Output token is not allowlisted. Add it under Agents → Allowlists.",
  TransferFailed: "Native transfer failed (recipient may reject BOT).",
  DirectTransferNotAllowed: "Send funds via Deposit, not a plain transfer.",
  NativeNotSupported: "Native BOT isn't supported here — wrap to WBOT first.",
  SameToken: "Input and output tokens must differ.",
  SlippageExceeded: "Swap returned less than the minimum. Try a higher slippage tolerance.",
  RouterOverspent: "Router pulled more than approved. Aborted for safety.",
  AlreadyCommitted: "This exact prompt/output pair was already committed by this agent.",
  EmptyHash: "Prompt and output must not be empty.",
  ModelTooLong: "Model label is too long (max 64 characters).",
  UnknownReceipt: "No receipt with that ID.",
};
export function niceError(e) {
  const direct = e?.revert?.name || e?.errorName || e?.error?.name;
  if (direct && ERR[direct]) return ERR[direct];
  // ethers v6 / MetaMask often embed the custom error name in the message string.
  const hay = `${e?.shortMessage || ""} ${e?.reason || ""} ${e?.message || ""}`;
  for (const name of Object.keys(ERR)) {
    if (hay.includes(name)) return ERR[name];
  }
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Rejected in wallet.";
  if (e?.code === "INSUFFICIENT_FUNDS" || hay.includes("insufficient funds")) return "Not enough gas (BOT) in your wallet.";
  if (e?.code === "NETWORK_ERROR" || hay.includes("could not detect network")) return "Network error. Check your RPC connection.";
  return e?.shortMessage || e?.reason || e?.message || String(e);
}
