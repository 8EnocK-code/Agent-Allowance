# BotGuard

A safe wallet layer for AI agents on **BOT Chain** (EVM, chain ID 677).

- **AgentVault**: you deposit BOT or ERC-20s and give an agent a hard budget (per-transaction cap, rolling 24h limit, destination allowlist, optional expiry). The agent never holds your keys. Revoke instantly, withdraw any time.
- **ProofOfThought**: agents commit hashes of their prompt and output on-chain, so anyone can later verify an AI answer existed, unaltered, at a given time. Only hashes are stored.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Repo foundation, Hardhat config | done |
| 1 | `AgentVault`, `ProofOfThought` | done |
| 2 | Tests, security notes | done |
| 3 | Deploy and verify scripts | done |
| 4 | BDEX swap integration (`swapExactIn`) | done, router ABI unconfirmed on chain |
| 5 | Front end (owner console) | done, builds clean, not yet exercised against a live deployment |
| 6 | Agent SDK + demo | done (SDK tested; swap path covered by contract tests, not the SDK suite) |
| 7 | Docs and release | planned |
| 8 | ERC-4337 session keys | optional |

**Test status:** 36 tests pass (compiled with solc 0.8.24, `paris` target). Tests use mock tokens and a mock router, so nothing has run against BOT Chain yet. The Hardhat compiler download was not reachable from the build sandbox, so the suite was run with solc-js; `npm test` should behave the same on a normal machine.

**Phase 4 caveat:** `swapExactIn` targets the Uniswap-V3 `SwapRouter` ABI (`exactInputSingle` with `deadline`). BDEX lists a V3 `swapRouter` in the integration guide, but the exact signature is not confirmed. Check it on https://scan.botchain.ai before mainnet use. Addresses are in `config/bdex.json`.

## Quick start

```bash
npm install
cp .env.example .env     # fill in PRIVATE_KEY (use a dedicated deployer key)
npm run compile
npm test
```

## Agent SDK and demo

`sdk/` is the agent-side library (see `sdk/README.md`). `npm run demo` runs a full story on a local chain:
fund, set rules, agent commits a receipt, allowed and blocked payments, revoke, withdraw.
If Hardhat can't download its compiler (offline/restricted network), prefix any command with `USE_SOLCJS=1`.

## Front end

```bash
cd frontend
npm install
cp .env.example .env.local   # VITE_VAULT_ADDRESS, VITE_POT_ADDRESS from deployments/<network>.json
npm run dev
```

Vite + React + ethers v6. Connects a wallet, switches to BOT Chain (677), and covers deposit/withdraw, agent policy and allowlists, revoke, and Proof-of-Thought verification. Addresses can also be pasted into the page.

## Deploy

```bash
npm run deploy:testnet   # needs TESTNET_RPC_URL in .env (guide gives chain ID 968 but no RPC)
npm run deploy:mainnet   # https://rpc.botchain.ai, chain ID 677
npm run verify:mainnet
```

Addresses are written to `deployments/<network>.json`.

## How an agent uses it

1. Owner: `depositNative()` or `depositToken(token, amount)`
2. Owner: `setPolicy(agent, token, dailyLimit, perTxLimit, expiresAt)`
3. Owner: `setDestination(agent, recipient, true)`
4. Agent: `pay(owner, token, recipient, amount)` or `callTarget(owner, target, amount, data)`
5. Owner (for swaps): `setOutputToken(agent, tokenOut, true)`, and allowlist the BDEX router with `setDestination`
6. Agent: `swapExactIn(owner, router, tokenIn, tokenOut, fee, amountIn, minAmountOut, deadline)`. Proceeds go back into the owner's vault balance, never to the agent
7. Agent: `ProofOfThought.commit(promptHash, outputHash, model)` to log what it did
8. Owner: `revokeAgent(agent)` to cut access instantly

Token address `0x0` means native BOT.

## BOT Chain reference

| | |
|---|---|
| Mainnet RPC | https://rpc.botchain.ai |
| Chain ID | 677 (testnet 968) |
| Explorer | https://scan.botchain.ai |
| Faucet | https://faucet.botchain.ai |
| WBOT | 0xD5452816194a3784dBa983426cCe7c122F4abd30 |
| USDT | 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C |
| BDEX Universal Router | 0xaE6ae8630f7A888dEc0B9195C85F7515d5887655 |

## License

MIT
