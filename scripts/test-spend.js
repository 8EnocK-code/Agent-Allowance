// Agent spending-limit test on BOT Chain testnet.
// Usage:
//   AGENT_KEY=0x... OWNER_ADDRESS=0x... [RECIPIENT=0x...] npx hardhat run scripts/test-spend.js --network botTestnet
//
// The agent attempts: a valid payment, an over-per-tx payment, then enough
// payments to breach the daily budget. Each attempt prints SUCCESS or the
// contract's revert reason, with an explorer link for sent transactions.
// Prerequisites (owner console): vault funded, policy set, RECIPIENT allowlisted
// via setDestination, and the agent account holding a little test BOT for gas.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const EXPLORER = "https://scan.bohr.life";

async function main() {
  const { ethers } = hre;
  const AGENT_KEY = process.env.AGENT_KEY;
  const OWNER = process.env.OWNER_ADDRESS;
  if (!AGENT_KEY) throw new Error("Set AGENT_KEY in .env (the agent's private key, testnet only).");
  if (!OWNER || !ethers.isAddress(OWNER)) throw new Error("Set OWNER_ADDRESS in .env (the vault owner's address).");
  const RECIPIENT = process.env.RECIPIENT && ethers.isAddress(process.env.RECIPIENT)
    ? process.env.RECIPIENT
    : OWNER;

  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"));
  const agent = new ethers.Wallet(AGENT_KEY, ethers.provider);
  const vault = await ethers.getContractAt("AgentVault", dep.contracts.AgentVault, agent);
  const NATIVE = await vault.NATIVE();
  console.log(`Agent:     ${agent.address}`);
  console.log(`Owner:     ${OWNER}`);
  console.log(`Recipient: ${RECIPIENT}`);
  console.log(`Agent gas balance: ${ethers.formatEther(await ethers.provider.getBalance(agent.address))} BOT`);

  const policy = await vault.policies(OWNER, agent.address, NATIVE);
  console.log(`Policy: daily=${ethers.formatEther(policy.dailyLimit)} perTx=${ethers.formatEther(policy.perTxLimit)}`);
  console.log(`Vault BOT balance: ${ethers.formatEther(await vault.balances(OWNER, NATIVE))}`);
  console.log(`Destination allowed: ${await vault.allowedDestination(OWNER, agent.address, RECIPIENT)}`);
  if (!(await vault.allowedDestination(OWNER, agent.address, RECIPIENT))) {
    throw new Error(`Allowlist ${RECIPIENT} first: setDestination(${agent.address}, ${RECIPIENT}, true) in the console.`);
  }

  const attempt = async (label, amount) => {
    process.stdout.write(`\n${label} (${ethers.formatEther(amount)} BOT)... `);
    try {
      const tx = await vault.pay(OWNER, NATIVE, RECIPIENT, amount);
      console.log(`SENT ${EXPLORER}/tx/${tx.hash}`);
      const receipt = await tx.wait();
      if (receipt.status === 0) console.log("  RESULT: reverted on-chain");
      else console.log(`  RESULT: SUCCESS, remaining budget now ${ethers.formatEther(await vault.remainingBudget(OWNER, agent.address, NATIVE))} BOT`);
    } catch (e) {
      const reason = e?.revert?.name || e?.errorName || e?.shortMessage || e?.message;
      console.log(`BLOCKED: ${reason}`);
    }
  };

  // 1. Valid: inside per-tx cap and daily budget.
  await attempt("1. valid payment", ethers.parseEther("0.1"));
  // 2. Over the 0.2 per-transaction cap -> PerTxLimitExceeded.
  await attempt("2. over per-tx cap", ethers.parseEther("0.3"));
  // 3. Fill the 0.5 daily budget (0.1 spent + 0.2 + 0.2 = 0.5), then breach it.
  await attempt("3a. fill budget", ethers.parseEther("0.2"));
  await attempt("3b. fill budget", ethers.parseEther("0.2"));
  await attempt("3c. breach daily budget", ethers.parseEther("0.1"));
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
