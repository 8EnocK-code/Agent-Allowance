// Commit a ProofOfThought receipt as the agent on testnet.
// Usage:
//   AGENT_KEY=0x... PROMPT="..." OUTPUT="..." MODEL="..." npx hardhat run scripts/commit-thought.js --network botTestnet
// Only keccak256 hashes go on-chain. Prints the receipt id and both hashes:
// paste the same PROMPT/OUTPUT into the console's Receipts tab to verify.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const AGENT_KEY = process.env.AGENT_KEY;
  const PROMPT = process.env.PROMPT || "";
  const OUTPUT = process.env.OUTPUT || "";
  const MODEL = process.env.MODEL || "manual-test";
  if (!AGENT_KEY) throw new Error("Set AGENT_KEY in .env (the agent's private key, testnet only).");
  if (!PROMPT || !OUTPUT) throw new Error("Set PROMPT and OUTPUT env vars (exact text to hash).");

  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"));
  const agent = new ethers.Wallet(AGENT_KEY, ethers.provider);
  const pot = await ethers.getContractAt("ProofOfThought", dep.contracts.ProofOfThought, agent);

  const promptHash = ethers.id(PROMPT);
  const outputHash = ethers.id(OUTPUT);
  console.log(`promptHash: ${promptHash}`);
  console.log(`outputHash: ${outputHash}`);
  const tx = await pot.commit(promptHash, outputHash, MODEL);
  console.log(`sent: https://scan.bohr.life/tx/${tx.hash}`);
  const receipt = await tx.wait();
  for (const log of receipt.logs) {
    try {
      const ev = pot.interface.parseLog(log);
      if (ev?.name === "ReceiptCommitted") console.log(`committed as receipt #${ev.args.id}`);
    } catch { /* not ours */ }
  }
}

main().catch((e) => { console.error(e.shortMessage || e.message || e); process.exitCode = 1; });
