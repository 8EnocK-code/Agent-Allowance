# botguard-sdk

Agent-side helper for BotGuard. The agent signs with **its own key**; money stays in the owner's `AgentVault`.

```js
const { BotGuardAgent } = require("botguard-sdk");
const agent = new BotGuardAgent({ signer, vault, pot, owner });

await agent.remainingBudget();                          // what's left today
await agent.canSpend({ to, amount });                   // { ok, reason } — never sends a tx
await agent.pay({ to, amount });                        // throws a readable reason if blocked
await agent.swapExactIn({ router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline });
await agent.commitThought({ prompt, output, model });   // hashes only go on-chain → { id, txHash, ... }
await agent.verifyThought({ prompt, output });          // { found, id, timestamp }
```

Every spend is pre-checked against the owner's policy (enabled, expiry, per-tx, daily budget, destination
allowlist, vault balance), so an agent fails fast with a reason instead of wasting gas. The contracts remain the
real enforcement; the SDK is a convenience, not a trust boundary. Run `npm run demo` from the repo root to watch it work.
