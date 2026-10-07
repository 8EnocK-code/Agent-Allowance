# Security notes

**These contracts are unaudited.** Do not hold meaningful funds in them until they have been compiled, fully tested, reviewed, and ideally audited.

## Design properties
- Owner funds are tracked per owner; an agent can only spend from the owner that authorised it.
- Effects (budget and balance updates) happen before external calls; state-changing entry points use `ReentrancyGuard`.
- The vault never grants ERC-20 approvals, so a called target can receive only the native value the agent was budgeted.
- Owners can always withdraw, even after revoking an agent.
- Plain transfers to the vault revert, so funds are never unattributed.
- Deposits credit the amount actually received (safe with fee-on-transfer tokens).

## Known limitations and assumptions
- `callTarget` forwards arbitrary calldata to an allowlisted target. Only allowlist contracts you trust.
- The 24h budget is a fixed window that restarts on first spend after expiry, not a true sliding window; an agent can spend up to the limit near the end of one window and again right after it resets.
- Rebasing and other non-standard tokens are not supported.
- Native recipients that need more than the forwarded gas are not specially handled.
- `evmVersion` is set to `paris` because BOT Chain's supported EVM version is not documented in the integration guide.

## Pre-mainnet checklist
- [ ] `npm test` passes
- [ ] Run Slither (`slither .`) and resolve findings
- [ ] Add fuzz/invariant tests (balances never negative, spend never exceeds limits)
- [ ] Deploy to testnet and exercise every function
- [ ] Independent review or audit

## Reporting
Open a private security advisory on the repository.
