// Verifies deployed contracts on the BOT Chain explorer.
// NOTE: requires the explorer to expose an Etherscan-compatible API. The integration guide
// does not state this, so set BOTSCAN_API_URL in .env if it differs from the default.
// If API verification is unavailable, verify manually at https://scan.botchain.ai using
// the flattened source (npx hardhat flatten contracts/AgentVault.sol).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployment file: ${file}. Run deploy first.`);
  const { contracts } = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const [name, address] of Object.entries(contracts)) {
    try {
      console.log(`Verifying ${name} at ${address}...`);
      await hre.run("verify:verify", { address, constructorArguments: [] });
      console.log(`  verified`);
    } catch (e) {
      if (/already verified/i.test(e.message)) console.log("  already verified");
      else console.error(`  failed: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
