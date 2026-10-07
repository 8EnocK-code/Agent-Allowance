import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, Interface, ZeroAddress, formatUnits, getAddress, id as keccakText, isAddress, parseUnits } from "ethers";
import { ERC20_ABI, POT_ABI, VAULT_ABI } from "./abi.js";
import { BOT_CHAIN, ERR, EXPLORER, addressUrl, ensureBotChain, niceError, txUrl } from "./chain.js";
import Landing from "./Landing.jsx";

const REVERT_IFACE = new Interface([...VAULT_ABI, ...POT_ABI].filter((f) => f.startsWith("error ")));

// Decode raw revert data (ethers leaves it undecoded) into the friendly copy.
function decodeRevert(e) {
  const data = [e?.data, e?.error?.data, e?.info?.error?.data, e?.revert?.data]
    .find((d) => typeof d === "string" && d.startsWith("0x"));
  if (data) {
    try {
      const name = REVERT_IFACE.parseError(data)?.name;
      if (name && ERR[name]) return ERR[name];
      if (name) return name;
    } catch { /* unknown selector */ }
  }
  return niceError(e);
}

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const when = (t) => (!t || t === 0n ? "never" : new Date(Number(t) * 1000).toLocaleString());
const LS_VAULT = "botguard.vault";
const LS_POT = "botguard.pot";

