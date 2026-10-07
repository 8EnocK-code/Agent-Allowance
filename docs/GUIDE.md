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
- **Per-transaction limit**: no single payment above this (must be ≤ daily limit).
- **Expiry** (optional): the policy stops working after this time. Empty means never.
- **Destination allowlist**: the agent can only pay or call addresses you approve. The BDEX router goes here too.
- **Swap output allowlist**: the only tokens a swap may return. Swap proceeds go back into **your** vault balance.

Token address `0x0` (empty in the UI) means native BOT.

## Add BOT Chain to your wallet

BOT Chain is EVM-compatible. Any EVM wallet works (MetaMask, OKX, Bitget, TokenPocket).

**Option A — Chainlist:** visit https://chainlist.org/?search=bot+chain&testnets=true, connect, add BOT Chain.

**Option B — manual (testnet):**

| Field | BOT Chain Testnet |
|---|---|
| Network name | BOT Chain Testnet |
| RPC URL | https://rpc.bohr.life |
| Chain ID | 968 |
| Currency symbol | BOT |
| Explorer | https://scan.bohr.life |

Get test BOT at https://faucet.botchain.ai/basic. Mainnet (chain ID 677, RPC https://rpc.botchain.ai) is parked until testnet validation is complete.

## Path 1: try it locally (no wallet, no funds)

```bash
npm install
npm test          # contract + SDK tests
npm run demo      # full story on a local chain
```

If Hardhat cannot download its compiler on your network, prefix with `USE_SOLCJS=1`.

## Path 2: deploy to BOT Chain

1. `cp .env.example .env` and fill in a **dedicated deployer key** (never your main wallet). Testnet RPC defaults to https://rpc.bohr.life (override with `TESTNET_RPC_URL`).
2. Get test BOT from https://faucet.botchain.ai/basic, then `npm run deploy` (testnet).
3. Addresses land in `deployments/botTestnet.json`. Verify with `npm run verify` (needs an Etherscan-compatible API; otherwise verify manually on the explorer with `npx hardhat flatten` output).
4. Exercise every function on testnet (deposit, policy, pay, revoke, withdraw, receipts) before even thinking about mainnet.
5. Mainnet deploy (`npm run deploy:mainnet`, chain ID 677) stays parked until testnet validation is complete.
6. Read `SECURITY.md`. The contracts are **unaudited**; testnet only for now.

Key addresses (verify on the explorer before use):

| | Testnet (968) |
|---|---|
| BDEX Universal Router | `0x73Be0A1d8011B335A7aBeF6c45544E8ca4448AB5` |

Mainnet addresses (WBOT, USDT, mainnet router) are parked in `config/bdex.json` until launch.

## Using the owner console

```bash
cd frontend && npm install
cp .env.example .env.local     # VITE_VAULT_ADDRESS, VITE_POT_ADDRESS
npm run dev
```

To host it: import the repo in Vercel, set **Root Directory** to `frontend`, add the two env vars, deploy. Addresses you paste in the page are saved in the browser.

- **Vault**: check balance, deposit, withdraw. Amounts are validated before sending; explorer links confirm where funds live. Never send BOT directly to the vault — always use Deposit.
- **Agents**: set or load a policy (the UI rejects per-tx > daily and past expiry), manage destination and swap-output allowlists, revoke instantly.
- **Receipts**: live keccak256 preview with copy buttons, verify exact prompt/output pairs, or look up a receipt by ID. Content never leaves your browser — only hashes are compared.

If the header shows the wrong network, use the **Switch** button. Account and network changes in the wallet are picked up automatically.

## Writing an agent

```js
const { BotGuardAgent } = require("./sdk");
const agent = new BotGuardAgent({ signer, vault, pot, owner });

const check = await agent.canSpend({ to, amount });   // { ok, reason }, sends nothing
if (check.ok) await agent.pay({ to, amount });

await agent.commitThought({ prompt, output, model }); // only hashes go on-chain
```

Give the agent its **own** key. Fund it with a little gas only. See `sdk/README.md` for the full API (`pay`, `callTarget`, `swapExactIn`, receipts, pre-flight checks).

For swaps, the owner must allowlist the router as a destination **and** the output token via `setOutputToken`. Proceeds return to the owner's vault. Native BOT must be wrapped to WBOT first; `swapExactIn` is ERC-20 only.

## Receipts: what they prove and don't

A receipt proves that this exact prompt and output hash were committed by this agent at a given time, so a later edit is detectable. It does **not** prove the answer was correct, that the model named was really used, or that the agent acted on it. The first commit of a given (agent, prompt, output) wins — timestamps cannot be moved later.

## Troubleshooting

| Message | Meaning | Fix |
|---|---|---|
| No wallet found | No EVM wallet detected | Install MetaMask / OKX / Bitget / TokenPocket |
| Wrong network | Wallet is not on 968 | Press Switch, or add BOT Chain Testnet manually |
| Amount … is not valid | Bad amount string | Use plain decimals, e.g. `1.5` |
| No policy / Set a policy first | Agent + token has no `dailyLimit` | Call `setPolicy` for that agent + token |
| Not enabled (or was revoked) | `agentEnabled` is false | Save a new policy, or check you used the right owner |
| Above the per-transaction limit | `amount > perTxLimit` | Lower the amount or raise the cap |
| Exceed the remaining daily budget | Window exhausted | Wait for reset or raise the limit |
| Destination is not allowlisted | `allowedDestination` is false | Add it under Agents → Allowlists |
| Output token is not allowlisted | `allowedOutputToken` is false | Add it under Agents → Allowlists |
| Not enough vault balance | Owner's `balances` too low | Deposit first |
| Already committed | Same (agent, prompt, output) logged before | Nothing to do — receipt already exists |
| Rejected in wallet | You rejected the signature | Retry and approve |
| Not enough gas (BOT) | Wallet has no BOT for fees | Fund the signing wallet |
| Native BOT isn't supported here | `swapExactIn` with `0x0` | Wrap to WBOT first |
| Swap returned less than minimum | Slippage / illiquid route | Raise `minAmountOut` tolerance cautiously, keep per-tx limits small |

## FAQ

**Does the agent hold my funds?** No. Funds live in `AgentVault` under your address. The agent only gets permission to trigger capped transfers.

**Can I always get my money out?** Yes. `withdraw` works even after revoking. Revoke disables the agent instantly across all tokens.

**What does expiry do?** After `expiresAt`, the policy reverts with `PolicyExpired`. Re-enable by saving a new policy.

**Why did my swap revert?** Most often: router not allowlisted, output token not allowlisted, `minAmountOut` too high, deadline passed, or BDEX router ABI differs from Uniswap V3. Confirm the router on the explorer before mainnet use.
