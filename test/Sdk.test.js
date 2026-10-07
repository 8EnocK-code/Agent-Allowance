const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { BotGuardAgent, hashText } = require("../sdk");

const NATIVE = ethers.ZeroAddress;
const ONE = ethers.parseEther("1");

async function fixture() {
  const [owner, agentSigner, stranger, recipient] = await ethers.getSigners();
  const vault = await (await ethers.getContractFactory("AgentVault")).deploy();
  const pot = await (await ethers.getContractFactory("ProofOfThought")).deploy();
  await vault.depositNative({ value: ONE * 10n });
  await vault.setPolicy(agentSigner.address, NATIVE, ONE * 3n, ONE, 0);
  await vault.setDestination(agentSigner.address, recipient.address, true);
  const agent = new BotGuardAgent({
    signer: agentSigner, vault: await vault.getAddress(), pot: await pot.getAddress(), owner: owner.address,
  });
  return { vault, pot, agent, owner, agentSigner, stranger, recipient };
}

describe("BotGuard SDK", () => {
  it("hashes text deterministically", () => {
    expect(hashText("hi")).to.equal(hashText("hi"));
    expect(hashText("hi")).to.not.equal(hashText("hi "));
    expect(hashText("hi")).to.equal(ethers.id("hi"));
  });

  it("rejects bad constructor input", async () => {
    const { agentSigner } = await loadFixture(fixture);
    expect(() => new BotGuardAgent({ signer: agentSigner, vault: "nope", owner: agentSigner.address })).to.throw(/vault/);
  });

  it("reports remaining budget and pays within limits", async () => {
    const { agent, recipient } = await loadFixture(fixture);
    expect(await agent.remainingBudget()).to.equal(ONE * 3n);
    const before = await ethers.provider.getBalance(recipient.address);
    await agent.pay({ to: recipient.address, amount: ONE / 2n });
    expect((await ethers.provider.getBalance(recipient.address)) - before).to.equal(ONE / 2n);
    expect(await agent.remainingBudget()).to.equal(ONE * 5n / 2n);
  });

  it("blocks over-limit, bad destination and zero amounts BEFORE sending", async () => {
    const { agent, recipient, stranger } = await loadFixture(fixture);
    expect(await agent.canSpend({ to: recipient.address, amount: ONE * 2n })).to.deep.equal({ ok: false, reason: "amount is above the per-transaction limit" });
    expect((await agent.canSpend({ to: stranger.address, amount: ONE / 10n })).reason).to.match(/allowlist/);
    expect((await agent.canSpend({ to: recipient.address, amount: 0n })).reason).to.match(/zero/);
    await expect(agent.pay({ to: recipient.address, amount: ONE * 2n })).to.be.rejectedWith(/blocked before sending/);
  });

  it("enforces the daily budget across several payments", async () => {
    const { agent, recipient } = await loadFixture(fixture);
    for (let i = 0; i < 3; i++) await agent.pay({ to: recipient.address, amount: ONE });
    expect((await agent.canSpend({ to: recipient.address, amount: 1n })).reason).to.match(/daily budget/);
  });

  it("stops the agent as soon as the owner revokes it", async () => {
    const { agent, vault, agentSigner, recipient } = await loadFixture(fixture);
    await vault.revokeAgent(agentSigner.address);
    expect((await agent.canSpend({ to: recipient.address, amount: 1n })).reason).to.match(/revoked/);
    expect(await agent.remainingBudget()).to.equal(0n);
  });

  it("surfaces readable on-chain revert reasons when the pre-check is bypassed", async () => {
    const { agent, vault, stranger, owner } = await loadFixture(fixture);
    const { explain } = require("../sdk");
    let err;
    try { await vault.connect(agent.signer).pay(owner.address, NATIVE, stranger.address, 1n); } catch (e) { err = e; }
    expect(explain(err)).to.match(/allowlist/);
  });

  it("commits a thought, verifies it, and rejects tampering and duplicates", async () => {
    const { agent, agentSigner, stranger } = await loadFixture(fixture);
    const t = { prompt: "Pay invoice #42?", output: "Yes, 0.5 BOT to the supplier.", model: "demo-model" };
    const r = await agent.commitThought(t);
    expect(r.id).to.equal(1n);
    const ok = await agent.verifyThought(t);
    expect(ok.found).to.equal(true);
    expect(ok.id).to.equal(1n);
    expect((await agent.verifyThought({ ...t, output: t.output + "!" })).found).to.equal(false);
    expect((await agent.verifyThought({ ...t, agent: stranger.address })).found).to.equal(false);
    await expect(agent.commitThought(t)).to.be.rejectedWith(/already committed/);
  });

  it("requires a ProofOfThought address for receipts", async () => {
    const { agentSigner, vault, owner } = await loadFixture(fixture);
    const a = new BotGuardAgent({ signer: agentSigner, vault: await vault.getAddress(), owner: owner.address });
    await expect(a.commitThought({ prompt: "a", output: "b", model: "m" })).to.be.rejectedWith(/ProofOfThought/);
  });
});
