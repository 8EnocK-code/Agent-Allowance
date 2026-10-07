const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const E = (n) => ethers.parseEther(String(n));
const FEE = 3000;

async function swapFixture() {
  const [owner, agent, other] = await ethers.getSigners();
  const vault = await (await ethers.getContractFactory("AgentVault")).deploy();
  const Token = await ethers.getContractFactory("MockToken");
  const usdt = await Token.deploy();
  const wbot = await Token.deploy();
  const router = await (await ethers.getContractFactory("MockSwapRouter")).deploy();

  await usdt.mint(owner.address, E(1000));
  await wbot.mint(await router.getAddress(), E(100000)); // router liquidity
  await usdt.mint(await router.getAddress(), E(100000));

  await usdt.connect(owner).approve(await vault.getAddress(), E(1000));
  await vault.connect(owner).depositToken(await usdt.getAddress(), E(100));

  // agent: 20/day, 10 per tx on USDT, may use router, may receive WBOT
  await vault.connect(owner).setPolicy(agent.address, await usdt.getAddress(), E(20), E(10), 0);
  await vault.connect(owner).setDestination(agent.address, await router.getAddress(), true);
  await vault.connect(owner).setOutputToken(agent.address, await wbot.getAddress(), true);

  const deadline = async () => (await time.latest()) + 600;
  const swap = async (amountIn, minOut, signer = agent, overrides = {}) =>
    vault
      .connect(signer)
      .swapExactIn(
        overrides.owner ?? owner.address,
        overrides.router ?? (await router.getAddress()),
        overrides.tokenIn ?? (await usdt.getAddress()),
        overrides.tokenOut ?? (await wbot.getAddress()),
        FEE,
        amountIn,
        minOut,
        overrides.deadline ?? (await deadline())
      );

  return { vault, usdt, wbot, router, owner, agent, other, swap };
}

describe("AgentVault swaps (phase 4)", () => {
  it("swaps within limits and credits proceeds to the owner's vault", async () => {
    const { vault, usdt, wbot, owner, agent, swap } = await loadFixture(swapFixture);
    await expect(swap(E(5), E(4))).to.emit(vault, "Swapped");
    expect(await vault.balances(owner.address, await usdt.getAddress())).to.equal(E(95));
    expect(await vault.balances(owner.address, await wbot.getAddress())).to.equal(E(5));
    expect(await wbot.balanceOf(agent.address)).to.equal(0n); // agent never receives funds
  });

  it("leaves no lingering router approval", async () => {
    const { vault, usdt, router, swap } = await loadFixture(swapFixture);
    await swap(E(5), E(1));
    expect(await usdt.allowance(await vault.getAddress(), await router.getAddress())).to.equal(0n);
  });

  it("charges the swap against the daily and per-tx limits", async () => {
    const { vault, usdt, owner, agent, swap } = await loadFixture(swapFixture);
    await expect(swap(E(11), E(1))).to.be.revertedWithCustomError(vault, "PerTxLimitExceeded");
    await swap(E(10), E(1));
    await swap(E(10), E(1));
    await expect(swap(E(1), E(1))).to.be.revertedWithCustomError(vault, "DailyLimitExceeded");
    expect(await vault.remainingBudget(owner.address, agent.address, await usdt.getAddress())).to.equal(0n);
    await time.increase(24 * 3600 + 1);
    await swap(E(1), E(1));
  });

  it("requires an allowlisted router", async () => {
    const { vault, other, swap } = await loadFixture(swapFixture);
    await expect(swap(E(1), E(1), undefined, { router: other.address })).to.be.revertedWithCustomError(
      vault,
      "DestinationNotAllowed"
    );
  });

  it("requires an allowlisted output token", async () => {
    const { vault, usdt, wbot, owner, agent, swap } = await loadFixture(swapFixture);
    await vault.connect(owner).setOutputToken(agent.address, await wbot.getAddress(), false);
    await expect(swap(E(1), E(1))).to.be.revertedWithCustomError(vault, "OutputTokenNotAllowed");
    await vault.connect(owner).setOutputToken(agent.address, await wbot.getAddress(), true);
    await expect(swap(E(1), E(1), undefined, { tokenOut: await usdt.getAddress() })).to.be.reverted;
  });

  it("rejects native, same-token and zero-minimum swaps", async () => {
    const { vault, usdt, swap } = await loadFixture(swapFixture);
    await expect(swap(E(1), E(1), undefined, { tokenIn: ethers.ZeroAddress })).to.be.revertedWithCustomError(
      vault,
      "NativeNotSupported"
    );
    await expect(swap(E(1), E(1), undefined, { tokenOut: await usdt.getAddress() })).to.be.revertedWithCustomError(
      vault,
      "SameToken"
    );
    await expect(swap(E(1), 0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("reverts when the router returns less than the minimum", async () => {
    const { router, usdt, vault, owner, swap } = await loadFixture(swapFixture);
    await router.setRate(5000); // 50% rate
    await expect(swap(E(4), E(3))).to.be.reverted; // router's own check
    expect(await vault.balances(owner.address, await usdt.getAddress())).to.equal(E(100)); // state rolled back
  });

  it("reverts on an expired deadline", async () => {
    const { swap } = await loadFixture(swapFixture);
    await expect(swap(E(1), E(1), undefined, { deadline: (await time.latest()) - 1 })).to.be.reverted;
  });

  it("refunds unconsumed input on a partial fill", async () => {
    const { router, vault, usdt, wbot, owner, swap } = await loadFixture(swapFixture);
    await router.setPull(5000); // router only takes half
    await swap(E(10), E(1));
    expect(await vault.balances(owner.address, await usdt.getAddress())).to.equal(E(95)); // 100 - 5 spent
    expect(await vault.balances(owner.address, await wbot.getAddress())).to.equal(E(5));
  });

  it("blocks a router that tries to pull more than amountIn", async () => {
    const { router, swap } = await loadFixture(swapFixture);
    await router.setPull(20000);
    await expect(swap(E(5), E(1))).to.be.reverted;
  });

  it("stops a revoked agent and an agent acting for the wrong owner", async () => {
    const { vault, owner, agent, other, swap } = await loadFixture(swapFixture);
    await expect(swap(E(1), E(1), undefined, { owner: other.address })).to.be.revertedWithCustomError(
      vault,
      "AgentNotEnabled"
    );
    await vault.connect(owner).revokeAgent(agent.address);
    await expect(swap(E(1), E(1))).to.be.revertedWithCustomError(vault, "AgentNotEnabled");
  });

  it("keeps output-token allowlists separate per owner", async () => {
    const { vault, wbot, agent, other } = await loadFixture(swapFixture);
    // setOutputToken is keyed by msg.sender, so another account only edits its own (unrelated) allowlist
    await vault.connect(other).setOutputToken(agent.address, await wbot.getAddress(), true);
    expect(await vault.allowedOutputToken(other.address, agent.address, await wbot.getAddress())).to.equal(true);
  });
});