export default function App() {
  const [route, setRoute] = useState("landing"); // landing | console
  const [wallet, setWallet] = useState(null); // { signer, address, chainId }
  const [vaultAddr, setVaultAddr] = useState(() => localStorage.getItem(LS_VAULT) || import.meta.env.VITE_VAULT_ADDRESS || "");
  const [potAddr, setPotAddr] = useState(() => localStorage.getItem(LS_POT) || import.meta.env.VITE_POT_ADDRESS || "");
  const [tab, setTab] = useState("vault");
  const [status, setStatus] = useState({ kind: "idle", msg: "" });
  const [pending, setPending] = useState(null); // label of the in-flight action
  const [txs, setTxs] = useState([]); // { label, hash, state: pending|confirmed|failed }
  const busy = status.kind === "busy";

  useEffect(() => { localStorage.setItem(LS_VAULT, vaultAddr); }, [vaultAddr]);
  useEffect(() => { localStorage.setItem(LS_POT, potAddr); }, [potAddr]);

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("No wallet found. Install MetaMask, OKX, Bitget, or TokenPocket.");
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureBotChain(window.ethereum);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const net = await provider.getNetwork();
      setWallet({ signer, address: await signer.getAddress(), chainId: Number(net.chainId) });
      setStatus({ kind: "idle", msg: "" });
    } catch (e) {
      setStatus({ kind: "err", msg: niceError(e) });
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    try {
      await ensureBotChain(window.ethereum);
      const provider = new BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      setWallet((w) => (w ? { ...w, chainId: Number(net.chainId) } : w));
    } catch (e) {
      setStatus({ kind: "err", msg: niceError(e) });
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (accs) => {
      if (!accs?.length) setWallet(null);
      else setWallet((w) => (w ? { ...w, address: accs[0] } : w));
    };
    const onChain = (hex) => setWallet((w) => (w ? { ...w, chainId: Number(hex) } : w));
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const run = useCallback(async (label, fn) => {
    setPending(label);
    let hash = null;
    try {
      setStatus({ kind: "busy", msg: `${label}: confirm in wallet…` });
      const tx = await fn();
      hash = tx?.hash || null;
      if (tx?.wait) {
        if (hash) {
          setTxs((t) => [{ label, hash, state: "pending", time: Date.now() }, ...t].slice(0, 6));
          setStatus({ kind: "busy", msg: `${label}: submitted, waiting for confirmation…` });
        } else {
          setStatus({ kind: "busy", msg: `${label}: waiting for confirmation…` });
        }
        const receipt = await tx.wait();
        hash = receipt?.hash || hash;
        const confirmed = receipt?.status !== 0;
        if (hash) setTxs((t) => t.map((x) => (x.hash === hash ? { ...x, state: confirmed ? "confirmed" : "failed" } : x)));
        if (!confirmed) throw new Error("Transaction reverted on-chain.");
      }
      setStatus({ kind: "ok", msg: `${label}: done.` });
      return { ok: true, hash };
    } catch (e) {
      if (hash) setTxs((t) => t.map((x) => (x.hash === hash ? { ...x, state: "failed" } : x)));
      setStatus({ kind: "err", msg: `${label}: ${decodeRevert(e)}` });
      return { ok: false, hash };
    } finally {
      setPending(null);
    }
  }, []);

  const vault = useMemo(
    () => (wallet && isAddress(vaultAddr) ? new Contract(vaultAddr, VAULT_ABI, wallet.signer) : null),
    [wallet, vaultAddr]
  );
  const pot = useMemo(
    () => (wallet && isAddress(potAddr) ? new Contract(potAddr, POT_ABI, wallet.signer) : null),
    [wallet, potAddr]
  );
  const wrongChain = wallet && wallet.chainId !== BOT_CHAIN.chainId;

  const goSection = (id) => {
    setRoute("landing");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => setRoute("landing")}>
            <div className="brand-mark">B</div>
            <div>
              <span className="brand-name">BotGuard</span>
              <span className="brand-sub">Agent allowances · BOT Chain</span>
            </div>
          </div>
          <div className="nav-links">
            <button onClick={() => goSection("how")}>How it works</button>
            <button onClick={() => setRoute("console")}>Owner console</button>
            <button onClick={() => goSection("how")}>Docs</button>
          </div>
          <div className="topbar-actions">
            {route === "landing" ? (
              <button onClick={() => setRoute("console")}>Launch app</button>
            ) : wallet ? (
              <>
                <div className={"pill " + (wrongChain ? "bad" : "good")} title={wallet.address}>
                  {wrongChain ? `Wrong network (${wallet.chainId})` : `BOT Testnet · ${short(wallet.address)}`}
                </div>
                {wrongChain && <button className="ghost" onClick={switchNetwork}>Switch</button>}
                <button className="ghost" onClick={() => setWallet(null)}>Disconnect</button>
              </>
            ) : (
              <button onClick={connect}>Connect wallet</button>
            )}
          </div>
        </div>
      </div>

      <div className="shell">
        {route === "landing" ? (
          <Landing onLaunch={() => setRoute("console")} />
        ) : (
          <>
            <div className="console-head">
              <div>
                <button className="back-link" onClick={() => setRoute("landing")}>← Back to overview</button>
                <h2>Owner console</h2>
                <p className="muted" style={{ margin: "4px 0 0" }}>Deposits, agent budgets, allowlists and receipt verification on BOT Chain Testnet (968).</p>
              </div>
              {!wallet && <button onClick={connect}>Connect wallet</button>}
            </div>

            <section className="card cfg">
              <Field
                label="AgentVault address"
                value={vaultAddr}
                onChange={setVaultAddr}
                placeholder="0x… (from deployments/botTestnet.json)"
                hint={isAddress(vaultAddr) ? null : "Paste a deployed AgentVault address, or deploy first with npm run deploy:testnet."}
              />
              {isAddress(vaultAddr) && <ExplorerLink addr={vaultAddr} />}
              <Field
                label="ProofOfThought address"
                value={potAddr}
                onChange={setPotAddr}
                placeholder="0x… (from deployments/botTestnet.json)"
                hint={isAddress(potAddr) ? null : "Paste a deployed ProofOfThought address."}
              />
              {isAddress(potAddr) && <ExplorerLink addr={potAddr} />}
            </section>

            <nav className="tabs">
              {[["vault", "Vault"], ["agents", "Agents"], ["activity", "Activity"], ["receipts", "Receipts"]].map(([k, l]) => (
                <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)} disabled={busy}>{l}</button>
              ))}
            </nav>

            {status.msg && <div className={"status " + status.kind} role="status">{busy && <span className="spinner" />} {status.msg}</div>}
            {txs.length > 0 && <TxHistory txs={txs} />}

            {!wallet ? (
              <p className="muted">Connect a wallet to continue. BotGuard runs on BOT Chain Testnet (chain ID 968).</p>
            ) : wrongChain ? (
              <p className="muted">
                You are on chain {wallet.chainId}. <button className="ghost" onClick={switchNetwork}>Switch to BOT Chain Testnet (968)</button> to continue.
              </p>
            ) : tab === "receipts" ? (
              <Receipts pot={pot} />
            ) : !vault ? (
              <p className="muted">Enter a valid AgentVault address above to manage deposits and agents.</p>
            ) : tab === "vault" ? (
              <VaultTab vault={vault} wallet={wallet} vaultAddr={vaultAddr} run={run} busy={busy} pending={pending} />
            ) : tab === "agents" ? (
              <AgentsTab vault={vault} wallet={wallet} run={run} busy={busy} pending={pending} />
            ) : tab === "activity" ? (
              <ActivityTab vault={vault} wallet={wallet} />
            ) : (
              <Receipts pot={pot} />
            )}
          </>
        )}

        <footer className="site-footer">
          <span>BotGuard · testnet pre-release, use test BOT only.</span>
          <a href="https://www.botchain.ai" target="_blank" rel="noreferrer">Website</a>
          <a href={EXPLORER} target="_blank" rel="noreferrer">Explorer</a>
          <a href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">Faucet</a>
          <a href="https://dex.botchain.ai/#/swap" target="_blank" rel="noreferrer">DEX</a>
          <a href="https://dev-docs.botchain.ai/docs/Developers/quick-guide/" target="_blank" rel="noreferrer">Docs</a>
        </footer>
      </div>
    </>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function ExplorerLink({ addr, label = "View on scan.botchain.ai" }) {
  return (
    <div className="row">
      <span className="mono muted">{short(addr)}</span>
      <a className="explorer" href={addressUrl(addr)} target="_blank" rel="noreferrer">{label} ↗</a>
    </div>
  );
}

