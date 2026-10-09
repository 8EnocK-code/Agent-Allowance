# BotGuard

A safe wallet layer for AI agents on **BOT Chain testnet** (EVM, chain ID 968). Mainnet (677) comes later, after testnet validation.

- **AgentVault**: deposit BOT or ERC-20s, give an agent a hard budget (per-transaction cap, rolling 24h limit, destination allowlist, optional expiry). The agent never holds your keys. Revoke instantly, withdraw any time.
- **ProofOfThought**: agents commit hashes of prompt + output on-chain, so anyone can later verify an AI answer existed, unaltered, at a given time. Only hashes are stored.

**Live demo (BOT Chain Testnet): https://botguard-two.vercel.app/**

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
| 7 | Docs and release | done (v0.1.1 polished) |
| 8 | ERC-4337 session keys | optional |

**Test status:** 45 tests pass (36 contract, 9 SDK; solc 0.8.24, `paris` target). Tests use mock tokens and a mock router, so nothing has run against BOT Chain yet. If Hardhat can't download its compiler, run with `USE_SOLCJS=1`.

**Phase 4 caveat:** `swapExactIn` targets the Uniswap-V3 `SwapRouter` ABI (`exactInputSingle` with `deadline`). BDEX lists a V3 `swapRouter` in the integration guide, but the exact signature is not confirmed. Check it on https://scan.botchain.ai before mainnet use. Addresses are in `config/bdex.json`.

Full walkthrough: [`docs/GUIDE.md`](docs/GUIDE.md) · Security: [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md)

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

## Front end (owner console)

```bash
cd frontend
npm install
cp .env.example .env.local   # VITE_VAULT_ADDRESS, VITE_POT_ADDRESS from deployments/<network>.json
npm run dev
```

Vite + React + ethers v6. Connects a wallet, switches to BOT Chain Testnet (968), and covers:

- **Vault**: check balance, deposit, withdraw (with amount validation and explorer links)
- **Agents**: set or load a policy (with per-tx ≤ daily and expiry checks), manage allowlists, revoke
- **Receipts**: live hash preview, verify prompt/output pairs, look up receipts by ID with copy buttons

Addresses persist in `localStorage`, wallet account/network changes are tracked, and every contract error maps to a human-readable message. To host it: import the repo in Vercel, set **Root Directory** to `frontend`, add the two env vars, deploy.

## Deploy (testnet first)

```bash
npm run deploy            # testnet (RPC defaults to https://rpc.bohr.life, chain ID 968)
npm run deploy:testnet     # same as above
npm run verify            # verify on the testnet explorer, if supported
```

Get test BOT from https://faucet.botchain.ai first. Addresses are written to `deployments/botTestnet.json`. Paste them into the frontend config (or `frontend/.env.local`).

Mainnet (`npm run deploy:mainnet`, chain ID 677) is parked until testnet validation is complete.

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
| Testnet RPC | https://rpc.bohr.life (override with `TESTNET_RPC_URL`) |
| Testnet explorer | https://scan.bohr.life |
| Testnet faucet | https://faucet.botchain.ai/basic |
| Mainnet RPC (parked) | https://rpc.botchain.ai |
| Chain ID | 968 testnet (677 mainnet, parked) |
| Explorer | https://scan.botchain.ai |
| Faucet (test BOT) | https://faucet.botchain.ai |
| Website | https://www.botchain.ai |
| Wallet | https://wallet.botchain.ai |
| DEX | https://dex.botchain.ai/#/swap |
| Bridge | https://bridge.botchain.ai |
| Developer docs | https://dev-docs.botchain.ai/docs/Developers/quick-guide/ |
| WBOT | `0xD5452816194a3784dBa983426cCe7c122F4abd30` |
| USDT | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` |
| BDEX Universal Router (mainnet) | `0xaE6ae8630f7A888dEc0B9195C85F7515d5887655` |
| BDEX Universal Router (testnet) | `0x73Be0A1d8011B335A7aBeF6c45544E8ca4448AB5` |
| ERC-4337 bundler (mainnet) | https://bundler.botchain.ai/rpc |
| ERC-4337 bundler (testnet) | https://bundler.bohr.life/rpc |

Manual wallet entry (testnet): Name `BOT Chain Testnet`, RPC `https://rpc.bohr.life`, Chain ID `968`, Symbol `BOT`, Explorer `https://scan.bohr.life`. Mainnet entry (parked): RPC `https://rpc.botchain.ai`, Chain ID `677`, Explorer `https://scan.botchain.ai`. Or add via https://chainlist.org/?search=bot+chain&testnets=true.

## License

MIT
