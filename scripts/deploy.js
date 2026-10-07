const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  if (!hre.network.config.url) {
    throw new Error(
      `No RPC URL for network "${network.name}". Set TESTNET_RPC_URL in .env ` +
      `(BOT Chain testnet, chain ID 968) and retry.`
    );
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set PRIVATE_KEY in .env");

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BOT`);

  const Vault = await ethers.getContractFactory("AgentVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  console.log(`AgentVault:     ${await vault.getAddress()}`);

  const Pot = await ethers.getContractFactory("ProofOfThought");
  const pot = await Pot.deploy();
  await pot.waitForDeployment();
  console.log(`ProofOfThought: ${await pot.getAddress()}`);

  const out = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      AgentVault: await vault.getAddress(),
      ProofOfThought: await pot.getAddress(),
    },
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Saved ${file}`);
  console.log("\nContract addresses (record these):");
  console.log(`  AgentVault:     https://scan.botchain.ai/address/${out.contracts.AgentVault}`);
  console.log(`  ProofOfThought: https://scan.botchain.ai/address/${out.contracts.ProofOfThought}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
