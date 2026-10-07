# botguard-sdk

Agent-side helper for BotGuard. The agent signs with **its own key**; money stays in the owner's `AgentVault`.

```js
const { BotGuardAgent } = require("botguard-sdk");
const agent = new BotGuardAgent({ signer, vault, pot, owner });

await agent.remainingBudget();                          // what's left today (native BOT by default)
await agent.remainingBudget(token);                     // …for an ERC-20
await agent.canSpend({ to, amount });                   // { ok, reason } — never sends a tx
await agent.pay({ to, amount });                        // throws a readable reason if blocked
await agent.callTarget({ target, amount, data });       // call an allowlisted contract with native BOT
await agent.swapExactIn({ router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline });
await agent.commitThought({ prompt, output, model });   // hashes only go on-chain → { id, txHash, ... }
await agent.verifyThought({ prompt, output });          // { found, id, timestamp }
await agent.verifyThought({ prompt, output, agent });  // …for another agent
```

Every spend is pre-checked against the owner's policy (enabled, expiry, per-tx, daily budget, destination
allowlist, vault balance), so an agent fails fast with a reason instead of wasting gas. The contracts remain the
real enforcement; the SDK is a convenience, not a trust boundary. Run `npm run demo` from the repo root to watch it work.

## Constructor

`new BotGuardAgent({ signer, vault, owner, pot? })`

- `signer`: the **agent's** ethers signer (never the owner's key).
- `vault`: `AgentVault` address. `owner`: the funder's address. Both must be valid addresses.
- `pot`: `ProofOfThought` address (only needed for `commitThought` / `verifyThought`).

## Methods

| Method | Sends tx? | Notes |
|---|---|---|
| `remainingBudget(token = ZeroAddress)` | no | Returns `bigint`. 0 if revoked / expired / no policy. |
| `canSpend({ token, to, amount })` | no | `{ ok: true }` or `{ ok: false, reason }`. `amount` may be bigint, number, or string. |
| `pay({ token, to, amount })` | yes | Pre-checks first; throws `pay blocked before sending: <reason>` if it would revert. |
| `callTarget({ target, amount, data })` | yes | `data` must be hex (`"0x…"`) . Pre-checks only when `amount > 0`. |
| `swapExactIn({ router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline })` | yes | Checks output-token allowlist, then policy + router allowlist. Proceeds return to the **owner's** vault. ERC-20 only. |
| `commitThought({ prompt, output, model })` | yes | Hashes with keccak256(UTF-8), commits, returns `{ id, txHash, promptHash, outputHash }`. Throws readable `AlreadyCommitted` / `EmptyHash` / `ModelTooLong`. |
| `verifyThought({ prompt, output, agent? })` | no | Returns `{ found, id, timestamp }`. Defaults to the agent's own address. |
| `hashText(text)` / `explain(err)` | — | Exported helpers. `hashText` matches the frontend (`keccak256` of UTF-8). `explain` maps revert data to short reasons. |

`token` defaults to `ZeroAddress` (native BOT). `fee` is the Uniswap-V3 pool fee (e.g. `3000` = 0.3%). `deadline` is a unix timestamp.

## Errors

Thrown errors are plain `Error`s with a human prefix:

- `pay blocked before sending: <reason>` — pre-flight failed, nothing was sent.
- `pay failed: <reason>` — on-chain revert, decoded where possible.
- Same pattern for `callTarget`, `swapExactIn`, `commitThought`.

Reasons come from the contract's custom errors (`AgentNotEnabled`, `PerTxLimitExceeded`, `DailyLimitExceeded`, `DestinationNotAllowed`, `OutputTokenNotAllowed`, `AlreadyCommitted`, …). See `docs/GUIDE.md` troubleshooting for fixes.
