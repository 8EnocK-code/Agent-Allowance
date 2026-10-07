# BotGuard guide

BotGuard lets an AI agent spend **your** crypto under limits **you** set, and leaves a verifiable trail of what it was asked and what it answered.

## Roles

| Role | Holds | Can do |
|---|---|---|
| **Owner** (you) | The funds and the rules | Deposit, withdraw, set limits, allowlists, revoke |
| **Agent** (a bot with its own key) | Only a small gas balance | Spend inside your limits, commit receipts |

The agent never holds your keys or your funds. It can only call the vault, and the vault enforces your rules.

## Rules you can set (per agent, per token)

- **Daily limit**: a rolling 24h budget. It is a fixed window that restarts on the first spend after it expires, so up to the limit can be spent just before and just after a reset.
- **Per-transaction limit**: no single payment above this.
- **Expiry** (optional): the policy stops working after this time.
- **Destination allowlist**: the agent can only pay or call addresses you approve. The BDEX router goes here too.
- **Swap output allowlist**: the only tokens a swap may return. Swap proceeds go back into **your** vault balance.

Token address `0x0` means native BOT.

## Path 1: try it locally (no wallet, no funds)

```bash
npm install
npm test          # contract + SDK tests
npm run demo      # full story on a local chain
```

If Hardhat cannot download its compiler on your network, prefix with `USE_SOLCJS=1`.

## Path 2: deploy to a chain

1. `cp .env.example .env` and fill in a **dedicated deployer key** (never your main wallet).
2. Testnet first: set `TESTNET_RPC_URL` (chain ID 968), get test BOT from the faucet, then `npm run deploy:testnet`.
3. Addresses land in `deployments/<network>.json`. Verify with `npm run verify:testnet`.
4. Exercise every function on testnet (deposit, policy, pay, revoke, withdraw, receipts) before touching mainnet.
5. Read `SECURITY.md`. The contracts are **unaudited**; only use amounts you can afford to lose.

## Using the owner console

```bash
cd frontend && npm install
cp .env.example .env.local     # VITE_VAULT_ADDRESS, VITE_POT_ADDRESS
npm run dev
```

To host it: import the repo in Vercel, set **Root Directory** to `frontend`, add the two env vars, deploy.

- **Vault**: check balance, deposit, withdraw.
- **Agents**: set or load a policy, manage allowlists, revoke.
- **Receipts**: paste a prompt and output to check they were committed unaltered, or look up a receipt by ID.

## Writing an agent

```js
const { BotGuardAgent } = require("./sdk");
const agent = new BotGuardAgent({ signer, vault, pot, owner });

const check = await agent.canSpend({ to, amount });   // { ok, reason }, sends nothing
if (check.ok) await agent.pay({ to, amount });

await agent.commitThought({ prompt, output, model }); // only hashes go on-chain
```

Give the agent its **own** key. Fund it with a little gas only. See `sdk/README.md` for the full API.

## Receipts: what they prove and don't

A receipt proves that this exact prompt and output hash were committed by this agent at a given time, so a later edit is detectable. It does **not** prove the answer was correct, that the model named was really used, or that the agent acted on it.

## Troubleshooting

| Message | Meaning |
|---|---|
| owner has not enabled (or has revoked) this agent | No active policy, or you revoked it |
| above the per-transaction limit | Lower the amount or raise the cap |
| exceed the remaining daily budget | Wait for the window to reset or raise the limit |
| destination is not on the allowlist | Add it with `setDestination` |
| already committed | That exact prompt/output pair was logged by this agent before |
