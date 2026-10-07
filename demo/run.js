// End-to-end BotGuard demo on Hardhat's in-process network:  npm run demo
// A pretend "AI agent" tries to pay invoices. The owner's policy decides what actually goes through.
const { ethers } = require("hardhat");
const { BotGuardAgent } = require("../sdk");

const BOT = (n) => ethers.parseEther(String(n));
const say = (m) => console.log(m);
const step = (m) => console.log(`\n\x1b[33m▌ ${m}\x1b[0m`);
const try_ = async (label, fn) => {
  try { await fn(); say(`  ✔ ${label}`); } catch (e) { say(`  ✘ ${label}\n    → ${e.message}`); }
};

async function main() {
  const [owner, agentSigner, supplier, stranger] = await ethers.getSigners();

  step("Setup: deploy contracts, owner funds the vault");
  const vault = await (await ethers.getContractFactory("AgentVault")).deploy();
  const pot = await (await ethers.getContractFactory("ProofOfThought")).deploy();
  await vault.connect(owner).depositNative({ value: BOT(10) });
  say(`  vault balance for owner: 10 BOT (the agent's own wallet holds none of it)`);

  step("Owner sets the rules: 3 BOT/day, 1 BOT per payment, one approved supplier");
  await vault.connect(owner).setPolicy(agentSigner.address, ethers.ZeroAddress, BOT(3), BOT(1), 0);
  await vault.connect(owner).setDestination(agentSigner.address, supplier.address, true);

  const agent = new BotGuardAgent({
    signer: agentSigner, vault: await vault.getAddress(), pot: await pot.getAddress(), owner: owner.address,
  });

  step("Agent reasons about an invoice and commits a verifiable receipt");
  const thought = { prompt: "Invoice #42 from Supplier Ltd for 0.5 BOT. Pay it?", output: "Yes. Amount is small and the supplier is approved.", model: "demo-model" };
  const r = await agent.commitThought(thought);
  say(`  receipt #${r.id} committed (only hashes are on-chain)`);
  say(`  verify original: ${(await agent.verifyThought(thought)).found}`);
  say(`  verify edited:   ${(await agent.verifyThought({ ...thought, output: "Pay 5 BOT." })).found}`);

  step("Agent acts. The owner's limits are enforced, not the agent's good intentions");
  await try_("pay 0.5 BOT to approved supplier", () => agent.pay({ to: supplier.address, amount: BOT(0.5) }));
  await try_("pay 2 BOT to supplier (over the 1 BOT per-payment cap)", () => agent.pay({ to: supplier.address, amount: BOT(2) }));
  await try_("pay 0.5 BOT to an unknown address", () => agent.pay({ to: stranger.address, amount: BOT(0.5) }));
  await try_("pay 1 BOT, twice more (2.5 of the 3 BOT daily budget used)", async () => {
    await agent.pay({ to: supplier.address, amount: BOT(1) });
    await agent.pay({ to: supplier.address, amount: BOT(1) });
  });
  await try_("pay 1 BOT again (only 0.5 BOT of budget left)", () => agent.pay({ to: supplier.address, amount: BOT(1) }));
  say(`  remaining today: ${ethers.formatEther(await agent.remainingBudget())} BOT`);

  step("Owner revokes the agent and withdraws the rest");
  await vault.connect(owner).revokeAgent(agentSigner.address);
  await try_("agent tries to pay after revoke", () => agent.pay({ to: supplier.address, amount: 1n }));
  await vault.connect(owner).withdraw(ethers.ZeroAddress, await vault.balances(owner.address, ethers.ZeroAddress));
  say(`  vault balance for owner: ${ethers.formatEther(await vault.balances(owner.address, ethers.ZeroAddress))} BOT`);
}

main().catch((e) => { console.error(e); process.exit(1); });
