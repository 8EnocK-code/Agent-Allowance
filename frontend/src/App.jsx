import { useCallback, useMemo, useState } from "react";
import { BrowserProvider, Contract, ZeroAddress, formatUnits, getAddress, id as keccakText, isAddress, parseUnits } from "ethers";
import { ERC20_ABI, POT_ABI, VAULT_ABI } from "./abi.js";
import { BOT_CHAIN, ensureBotChain, niceError } from "./chain.js";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const when = (t) => (!t || t === 0n ? "never" : new Date(Number(t) * 1000).toLocaleString());

export default function App() {
  const [wallet, setWallet] = useState(null); // { signer, address, chainId }
  const [vaultAddr, setVaultAddr] = useState(import.meta.env.VITE_VAULT_ADDRESS || "");
  const [potAddr, setPotAddr] = useState(import.meta.env.VITE_POT_ADDRESS || "");
  const [tab, setTab] = useState("vault");
  const [status, setStatus] = useState({ kind: "idle", msg: "" });

  const connect = async () => {
    try {
      if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or another EVM wallet.");
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
  };

  // Run a transaction with status feedback.
  const run = useCallback(async (label, fn) => {
    try {
      setStatus({ kind: "busy", msg: `${label}: confirm in wallet…` });
      const tx = await fn();
      if (tx?.wait) {
        setStatus({ kind: "busy", msg: `${label}: waiting for confirmation…` });
        await tx.wait();
      }
      setStatus({ kind: "ok", msg: `${label}: done.` });
      return true;
    } catch (e) {
      setStatus({ kind: "err", msg: `${label}: ${niceError(e)}` });
      return false;
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

  return (
    <div className="shell">
      <header>
        <div>
          <h1>BotGuard</h1>
          <p className="tag">Hard budgets for AI agents. You hold the keys.</p>
        </div>
        {wallet ? (
          <div className={"pill " + (wrongChain ? "bad" : "good")}>
            {wrongChain ? `Wrong network (${wallet.chainId})` : `BOT Chain · ${short(wallet.address)}`}
          </div>
        ) : (
          <button onClick={connect}>Connect wallet</button>
        )}
      </header>

      <section className="card cfg">
        <Field label="AgentVault address" value={vaultAddr} onChange={setVaultAddr} />
        <Field label="ProofOfThought address" value={potAddr} onChange={setPotAddr} />
      </section>

      <nav>
        {[["vault", "Vault"], ["agents", "Agents"], ["receipts", "Receipts"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {status.msg && <div className={"status " + status.kind}>{status.msg}</div>}

      {!wallet || wrongChain ? (
        <p className="muted">Connect a wallet on BOT Chain (chain ID 677) to continue.</p>
      ) : tab === "receipts" ? (
        <Receipts pot={pot} />
      ) : !vault ? (
        <p className="muted">Enter a valid AgentVault address above.</p>
      ) : tab === "vault" ? (
        <VaultTab vault={vault} wallet={wallet} vaultAddr={vaultAddr} run={run} />
      ) : (
        <AgentsTab vault={vault} wallet={wallet} run={run} />
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Resolve a token input ("" = native BOT) into { address, decimals, symbol }.
async function tokenInfo(signer, input) {
  if (!input.trim()) return { address: ZeroAddress, decimals: 18, symbol: "BOT" };
  if (!isAddress(input)) throw new Error("Token address is not valid.");
  const c = new Contract(input, ERC20_ABI, signer);
  const [decimals, symbol] = await Promise.all([c.decimals(), c.symbol().catch(() => "TOKEN")]);
  return { address: getAddress(input), decimals: Number(decimals), symbol, contract: c };
}

function VaultTab({ vault, wallet, vaultAddr, run }) {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [bal, setBal] = useState(null);

  const refresh = async () => {
    try {
      const t = await tokenInfo(wallet.signer, token);
      const b = await vault.balances(wallet.address, t.address);
      setBal(`${formatUnits(b, t.decimals)} ${t.symbol}`);
    } catch (e) {
      setBal(null);
      alert(niceError(e));
    }
  };

  const deposit = async () => {
    const ok = await run("Deposit", async () => {
      const t = await tokenInfo(wallet.signer, token);
      const amt = parseUnits(amount, t.decimals);
      if (t.address === ZeroAddress) return vault.depositNative({ value: amt });
      const allowance = await t.contract.allowance(wallet.address, vaultAddr);
      if (allowance < amt) {
        const approval = await t.contract.approve(vaultAddr, amt);
        await approval.wait();
      }
      return vault.depositToken(t.address, amt);
    });
    if (ok) refresh();
  };

  const withdraw = async () => {
    const ok = await run("Withdraw", async () => {
      const t = await tokenInfo(wallet.signer, token);
      return vault.withdraw(t.address, parseUnits(amount, t.decimals));
    });
    if (ok) refresh();
  };

  return (
    <section className="card">
      <h2>Your vault balance</h2>
      <Field label="Token address (leave empty for native BOT)" value={token} onChange={setToken} placeholder="0x… or empty" />
      <div className="row">
        <button className="ghost" onClick={refresh}>Check balance</button>
        {bal && <span className="big">{bal}</span>}
      </div>
      <Field label="Amount" value={amount} onChange={setAmount} placeholder="0.0" />
      <div className="row">
        <button onClick={deposit} disabled={!amount}>Deposit</button>
        <button className="ghost" onClick={withdraw} disabled={!amount}>Withdraw</button>
      </div>
      <p className="muted">Withdrawals always work, even after you revoke an agent.</p>
    </section>
  );
}

function AgentsTab({ vault, wallet, run }) {
  const [agent, setAgent] = useState("");
  const [token, setToken] = useState("");
  const [daily, setDaily] = useState("");
  const [perTx, setPerTx] = useState("");
  const [expiry, setExpiry] = useState("");
  const [dest, setDest] = useState("");
  const [outTok, setOutTok] = useState("");
  const [info, setInfo] = useState(null);

  const load = async () => {
    try {
      if (!isAddress(agent)) throw new Error("Agent address is not valid.");
      const t = await tokenInfo(wallet.signer, token);
      const [enabled, p, remaining] = await Promise.all([
        vault.agentEnabled(wallet.address, agent),
        vault.policies(wallet.address, agent, t.address),
        vault.remainingBudget(wallet.address, agent, t.address),
      ]);
      const f = (v) => `${formatUnits(v, t.decimals)} ${t.symbol}`;
      setInfo({
        enabled,
        hasPolicy: p.dailyLimit > 0n,
        daily: f(p.dailyLimit), perTx: f(p.perTxLimit), spent: f(p.spentInWindow),
        remaining: f(remaining), expires: when(p.expiresAt),
      });
    } catch (e) {
      setInfo(null);
      alert(niceError(e));
    }
  };

  const savePolicy = async () => {
    const ok = await run("Set policy", async () => {
      const t = await tokenInfo(wallet.signer, token);
      const exp = expiry ? BigInt(Math.floor(new Date(expiry).getTime() / 1000)) : 0n;
      return vault.setPolicy(agent, t.address, parseUnits(daily, t.decimals), parseUnits(perTx, t.decimals), exp);
    });
    if (ok) load();
  };

  const need = isAddress(agent);
  return (
    <>
      <section className="card">
        <h2>Agent policy</h2>
        <Field label="Agent address" value={agent} onChange={setAgent} placeholder="0x…" />
        <Field label="Token address (empty = native BOT)" value={token} onChange={setToken} placeholder="0x… or empty" />
        <div className="grid2">
          <Field label="Daily limit" value={daily} onChange={setDaily} placeholder="0.0" />
          <Field label="Per-transaction limit" value={perTx} onChange={setPerTx} placeholder="0.0" />
        </div>
        <Field label="Expires (optional)" type="datetime-local" value={expiry} onChange={setExpiry} />
        <div className="row">
          <button onClick={savePolicy} disabled={!need || !daily || !perTx}>Save policy</button>
          <button className="ghost" onClick={load} disabled={!need}>Load current</button>
          <button className="danger" onClick={() => run("Revoke agent", () => vault.revokeAgent(agent))} disabled={!need}>Revoke agent</button>
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
        <Field label="Destination (recipient or BDEX router)" value={dest} onChange={setDest} placeholder="0x…" />
        <div className="row">
          <button onClick={() => run("Allow destination", () => vault.setDestination(agent, dest, true))} disabled={!need || !isAddress(dest)}>Allow</button>
          <button className="ghost" onClick={() => run("Remove destination", () => vault.setDestination(agent, dest, false))} disabled={!need || !isAddress(dest)}>Remove</button>
        </div>
        <Field label="Swap output token" value={outTok} onChange={setOutTok} placeholder="0x…" />
        <div className="row">
          <button onClick={() => run("Allow output token", () => vault.setOutputToken(agent, outTok, true))} disabled={!need || !isAddress(outTok)}>Allow</button>
          <button className="ghost" onClick={() => run("Remove output token", () => vault.setOutputToken(agent, outTok, false))} disabled={!need || !isAddress(outTok)}>Remove</button>
        </div>
      </section>
    </>
  );
}

function Receipts({ pot }) {
  const [text, setText] = useState({ prompt: "", output: "" });
  const [agent, setAgent] = useState("");
  const [res, setRes] = useState(null);
  const [rid, setRid] = useState("");
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState("");

  const hashes = { p: text.prompt ? keccakText(text.prompt) : "", o: text.output ? keccakText(text.output) : "" };

  const verify = async () => {
    setErr(""); setRes(null);
    try {
      const [found, id, ts] = await pot.verify(agent, hashes.p, hashes.o);
      setRes({ found, id: id.toString(), ts });
    } catch (e) { setErr(niceError(e)); }
  };
  const fetchReceipt = async () => {
    setErr(""); setRec(null);
    try {
      const r = await pot.getReceipt(BigInt(rid));
      setRec({ agent: r.agent, ts: r.timestamp, p: r.promptHash, o: r.outputHash, model: r.model });
    } catch (e) { setErr(niceError(e)); }
  };

  if (!pot) return <p className="muted">Enter a valid ProofOfThought address above.</p>;
  return (
    <>
      <section className="card">
        <h2>Verify an AI answer</h2>
        <p className="muted">Paste the exact prompt and output. Only keccak256 hashes are compared on-chain.</p>
        <label className="field"><span>Prompt</span><textarea rows={3} value={text.prompt} onChange={(e) => setText({ ...text, prompt: e.target.value })} /></label>
        <label className="field"><span>Output</span><textarea rows={3} value={text.output} onChange={(e) => setText({ ...text, output: e.target.value })} /></label>
        <Field label="Agent address" value={agent} onChange={setAgent} placeholder="0x…" />
        <button onClick={verify} disabled={!hashes.p || !hashes.o || !isAddress(agent)}>Verify</button>
        {res && (
          <p className={"verdict " + (res.found ? "good" : "bad")}>
            {res.found ? `Committed as receipt #${res.id} on ${when(res.ts)}` : "No matching receipt for this agent."}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Look up receipt by ID</h2>
        <Field label="Receipt ID" value={rid} onChange={setRid} placeholder="1" />
        <button className="ghost" onClick={fetchReceipt} disabled={!/^\d+$/.test(rid)}>Fetch</button>
        {rec && (
          <dl className="kv">
            <dt>Agent</dt><dd>{rec.agent}</dd>
            <dt>Model</dt><dd>{rec.model}</dd>
            <dt>Time</dt><dd>{when(rec.ts)}</dd>
            <dt>Prompt hash</dt><dd className="mono">{rec.p}</dd>
            <dt>Output hash</dt><dd className="mono">{rec.o}</dd>
          </dl>
        )}
        {err && <div className="status err">{err}</div>}
      </section>
    </>
  );
}
