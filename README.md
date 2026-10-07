# BotGuard

A safe wallet layer for AI agents on **BOT Chain** (EVM, chain ID 677).

- **AgentVault**: you deposit BOT or ERC-20s and give an agent a hard budget (per-transaction cap, rolling 24h limit, destination allowlist, optional expiry). The agent never holds your keys. Revoke instantly, withdraw any time.
- **ProofOfThought**: agents commit hashes of their prompt and output on-chain, so anyone can later verify an AI answer existed, unaltered, at a given time. Only hashes are stored.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Repo foundation, Hardhat config | done |
| 1 | `AgentVault`, `ProofOfThought` | done |
| 2 | Tests, security notes | done (see "Not yet run") |
| 3 | Deploy and verify scripts | done |
| 4 | BDEX swap integration | planned |
| 5 | Front end | planned |
| 6 | Agent SDK and demo | planned |
| 7 | Docs and release | planned |
| 8 | ERC-4337 session keys | optional |

**Not yet run:** the code was written without network access, so it has not been compiled or tested. Run `npm test` before trusting it.

## Quick start

```bash
npm install
cp .env.example .env     # fill in PRIVATE_KEY (use a dedicated deployer key)
npm run compile
npm test
```

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
5. Agent: `ProofOfThought.commit(promptHash, outputHash, model)` to log what it did
6. Owner: `revokeAgent(agent)` to cut access instantly

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
