const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

async function fixture() {
  const [agent, other] = await ethers.getSigners();
  const pot = await (await ethers.getContractFactory("ProofOfThought")).deploy();
  return { pot, agent, other };
}

describe("ProofOfThought", () => {
  it("commits a receipt and verifies it", async () => {
    const { pot, agent } = await loadFixture(fixture);
    const p = h("what is 2+2?");
    const o = h("4");
    await expect(pot.connect(agent).commit(p, o, "claude-test"))
      .to.emit(pot, "ReceiptCommitted")
      .withArgs(1n, agent.address, o, p, "claude-test");

    const [found, id, ts] = await pot.verify(agent.address, p, o);
    expect(found).to.equal(true);
    expect(id).to.equal(1n);
    expect(ts).to.equal(BigInt(await time.latest()));

    const r = await pot.getReceipt(1);
    expect(r.agent).to.equal(agent.address);
    expect(r.model).to.equal("claude-test");
  });

  it("returns not found for unknown, altered, or other-agent receipts", async () => {
    const { pot, agent, other } = await loadFixture(fixture);
    const p = h("prompt");
    const o = h("output");
    await pot.connect(agent).commit(p, o, "m");
    expect((await pot.verify(agent.address, p, h("tampered")))[0]).to.equal(false);
    expect((await pot.verify(other.address, p, o))[0]).to.equal(false);
  });

  it("prevents re-committing the same receipt (timestamp cannot move)", async () => {
    const { pot, agent } = await loadFixture(fixture);
    const p = h("p");
    const o = h("o");
    await pot.connect(agent).commit(p, o, "m");
    await expect(pot.connect(agent).commit(p, o, "m")).to.be.revertedWithCustomError(pot, "AlreadyCommitted").withArgs(1n);
  });

  it("lets different agents commit the same content independently", async () => {
    const { pot, agent, other } = await loadFixture(fixture);
    const p = h("p");
    const o = h("o");
    await pot.connect(agent).commit(p, o, "m");
    await pot.connect(other).commit(p, o, "m");
    expect(await pot.receiptCount()).to.equal(2n);
  });

  it("validates inputs", async () => {
    const { pot, agent } = await loadFixture(fixture);
    await expect(pot.commit(ethers.ZeroHash, h("o"), "m")).to.be.revertedWithCustomError(pot, "EmptyHash");
    await expect(pot.commit(h("p"), ethers.ZeroHash, "m")).to.be.revertedWithCustomError(pot, "EmptyHash");
    await expect(pot.commit(h("p"), h("o"), "x".repeat(65))).to.be.revertedWithCustomError(pot, "ModelTooLong");
    await expect(pot.getReceipt(0)).to.be.revertedWithCustomError(pot, "UnknownReceipt");
    await expect(pot.getReceipt(99)).to.be.revertedWithCustomError(pot, "UnknownReceipt");
  });
});
