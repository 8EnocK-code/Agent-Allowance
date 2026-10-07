const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const NATIVE = ethers.ZeroAddress;
const ONE = ethers.parseEther("1");

async function deployFixture() {
  const [owner, agent, other, recipient] = await ethers.getSigners();

  const vault = await (await ethers.getContractFactory("AgentVault")).deploy();
  const token = await (await ethers.getContractFactory("MockToken")).deploy();
  const target = await (await ethers.getContractFactory("MockTarget")).deploy();

  await vault.connect(owner).depositNative({ value: ethers.parseEther("10") });
  await vault.connect(owner).setPolicy(agent.address, NATIVE, ONE * 3n, ONE, 0);
  await vault.connect(owner).setDestination(agent.address, recipient.address, true);
  await vault.connect(owner).setDestination(agent.address, await target.getAddress(), true);

  return { vault, token, target, owner, agent, other, recipient };
}

describe("AgentVault", () => {
  describe("deposits and withdrawals", () => {
    it("credits native deposits and lets the owner withdraw", async () => {
      const { vault, owner } = await loadFixture(deployFixture);
      expect(await vault.balances(owner.address, NATIVE)).to.equal(ethers.parseEther("10"));
      await expect(vault.connect(owner).withdraw(NATIVE, ONE)).to.changeEtherBalance(owner, ONE);
      expect(await vault.balances(owner.address, NATIVE)).to.equal(ethers.parseEther("9"));
    });

    it("rejects zero deposits and plain transfers", async () => {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.depositNative({ value: 0 })).to.be.revertedWithCustomError(vault, "ZeroAmount");
      await expect(owner.sendTransaction({ to: await vault.getAddress(), value: 1 })).to.be.revertedWithCustomError(
        vault,
        "DirectTransferNotAllowed"
      );
    });

    it("cannot withdraw more than the balance", async () => {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).withdraw(NATIVE, ONE * 11n)).to.be.revertedWithCustomError(
        vault,
        "InsufficientBalance"
      );
    });

    it("handles ERC-20 deposits and withdrawals", async () => {
      const { vault, token, owner } = await loadFixture(deployFixture);
      await token.mint(owner.address, 1000n);
      await token.connect(owner).approve(await vault.getAddress(), 1000n);
      await vault.connect(owner).depositToken(await token.getAddress(), 600n);
      expect(await vault.balances(owner.address, await token.getAddress())).to.equal(600n);
      await vault.connect(owner).withdraw(await token.getAddress(), 100n);
      expect(await token.balanceOf(owner.address)).to.equal(500n);
    });
  });

  describe("policy validation", () => {
    it("rejects invalid policies", async () => {
      const { vault, owner, agent } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).setPolicy(agent.address, NATIVE, 0, 0, 0)).to.be.revertedWithCustomError(
        vault,
        "InvalidPolicy"
      );
      await expect(vault.connect(owner).setPolicy(agent.address, NATIVE, ONE, ONE * 2n, 0)).to.be.revertedWithCustomError(
        vault,
        "InvalidPolicy"
      );
      await expect(vault.connect(owner).setPolicy(agent.address, NATIVE, ONE, ONE, 1)).to.be.revertedWithCustomError(
        vault,
        "InvalidPolicy"
      );
    });
  });

  describe("agent spending (native)", () => {
    it("lets an agent pay an allowlisted recipient within limits", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, ONE)).to.changeEtherBalance(
        recipient,
        ONE
      );
      expect(await vault.balances(owner.address, NATIVE)).to.equal(ethers.parseEther("9"));
      expect(await vault.remainingBudget(owner.address, agent.address, NATIVE)).to.equal(ONE * 2n);
    });

    it("blocks non-allowlisted destinations", async () => {
      const { vault, owner, agent, other } = await loadFixture(deployFixture);
      await expect(vault.connect(agent).pay(owner.address, NATIVE, other.address, 1)).to.be.revertedWithCustomError(
        vault,
        "DestinationNotAllowed"
      );
    });

    it("enforces the per-transaction cap", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      await expect(
        vault.connect(agent).pay(owner.address, NATIVE, recipient.address, ONE + 1n)
      ).to.be.revertedWithCustomError(vault, "PerTxLimitExceeded");
    });

    it("enforces the daily budget and resets after 24h", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      for (let i = 0; i < 3; i++) await vault.connect(agent).pay(owner.address, NATIVE, recipient.address, ONE);
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 1)).to.be.revertedWithCustomError(
        vault,
        "DailyLimitExceeded"
      );
      await time.increase(24 * 60 * 60 + 1);
      expect(await vault.remainingBudget(owner.address, agent.address, NATIVE)).to.equal(ONE * 3n);
      await vault.connect(agent).pay(owner.address, NATIVE, recipient.address, ONE);
    });

    it("rejects zero amounts and agents with no policy", async () => {
      const { vault, owner, agent, other, recipient } = await loadFixture(deployFixture);
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 0)).to.be.revertedWithCustomError(
        vault,
        "ZeroAmount"
      );
      await expect(vault.connect(other).pay(owner.address, NATIVE, recipient.address, 1)).to.be.revertedWithCustomError(
        vault,
        "AgentNotEnabled"
      );
    });

    it("cannot spend more than the owner's vault balance", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      await vault.connect(owner).withdraw(NATIVE, ethers.parseEther("9.5"));
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, ONE)).to.be.revertedWithCustomError(
        vault,
        "InsufficientBalance"
      );
    });

    it("keeps owners' balances isolated from each other", async () => {
      const { vault, owner, agent, other, recipient } = await loadFixture(deployFixture);
      // `other` has no deposit; the agent has a policy only under `owner`.
      await expect(vault.connect(agent).pay(other.address, NATIVE, recipient.address, 1)).to.be.revertedWithCustomError(
        vault,
        "AgentNotEnabled"
      );
      expect(await vault.balances(owner.address, NATIVE)).to.equal(ethers.parseEther("10"));
    });
  });

  describe("revocation and expiry", () => {
    it("stops an agent immediately when revoked, and re-enables on new policy", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).revokeAgent(agent.address)).to.emit(vault, "AgentRevoked");
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 1)).to.be.revertedWithCustomError(
        vault,
        "AgentNotEnabled"
      );
      expect(await vault.remainingBudget(owner.address, agent.address, NATIVE)).to.equal(0);
      await vault.connect(owner).setPolicy(agent.address, NATIVE, ONE, ONE, 0);
      await vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 1);
    });

    it("stops working after the policy expires", async () => {
      const { vault, owner, agent, recipient } = await loadFixture(deployFixture);
      const expiry = (await time.latest()) + 3600;
      await vault.connect(owner).setPolicy(agent.address, NATIVE, ONE, ONE, expiry);
      await vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 1);
      await time.increaseTo(expiry + 1);
      await expect(vault.connect(agent).pay(owner.address, NATIVE, recipient.address, 1)).to.be.revertedWithCustomError(
        vault,
        "PolicyExpired"
      );
    });

    it("lets the owner withdraw even after revoking", async () => {
      const { vault, owner, agent } = await loadFixture(deployFixture);
      await vault.connect(owner).revokeAgent(agent.address);
      await expect(vault.connect(owner).withdraw(NATIVE, ONE)).to.changeEtherBalance(owner, ONE);
    });
  });

  describe("agent spending (ERC-20)", () => {
    it("pays tokens within a token-specific policy", async () => {
      const { vault, token, owner, agent, recipient } = await loadFixture(deployFixture);
      const t = await token.getAddress();
      await token.mint(owner.address, 1000n);
      await token.connect(owner).approve(await vault.getAddress(), 1000n);
      await vault.connect(owner).depositToken(t, 1000n);

      // no token policy yet
      await expect(vault.connect(agent).pay(owner.address, t, recipient.address, 10n)).to.be.revertedWithCustomError(
        vault,
        "NoPolicy"
      );

      await vault.connect(owner).setPolicy(agent.address, t, 200n, 100n, 0);
      await vault.connect(agent).pay(owner.address, t, recipient.address, 100n);
      expect(await token.balanceOf(recipient.address)).to.equal(100n);
      await expect(vault.connect(agent).pay(owner.address, t, recipient.address, 101n)).to.be.revertedWithCustomError(
        vault,
        "PerTxLimitExceeded"
      );
    });
  });

  describe("callTarget", () => {
    it("calls an allowlisted contract with native value", async () => {
      const { vault, target, owner, agent } = await loadFixture(deployFixture);
      const data = target.interface.encodeFunctionData("ping");
      await vault.connect(agent).callTarget(owner.address, await target.getAddress(), ONE, data);
      expect(await target.pings()).to.equal(1n);
      expect(await target.received()).to.equal(ONE);
      expect(await vault.balances(owner.address, NATIVE)).to.equal(ethers.parseEther("9"));
    });

    it("blocks non-allowlisted targets", async () => {
      const { vault, owner, agent, other } = await loadFixture(deployFixture);
      await expect(
        vault.connect(agent).callTarget(owner.address, other.address, 1, "0x")
      ).to.be.revertedWithCustomError(vault, "DestinationNotAllowed");
    });

    it("bubbles up target reverts and does not consume budget", async () => {
      const { vault, target, owner, agent } = await loadFixture(deployFixture);
      const data = target.interface.encodeFunctionData("fail");
      await expect(
        vault.connect(agent).callTarget(owner.address, await target.getAddress(), ONE, data)
      ).to.be.revertedWith("MockTarget: nope");
      expect(await vault.remainingBudget(owner.address, agent.address, NATIVE)).to.equal(ONE * 3n);
    });
  });
});
