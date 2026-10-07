"use strict";
/**
 * BotGuard agent SDK.
 * The agent signs with its OWN key; funds stay in the owner's AgentVault. The SDK
 * pre-checks every action against the owner's policy so an agent can fail fast
 * (and explain why) instead of burning gas on a transaction that will revert.
 */
const { Contract, Interface, ZeroAddress, id: keccakText, getAddress, isAddress, isHexString } = require("ethers");

const VAULT_ABI = [
  "function pay(address owner, address token, address to, uint256 amount)",
  "function callTarget(address owner, address target, uint256 amount, bytes data)",
  "function swapExactIn(address owner, address router, address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256 amountOut)",
  "function balances(address owner, address token) view returns (uint256)",
  "function agentEnabled(address owner, address agent) view returns (bool)",
  "function policies(address owner, address agent, address token) view returns (uint256 dailyLimit, uint256 perTxLimit, uint256 spentInWindow, uint64 windowStart, uint64 expiresAt)",
  "function allowedDestination(address owner, address agent, address destination) view returns (bool)",
  "function allowedOutputToken(address owner, address agent, address token) view returns (bool)",
  "function remainingBudget(address owner, address agent, address token) view returns (uint256)",
  "error ZeroAmount()", "error ZeroAddress()", "error InsufficientBalance()", "error AgentNotEnabled()",
  "error NoPolicy()", "error PolicyExpired()", "error InvalidPolicy()", "error PerTxLimitExceeded()",
  "error DailyLimitExceeded()", "error DestinationNotAllowed()", "error TransferFailed()",
  "error NativeNotSupported()", "error SameToken()", "error OutputTokenNotAllowed()",
  "error SlippageExceeded()", "error RouterOverspent()",
];

const POT_ABI = [
  "function commit(bytes32 promptHash, bytes32 outputHash, string model) returns (uint256 id)",
  "function verify(address agent, bytes32 promptHash, bytes32 outputHash) view returns (bool found, uint256 id, uint64 timestamp)",
  "event ReceiptCommitted(uint256 indexed id, address indexed agent, bytes32 indexed outputHash, bytes32 promptHash, string model)",
  "error AlreadyCommitted(uint256 id)", "error EmptyHash()", "error ModelTooLong()",
];

const REASONS = {
  AgentNotEnabled: "the owner has not enabled (or has revoked) this agent",
  NoPolicy: "the owner set no policy for this token",
  PolicyExpired: "the agent's policy has expired",
  PerTxLimitExceeded: "amount is above the per-transaction limit",
  DailyLimitExceeded: "amount would exceed the remaining daily budget",
  DestinationNotAllowed: "the destination is not on the owner's allowlist",
  InsufficientBalance: "the owner's vault balance is too low",
  OutputTokenNotAllowed: "the output token is not on the owner's allowlist",
  SlippageExceeded: "swap returned less than minAmountOut",
  AlreadyCommitted: "this exact prompt/output pair was already committed by this agent",
};

/** Hash text the same way on every machine (keccak256 of UTF-8). */
function hashText(text) {
  return keccakText(String(text));
}

const ERROR_IFACE = new Interface([...VAULT_ABI, ...POT_ABI].filter((f) => f.startsWith("error ")));

