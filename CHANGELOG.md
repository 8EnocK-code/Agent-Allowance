# Changelog

## v0.1.3 (testnet wiring)

- Default testnet RPC `https://rpc.bohr.life` and explorer `https://scan.bohr.life` from the BOT Chain quick guide (verified live, chain ID 968). Env vars now only override.
- Deploy script prints testnet explorer links on `botTestnet`.
- Faucet links point to `https://faucet.botchain.ai/basic`.

## v0.1.2 (testnet-first)

Testnet-only. No contract changes.

- Frontend targets BOT Chain Testnet (968); mainnet config parked in `BOT_MAINNET`.
- Testnet RPC comes from `VITE_TESTNET_RPC_URL`; auto-add falls back to a manual-setup message when unset.
- `npm run deploy` / `npm run verify` default to testnet; deploy script errors clearly when `TESTNET_RPC_URL` is missing.
- Docs (README, GUIDE, `.env.example` files) rewritten testnet-first; mainnet parked until testnet validation.
- Removed remaining em dashes in app copy.

## v0.1.1 (polish)

Frontend + docs polish. No contract changes (no re-audit surface).

- Frontend: full custom-error map, `Switch` / `Disconnect`, account + network listeners, `localStorage` address persistence, amount + policy validation (per-tx ≤ daily, future expiry), explorer links, copy buttons, live hash preview, receipt count, footer links, meta + favicon, missing `.mono` / verdict styles.
- ABIs: include agent entry points (`pay`, `callTarget`, `swapExactIn`, `commit`) and events for reuse.
- Docs: BOT Chain reference table (RPC, faucet, DEX, bridge, wallet, WBOT/USDT, Universal Routers, bundlers), manual network setup, expanded troubleshooting + FAQ, complete SDK API.
- `frontend/.env.example`: documents UI paste fallback.

First public pre-release. **Unaudited. Not yet exercised against a live BOT Chain deployment.**

- `AgentVault`: deposits, withdrawals, per-agent policies (daily cap, per-tx cap, expiry), destination and swap-output allowlists, instant revoke.
- `ProofOfThought`: on-chain commitments of prompt/output hashes with verification.
- BDEX swap integration (`swapExactIn`), targeting the Uniswap-V3 router ABI. Router signature unconfirmed on chain.
- Deploy and verify scripts for BOT Chain mainnet and testnet.
- Owner console (`frontend/`): Vite + React + ethers v6.
- Agent SDK (`sdk/`) with pre-flight checks, readable errors, and receipts. End-to-end `npm run demo`.
- 45 tests (36 contract, 9 SDK), mock tokens and router only.
- Optional `USE_SOLCJS=1` fallback for restricted networks.
