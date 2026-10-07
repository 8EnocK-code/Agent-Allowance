# Changelog

## v0.1.0 (pre-release)

First public pre-release. **Unaudited. Not yet exercised against a live BOT Chain deployment.**

- `AgentVault`: deposits, withdrawals, per-agent policies (daily cap, per-tx cap, expiry), destination and swap-output allowlists, instant revoke.
- `ProofOfThought`: on-chain commitments of prompt/output hashes with verification.
- BDEX swap integration (`swapExactIn`), targeting the Uniswap-V3 router ABI. Router signature unconfirmed on chain.
- Deploy and verify scripts for BOT Chain mainnet and testnet.
- Owner console (`frontend/`): Vite + React + ethers v6.
- Agent SDK (`sdk/`) with pre-flight checks, readable errors, and receipts. End-to-end `npm run demo`.
- 45 tests (36 contract, 9 SDK), mock tokens and router only.
- Optional `USE_SOLCJS=1` fallback for restricted networks.