function TxHistory({ txs }) {
  return (
    <section className="card tx-card">
      <h2>Recent transactions</h2>
      <ul className="tx-list">
        {txs.map((t) => (
          <li key={t.hash} className="tx-item">
            <span className={"tx-dot " + t.state} />
            <span className="tx-label">{t.label}</span>
            <a className="explorer mono" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
              {t.hash.slice(0, 10)}…{t.hash.slice(-6)} ↗
            </a>
            <span className={"tx-state " + t.state}>
              {t.state === "pending" ? "confirming" : t.state}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Reads go through the user's wallet RPC, which can hang forever on a dead
// endpoint. Race every read against a timer so the UI always answers.
async function withTimeout(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const READ_TIMEOUT_MS = 25000;
const RPC_TIMEOUT_MSG = "Request timed out. Your wallet's RPC endpoint for BOT Testnet (968) did not answer. Check the RPC URL in your wallet's network settings (it should be https://rpc.bohr.life), then try again.";

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch { /* clipboard unavailable */ }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

async function tokenInfo(signer, input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return { address: ZeroAddress, decimals: 18, symbol: "BOT" };
  if (!isAddress(trimmed)) throw new Error("Token address is not valid.");
  const c = new Contract(trimmed, ERC20_ABI, signer);
  const [decimals, symbol] = await Promise.all([c.decimals(), c.symbol().catch(() => "TOKEN")]);
  return { address: getAddress(trimmed), decimals: Number(decimals), symbol, contract: c };
}

function parseAmount(str, decimals) {
  const s = String(str || "").trim();
  if (!s) throw new Error("Enter an amount.");
  try {
    const v = parseUnits(s, decimals);
    if (v <= 0n) throw new Error("Amount must be greater than zero.");
    return v;
  } catch {
    throw new Error(`Amount "${s}" is not valid for ${decimals} decimals.`);
  }
}

function VaultTab({ vault, wallet, vaultAddr, run, busy, pending }) {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [bal, setBal] = useState(null);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    setErr("");
    setChecking(true);
    try {
      const t = await withTimeout(tokenInfo(wallet.signer, token), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      const b = await withTimeout(vault.balances(wallet.address, t.address), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      setBal(`${formatUnits(b, t.decimals)} ${t.symbol}`);
    } catch (e) {
      setBal(null);
      setErr(niceError(e));
    } finally {
      setChecking(false);
    }
  };

  const deposit = async () => {
    const { ok } = await run("Deposit", async () => {
      const t = await tokenInfo(wallet.signer, token);
      const amt = parseAmount(amount, t.decimals);
      if (t.address === ZeroAddress) return vault.depositNative({ value: amt });
      const allowance = await t.contract.allowance(wallet.address, vaultAddr);
      if (allowance < amt) {
        const approval = await t.contract.approve(vaultAddr, amt);
        await approval.wait();
      }
      return vault.depositToken(t.address, amt);
    });
    if (ok) { setAmount(""); refresh(); }
  };

  const withdraw = async () => {
    const { ok } = await run("Withdraw", async () => {
      const t = await tokenInfo(wallet.signer, token);
      return vault.withdraw(t.address, parseAmount(amount, t.decimals));
    });
    if (ok) { setAmount(""); refresh(); }
  };

  return (
    <section className="card">
      <h2>Your vault balance</h2>
      <p className="muted">Deposits credit what the vault actually receives. Withdrawals always work, even after revoke.</p>
      <Field label="Token address (leave empty for native BOT)" value={token} onChange={setToken} placeholder="0x… or empty" />
      <div className="row">
        <button className="ghost" onClick={refresh} disabled={busy || checking}>{checking ? "Checking…" : "Check balance"}</button>
        {bal && <span className="big">{bal}</span>}
      </div>
      {err && <div className="inline-err">{err}</div>}
      <Field label="Amount" value={amount} onChange={setAmount} placeholder="0.0" />
      <div className="row">
        <button onClick={deposit} disabled={!amount.trim() || busy}>{pending === "Deposit" ? "Depositing…" : "Deposit"}</button>
        <button className="ghost" onClick={withdraw} disabled={!amount.trim() || busy}>{pending === "Withdraw" ? "Withdrawing…" : "Withdraw"}</button>
      </div>
      <p className="muted">Never send BOT directly to the vault address. Always use Deposit.</p>
    </section>
  );
}

function AgentsTab({ vault, wallet, run, busy, pending }) {
  const [agent, setAgent] = useState("");
  const [token, setToken] = useState("");
  const [daily, setDaily] = useState("");
  const [perTx, setPerTx] = useState("");
  const [expiry, setExpiry] = useState("");
  const [dest, setDest] = useState("");
  const [outTok, setOutTok] = useState("");
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      if (!isAddress(agentAddr)) throw new Error("Agent address is not valid.");
      const t = await withTimeout(tokenInfo(wallet.signer, token), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      const [enabled, p, remaining] = await withTimeout(Promise.all([
        vault.agentEnabled(wallet.address, agentAddr),
        vault.policies(wallet.address, agentAddr, t.address),
        vault.remainingBudget(wallet.address, agentAddr, t.address),
      ]), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      const f = (v) => `${formatUnits(v, t.decimals)} ${t.symbol}`;
      setInfo({
        enabled,
        hasPolicy: p.dailyLimit > 0n,
        daily: f(p.dailyLimit), perTx: f(p.perTxLimit), spent: f(p.spentInWindow),
        remaining: f(remaining), expires: when(p.expiresAt),
      });
    } catch (e) {
      setInfo(null);
      setErr(niceError(e));
    } finally {
      setLoading(false);
    }
  };

  const policyError = (() => {
    if (!daily.trim() || !perTx.trim()) return null;
    const d = Number(daily), p = Number(perTx);
    if (!Number.isFinite(d) || !Number.isFinite(p) || d <= 0 || p <= 0) return "Limits must be numbers greater than zero.";
    if (p > d) return "Per-transaction limit cannot exceed the daily limit.";
    if (expiry && new Date(expiry).getTime() <= Date.now()) return "Expiry must be in the future (or empty for never).";
    return null;
  })();

  const savePolicy = async () => {
    if (policyError) return; // already shown inline above the button
    const { ok } = await run("Set policy", async () => {
      const t = await tokenInfo(wallet.signer, token);
      const exp = expiry ? BigInt(Math.floor(new Date(expiry).getTime() / 1000)) : 0n;
      if (exp !== 0n && exp <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Expiry must be in the future.");
      return vault.setPolicy(agentAddr, t.address, parseAmount(daily, t.decimals), parseAmount(perTx, t.decimals), exp);
    });
    if (ok) load();
  };

  const agentAddr = (agent || "").trim();
  const destAddr = (dest || "").trim();
  const outTokAddr = (outTok || "").trim();
  const need = isAddress(agentAddr);
  return (
    <>
      <section className="card">
        <h2>Agent policy</h2>
        <p className="muted">One policy per agent + token. Saving a policy (re-)enables the agent. Token empty = native BOT.</p>
        <Field label="Agent address (the bot's own key, never yours)" value={agent} onChange={setAgent} placeholder="0x…" />
        <Field label="Token address (empty = native BOT)" value={token} onChange={setToken} placeholder="0x… or empty" />
        <div className="grid2">
          <Field label="Daily limit (rolling 24h)" value={daily} onChange={setDaily} placeholder="e.g. 3.0" />
          <Field label="Per-transaction limit" value={perTx} onChange={setPerTx} placeholder="e.g. 1.0" />
        </div>
        {policyError && <p className="hint">{policyError}</p>}
        {err && <div className="inline-err">{err}</div>}
        <Field label="Expires (optional, empty = never)" type="datetime-local" value={expiry} onChange={setExpiry} />
        <div className="row">
          <button onClick={savePolicy} disabled={!need || !daily.trim() || !perTx.trim() || !!policyError || busy}>{pending === "Set policy" ? "Saving…" : "Save policy"}</button>
          <button className="ghost" onClick={load} disabled={!need || busy || loading}>{loading ? "Loading…" : "Load current"}</button>
          <button className="danger" onClick={() => run("Revoke agent", () => vault.revokeAgent(agentAddr))} disabled={!need || busy}>{pending === "Revoke agent" ? "Revoking…" : "Revoke agent"}</button>
        </div>
        {info && (
          <dl className="kv">
            <dt>Status</dt><dd>{info.enabled ? "enabled" : "disabled"}{!info.hasPolicy && " · no policy for this token"}</dd>
            <dt>Daily limit</dt><dd>{info.daily}</dd>
            <dt>Per-tx limit</dt><dd>{info.perTx}</dd>
            <dt>Spent this window</dt><dd>{info.spent}</dd>
            <dt>Remaining</dt><dd>{info.remaining}</dd>
            <dt>Expires</dt><dd>{info.expires}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Allowlists</h2>
        <p className="muted">Agents can only pay or call addresses you allow. The BDEX router goes here too; swap outputs are allowlisted separately.</p>
        <Field label="Destination (recipient or BDEX router)" value={dest} onChange={setDest} placeholder="0x…" />
        <div className="row">
          <button onClick={() => run("Allow destination", () => vault.setDestination(agentAddr, destAddr, true))} disabled={!need || !isAddress(destAddr) || busy}>Allow</button>
          <button className="ghost" onClick={() => run("Remove destination", () => vault.setDestination(agentAddr, destAddr, false))} disabled={!need || !isAddress(destAddr) || busy}>Remove</button>
        </div>
        <Field label="Swap output token" value={outTok} onChange={setOutTok} placeholder="0x… (e.g. USDT)" />
        <div className="row">
          <button onClick={() => run("Allow output token", () => vault.setOutputToken(agentAddr, outTokAddr, true))} disabled={!need || !isAddress(outTokAddr) || busy}>Allow</button>
          <button className="ghost" onClick={() => run("Remove output token", () => vault.setOutputToken(agentAddr, outTokAddr, false))} disabled={!need || !isAddress(outTokAddr) || busy}>Remove</button>
        </div>
      </section>
    </>
  );
}

function ActivityTab({ vault, wallet }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const provider = wallet.signer.provider;
      const latest = await withTimeout(provider.getBlockNumber(), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      const fromBlock = Math.max(0, latest - 200000);
      const owner = wallet.address;
      const kinds = ["Deposited", "Withdrawn", "PolicySet", "DestinationSet", "OutputTokenSet", "Swapped", "Spent", "AgentRevoked"];
      const logs = await withTimeout(
        Promise.all(kinds.map((k) => vault.queryFilter(vault.filters[k](owner), fromBlock, latest))),
        READ_TIMEOUT_MS, RPC_TIMEOUT_MSG
      );
      const byKind = Object.fromEntries(kinds.map((k, i) => [k, logs[i]]));
      const decCache = {};
      const fmt = async (token, value) => {
        if (token === ZeroAddress) return `${formatUnits(value, 18)} BOT`;
        if (!decCache[token]) {
          try { decCache[token] = await tokenInfo(wallet.signer, token); }
          catch { decCache[token] = { decimals: 18, symbol: "TOKEN" }; }
        }
        return `${formatUnits(value, decCache[token].decimals)} ${decCache[token].symbol}`;
      };
      const rows = [];
      for (const e of byKind.Deposited) rows.push({ e, text: `Deposited ${await fmt(e.args.token, e.args.amount)}` });
      for (const e of byKind.Withdrawn) rows.push({ e, text: `Withdrew ${await fmt(e.args.token, e.args.amount)}` });
      for (const e of byKind.PolicySet) rows.push({ e, text: `Policy for ${short(e.args.agent)}: ${await fmt(e.args.token, e.args.dailyLimit)} / day, ${await fmt(e.args.token, e.args.perTxLimit)} per tx` });
      for (const e of byKind.DestinationSet) rows.push({ e, text: `${e.args.allowed ? "Allowlisted" : "Removed"} ${short(e.args.destination)} for ${short(e.args.agent)}` });
      for (const e of byKind.OutputTokenSet) rows.push({ e, text: `Swap output ${short(e.args.token)} ${e.args.allowed ? "allowlisted" : "removed"} for ${short(e.args.agent)}` });
      for (const e of byKind.Swapped) rows.push({ e, text: `${short(e.args.agent)} swapped ${await fmt(e.args.tokenIn, e.args.amountIn)} for ${await fmt(e.args.tokenOut, e.args.amountOut)}` });
      for (const e of byKind.Spent) rows.push({ e, text: `${short(e.args.agent)} paid ${await fmt(e.args.token, e.args.amount)} to ${short(e.args.to)}` });
      for (const e of byKind.AgentRevoked) rows.push({ e, text: `Revoked ${short(e.args.agent)}` });
      const blocks = [...new Set(rows.map((r) => r.e.blockNumber))];
      const times = {};
      await Promise.all(blocks.map(async (b) => {
        try { times[b] = (await provider.getBlock(b)).timestamp; } catch { /* leave unknown */ }
      }));
      rows.sort((a, b) => b.e.blockNumber - a.e.blockNumber || (b.e.index ?? 0) - (a.e.index ?? 0));
      setItems(rows.map((r) => ({
        text: r.text, hash: r.e.transactionHash,
        time: times[r.e.blockNumber] ? new Date(times[r.e.blockNumber] * 1000).toLocaleString() : "",
      })));
    } catch (e) {
      setItems(null);
      setErr(niceError(e));
    } finally {
      setLoading(false);
    }
  }, [vault, wallet]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card">
      <h2>Vault activity</h2>
      <p className="muted">Every deposit, withdrawal, policy change and agent spend for your wallet, read from on-chain events (last ~200k blocks).</p>
      <div className="row">
        <button className="ghost" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {err && <div className="inline-err">{err}</div>}
      {items && items.length === 0 && <p className="muted">No vault activity in range.</p>}
      {items && items.length > 0 && (
        <ul className="tx-list">
          {items.map((t, i) => (
            <li key={t.hash + i} className="tx-item">
              <span className="tx-label">{t.text}</span>
              <a className="explorer mono" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
                {t.hash.slice(0, 10)}…{t.hash.slice(-6)} ↗
              </a>
              {t.time && <span className="muted" style={{ fontSize: 12 }}>{t.time}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Receipts({ pot }) {
  // Exact preimages of on-chain testnet receipt #1 (verified by hash).
  // Lets anyone demonstrate verification in one click, no copy-paste drift.
  const EXAMPLE = {
    prompt: "BotGuard test: should I pay 0.1 BOT to the owner?",
    output: "Yes. Amount is within the 0.1 per-transaction policy and the owner is allowlisted.",
    agent: "0xEbedfb1Db4eCC1f03E2952a43c07C9f56Cc9E05D",
  };
  const [text, setText] = useState({ prompt: "", output: "" });
  const [agent, setAgent] = useState("");
  const [res, setRes] = useState(null);
  const [rid, setRid] = useState("");
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState("");
  const [count, setCount] = useState(null);
  const [working, setWorking] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      if (pot) setCount((await pot.receiptCount()).toString());
    } catch { /* keep old */ }
  }, [pot]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const hashes = { p: text.prompt ? keccakText(text.prompt) : "", o: text.output ? keccakText(text.output) : "" };

  const verify = async () => {
    setErr(""); setRes(null); setWorking(true);
    try {
      const [found, id, ts] = await withTimeout(pot.verify(agent.trim(), hashes.p, hashes.o), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      setRes({ found, id: id.toString(), ts });
    } catch (e) { setErr(niceError(e)); } finally { setWorking(false); }
  };
  const fetchReceipt = async () => {
    setErr(""); setRec(null); setWorking(true);
    try {
      const r = await withTimeout(pot.getReceipt(BigInt(rid.trim())), READ_TIMEOUT_MS, RPC_TIMEOUT_MSG);
      setRec({ agent: r.agent, ts: r.timestamp, p: r.promptHash, o: r.outputHash, model: r.model });
    } catch (e) { setErr(niceError(e)); } finally { setWorking(false); }
  };

  if (!pot) return <p className="muted">Enter a valid ProofOfThought address above to verify receipts.</p>;
  return (
    <>
      <section className="card">
        <h2>Verify an AI answer</h2>
        <p className="muted">Paste the exact prompt and output. Only keccak256 hashes are compared on-chain, so content never leaves your browser.{count === null ? "" : count === "0" ? " No receipts committed yet." : count === "1" ? " 1 receipt committed so far." : ` ${count} receipts committed so far.`}</p>
        <label className="field"><span>Prompt</span><textarea rows={3} value={text.prompt} onChange={(e) => setText({ ...text, prompt: e.target.value })} placeholder="Exact prompt text…" /></label>
        <label className="field"><span>Output</span><textarea rows={3} value={text.output} onChange={(e) => setText({ ...text, output: e.target.value })} placeholder="Exact model output…" /></label>
        <div className="row">
          <button className="ghost" onClick={() => { setText({ prompt: EXAMPLE.prompt, output: EXAMPLE.output }); setAgent(EXAMPLE.agent); setRes(null); setErr(""); }}>Fill receipt #1 test values</button>
        </div>
        {(hashes.p || hashes.o) && (
          <dl className="kv">
            <dt>Prompt hash</dt><dd className="addr-row"><span className="mono">{hashes.p}</span><CopyButton text={hashes.p} /></dd>
            <dt>Output hash</dt><dd className="addr-row"><span className="mono">{hashes.o}</span><CopyButton text={hashes.o} /></dd>
          </dl>
        )}
        <Field label="Agent address" value={agent} onChange={setAgent} placeholder="0x… (who committed it)" />
        <div className="row">
          <button onClick={verify} disabled={!hashes.p || !hashes.o || !isAddress(agent.trim()) || working}>{working ? "Verifying…" : "Verify"}</button>
        </div>
        {res && (
          <p className={"verdict " + (res.found ? "good" : "bad")} role="status">
            {res.found ? `✓ Committed as receipt #${res.id} on ${when(res.ts)}` : "✘ No matching receipt for this agent. Any single character difference fails."}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Look up receipt by ID</h2>
        <Field label="Receipt ID" value={rid} onChange={setRid} placeholder={count && count !== "0" ? `1 … ${count}` : "1"} />
        <button className="ghost" onClick={fetchReceipt} disabled={!/^\d+$/.test(rid.trim()) || rid.trim() === "0" || working}>{working ? "Fetching…" : "Fetch"}</button>
        {rec && (
          <dl className="kv">
            <dt>Agent</dt><dd className="addr-row"><span className="mono">{rec.agent}</span><a className="explorer" href={addressUrl(rec.agent)} target="_blank" rel="noreferrer">↗</a></dd>
            <dt>Model</dt><dd>{rec.model || "(none)"}</dd>
            <dt>Time</dt><dd>{when(rec.ts)}</dd>
            <dt>Prompt hash</dt><dd className="addr-row"><span className="mono">{rec.p}</span><CopyButton text={rec.p} /></dd>
            <dt>Output hash</dt><dd className="addr-row"><span className="mono">{rec.o}</span><CopyButton text={rec.o} /></dd>
          </dl>
        )}
        {err && <div className="status err">{err}</div>}
      </section>
    </>
  );
}
