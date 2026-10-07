import { EXPLORER } from "./chain.js";

export default function Landing({ onLaunch }) {
  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="eyebrow"><span className="dot" /> BOT Chain Testnet · Chain ID 968 · EVM Layer 1</span>
            <h1 className="hero-title">Give AI agents a budget, <span>not your keys.</span></h1>
            <p className="hero-sub">
              BotGuard is a non-custodial allowance layer for AI agents on BOT Chain.
              You deposit BOT or ERC-20s, set per-transaction caps, 24-hour budgets,
              allowlists and expiry. The agent operates strictly inside them, and every
              action leaves a verifiable on-chain receipt.
            </p>
            <div className="cta-row">
              <button onClick={onLaunch}>Launch owner console</button>
              <button className="btn-secondary" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
                How it works
              </button>
            </div>
            <div className="hero-meta">
              <span><strong>Non-custodial</strong> · revoke anytime</span>
              <span><strong>45 tests</strong> passing</span>
              <span><strong>Unaudited</strong> pre-release</span>
            </div>
          </div>
          <div className="hero-card">
            <h3>Owner policy · live example</h3>
            <p>The agent can only spend inside these bounds. Anything else reverts.</p>
            <div className="policy-mock">
              <div className="pm-row"><span className="k">Daily limit</span><span className="v">3.0 BOT</span></div>
              <div className="pm-row"><span className="k">Per transaction</span><span className="v">1.0 BOT</span></div>
              <div className="pm-row"><span className="k">Destination</span><span className="v ok">allowlisted only</span></div>
              <div className="pm-row"><span className="k">Revoke</span><span className="v ok">instant</span></div>
              <div className="pm-row"><span className="k">Custody</span><span className="v">owner holds funds</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="trustbar">
        <span>Built for</span>
        <span className="t-pill">BOT Chain testnet · 968</span>
        <span className="t-pill">WBOT · USDT</span>
        <span className="t-pill">BDEX swaps</span>
        <span className="t-pill">Proof-of-Thought receipts</span>
        <a className="explorer" href={EXPLORER} target="_blank" rel="noreferrer">scan.botchain.ai ↗</a>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Controls owners expect, agents can respect</h2>
          <p>Four independent guardrails combine on every spend. No single misconfiguration opens the vault.</p>
        </div>
        <div className="feat-grid">
          <div className="feat"><div className="icon">◈</div><h3>Hard budgets</h3><p>Per-transaction caps plus a rolling 24-hour limit, enforced in the contract, not in the agent's prompt.</p></div>
          <div className="feat"><div className="icon">◎</div><h3>Destination allowlists</h3><p>Agents pay or call only addresses you approve. Swap routers and outputs are allowlisted separately.</p></div>
          <div className="feat"><div className="icon">⬣</div><h3>Instant revoke</h3><p>One transaction disables an agent across every token. Withdrawals always remain available to you.</p></div>
          <div className="feat"><div className="icon">✎</div><h3>Verifiable receipts</h3><p>Prompt and output hashes are committed on-chain. Anyone can confirm an answer existed, unaltered, at a time.</p></div>
          <div className="feat"><div className="icon">⇄</div><h3>Bounded swaps</h3><p>Agents route through BDEX within budget. Proceeds return to your vault, never to the agent.</p></div>
          <div className="feat"><div className="icon">⬢</div><h3>Agent SDK</h3><p>Pre-flight checks explain blocks before gas is spent. Contracts remain the sole enforcement.</p></div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-head">
          <h2>From deposit to audit trail in minutes</h2>
          <p>A standard flow teams use to put an agent into production safely.</p>
        </div>
        <div className="steps">
          <div className="step"><div className="n">01</div><h3>Fund the vault</h3><p>Call <code>depositNative</code> or <code>depositToken</code>. Funds are tracked per owner, never pooled.</p></div>
          <div className="step"><div className="n">02</div><h3>Set the policy</h3><p>Per agent and token: <code>setPolicy</code>, then <code>setDestination</code> for each approved address.</p></div>
          <div className="step"><div className="n">03</div><h3>Let the agent work</h3><p>The agent calls <code>pay</code>, <code>callTarget</code> or <code>swapExactIn</code> with its own key and gas.</p></div>
          <div className="step"><div className="n">04</div><h3>Verify and revoke</h3><p>Check <code>remainingBudget</code> and receipts. <code>revokeAgent</code> cuts access immediately.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>BOT Chain testnet, ready out of the box</h2>
          <p>Defaults, addresses and explorer wiring ship preconfigured for testnet. Mainnet comes later, after testnet validation.</p>
        </div>
        <div className="ref-grid">
          <div className="ref"><h3>Network</h3><p>BOT Chain Testnet<br />Chain ID <strong>968</strong> · Symbol <strong>BOT</strong></p></div>
          <div className="ref"><h3>Assets</h3><p><span className="mono">WBOT 0xD545…bd30</span><br /><span className="mono">USDT 0xaBab…87a3C</span></p></div>
          <div className="ref"><h3>Verify</h3><p><a href={EXPLORER} target="_blank" rel="noreferrer">Block explorer ↗</a><br /><a href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">Testnet faucet ↗</a> · <a href="https://dex.botchain.ai/#/swap" target="_blank" rel="noreferrer">DEX ↗</a></p></div>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>Put your first agent on a budget today</h2>
          <p>Deploy to testnet, paste your deployment addresses, and set a policy. Use test BOT from the faucet. Mainnet only after testnet validation.</p>
        </div>
        <div className="cta-row">
          <button onClick={onLaunch}>Open the console</button>
        </div>
      </section>
    </>
  );
}