/** Turn any contract/ethers error into a short human reason. */
function explain(err) {
  let name = err?.revert?.name || err?.errorName;
  if (!name) {
    // Some nodes (and Hardhat's in-process network) return raw revert data that ethers leaves undecoded.
    const data = [err?.data, err?.error?.data, err?.info?.error?.data].find((d) => typeof d === "string" && d.startsWith("0x"));
    if (data) {
      try { name = ERROR_IFACE.parseError(data)?.name; } catch { /* unknown error */ }
    }
  }
  if (name && REASONS[name]) return REASONS[name];
  if (name) return name;
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

class BotGuardAgent {
  /**
   * @param {object} o
   * @param {import("ethers").Signer} o.signer  the AGENT's signer (never the owner's)
   * @param {string} o.vault  AgentVault address
   * @param {string} o.owner  the owner whose funds this agent may spend
   * @param {string} [o.pot]  ProofOfThought address (needed for receipts)
   */
  constructor({ signer, vault, owner, pot }) {
    for (const [k, v] of Object.entries({ vault, owner })) {
      if (!isAddress(v)) throw new Error(`BotGuardAgent: ${k} must be an address`);
    }
    if (pot && !isAddress(pot)) throw new Error("BotGuardAgent: pot must be an address");
    this.signer = signer;
    this.owner = getAddress(owner);
    this.vault = new Contract(vault, VAULT_ABI, signer);
    this.pot = pot ? new Contract(pot, POT_ABI, signer) : null;
  }

  get address() { return this.signer.getAddress(); }

  /** Amount the agent may still spend in this window (0 if revoked/expired/no policy). */
  async remainingBudget(token = ZeroAddress) {
    return this.vault.remainingBudget(this.owner, await this.address, token);
  }

  /**
   * Pre-flight check. Never sends a transaction.
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  async canSpend({ token = ZeroAddress, to, amount }) {
    const me = await this.address;
    amount = BigInt(amount);
    if (amount === 0n) return { ok: false, reason: "amount is zero" };
    if (!(await this.vault.agentEnabled(this.owner, me))) return { ok: false, reason: REASONS.AgentNotEnabled };
    const p = await this.vault.policies(this.owner, me, token);
    if (p.dailyLimit === 0n) return { ok: false, reason: REASONS.NoPolicy };
    const now = BigInt((await this.signer.provider.getBlock("latest")).timestamp);
    if (p.expiresAt !== 0n && now > p.expiresAt) return { ok: false, reason: REASONS.PolicyExpired };
    if (amount > p.perTxLimit) return { ok: false, reason: REASONS.PerTxLimitExceeded };
    if (amount > (await this.remainingBudget(token))) return { ok: false, reason: REASONS.DailyLimitExceeded };
    if (to && !(await this.vault.allowedDestination(this.owner, me, to))) return { ok: false, reason: REASONS.DestinationNotAllowed };
    if (amount > (await this.vault.balances(this.owner, token))) return { ok: false, reason: REASONS.InsufficientBalance };
    return { ok: true };
  }

  async _send(label, check, fn) {
    if (check) {
      const r = await this.canSpend(check);
      if (!r.ok) throw new Error(`${label} blocked before sending: ${r.reason}`);
    }
    try {
      const tx = await fn();
      return await tx.wait();
    } catch (e) {
      throw new Error(`${label} failed: ${explain(e)}`);
    }
  }

  /** Pay `to` from the owner's vault (native BOT when token is ZeroAddress). */
  pay({ token = ZeroAddress, to, amount }) {
    return this._send("pay", { token, to, amount }, () => this.vault.pay(this.owner, token, to, amount));
  }

  /** Call an allowlisted contract, forwarding up to `amount` native BOT. */
  callTarget({ target, amount = 0n, data = "0x" }) {
    if (!isHexString(data)) throw new Error("callTarget: data must be hex");
    return this._send("callTarget", amount > 0n ? { to: target, amount } : null, () =>
      this.vault.callTarget(this.owner, target, amount, data));
  }

  /** Swap vault funds through an allowlisted router; proceeds return to the OWNER's vault. */
  async swapExactIn({ router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline }) {
    if (!(await this.vault.allowedOutputToken(this.owner, await this.address, tokenOut))) {
      throw new Error(`swapExactIn blocked before sending: ${REASONS.OutputTokenNotAllowed}`);
    }
    return this._send("swapExactIn", { token: tokenIn, to: router, amount: amountIn }, () =>
      this.vault.swapExactIn(this.owner, router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline));
  }

  /**
   * Log what the agent was asked and answered. Only hashes go on-chain.
   * @returns {Promise<{id: bigint, txHash: string, promptHash: string, outputHash: string}>}
   */
  async commitThought({ prompt, output, model }) {
    if (!this.pot) throw new Error("commitThought: no ProofOfThought address configured");
    const promptHash = hashText(prompt);
    const outputHash = hashText(output);
    let receipt;
    try {
      receipt = await (await this.pot.commit(promptHash, outputHash, model)).wait();
    } catch (e) {
      throw new Error(`commitThought failed: ${explain(e)}`);
    }
    const iface = new Interface(POT_ABI);
    for (const log of receipt.logs) {
      try {
        const ev = iface.parseLog(log);
        if (ev?.name === "ReceiptCommitted") return { id: ev.args.id, txHash: receipt.hash, promptHash, outputHash };
      } catch { /* not ours */ }
    }
    throw new Error("commitThought: receipt event not found");
  }

  /** Check a (prompt, output) pair for this agent, or another via `agent`. */
  async verifyThought({ prompt, output, agent }) {
    if (!this.pot) throw new Error("verifyThought: no ProofOfThought address configured");
    const [found, id, timestamp] = await this.pot.verify(agent || (await this.address), hashText(prompt), hashText(output));
    return { found, id, timestamp };
  }
}

module.exports = { BotGuardAgent, hashText, explain, VAULT_ABI, POT_ABI };
