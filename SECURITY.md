# Security notes

**These contracts are unaudited.** Do not hold meaningful funds in them until they have been compiled, fully tested, reviewed, and ideally audited.

## Design properties
- Owner funds are tracked per owner; an agent can only spend from the owner that authorised it.
- Effects (budget and balance updates) happen before external calls; state-changing entry points use `ReentrancyGuard`.
- `callTarget` never grants ERC-20 approvals, so a called target can receive only the native value the agent was budgeted. `swapExactIn` approves the router for exactly `amountIn` during the call and resets it to zero afterwards.
- Swap proceeds are credited to the owner's vault balance; the agent never receives tokens. Output tokens and routers must both be allowlisted by the owner.
- Owners can always withdraw, even after revoking an agent.
- Plain transfers to the vault revert, so funds are never unattributed.
- Deposits credit the amount actually received (safe with fee-on-transfer tokens).

## Known limitations and assumptions
- `callTarget` forwards arbitrary calldata to an allowlisted target. Only allowlist contracts you trust.
- The 24h budget is a fixed window that restarts on first spend after expiry, not a true sliding window; an agent can spend up to the limit near the end of one window and again right after it resets.
- Rebasing and other non-standard tokens are not supported.
- Native recipients that need more than the forwarded gas are not specially handled.
- `evmVersion` is set to `paris` because BOT Chain's supported EVM version is not documented in the integration guide.

- `swapExactIn` requires `minAmountOut > 0` but the agent picks the value, so a careless or compromised agent can accept a bad price (sandwich risk). Keep per-tx limits small and only allowlist liquid output tokens.
- Swaps charge the full `amountIn` against the daily budget even on a partial fill (the unused input is refunded to the balance, not the budget).
- Only ERC-20 swaps are supported. Native BOT must be wrapped to WBOT first.
- The swap targets the Uniswap-V3 `SwapRouter` ABI; confirm BDEX matches before mainnet use.

- The SDK's pre-flight checks are a convenience for honest agents, not a trust boundary. The contracts are the only enforcement.

## Pre-testnet checklist
- [x] `npm test` passes (45 tests, mocks only)
- [ ] Set `TESTNET_RPC_URL`, fund deployer with test BOT from the faucet
- [ ] Deploy to testnet and exercise every function
- [ ] Run Slither (`slither .`) and resolve findings
- [ ] Add fuzz/invariant tests (balances never negative, spend never exceeds limits)
- [ ] Independent review or audit before any mainnet use

## Reporting
Open a private security advisory on the repository.
