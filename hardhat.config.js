require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();


// Optional: compile with the bundled solc-js when the native compiler can't be downloaded
// (offline CI, restricted sandboxes). Usage: USE_SOLCJS=1 npx hardhat test
if (process.env.USE_SOLCJS) {
  const { subtask } = require("hardhat/config");
  const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion === "0.8.24") {
      return {
        compilerPath: require.resolve("solc/soljson.js"),
        isSolcJs: true,
        version: "0.8.24",
        longVersion: "0.8.24+commit.e11b9ed9",
      };
    }
    return runSuper();
  });
}

const PK = process.env.PRIVATE_KEY;
const accounts = PK ? [PK] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // "paris" avoids PUSH0, the safest choice for a chain whose EVM version is not documented
      evmVersion: "paris",
    },
  },
  networks: {
    botMainnet: {
      url: process.env.MAINNET_RPC_URL || "https://rpc.botchain.ai",
      chainId: 677,
      accounts,
    },
    botTestnet: {
      // Testnet-first: default RPC from the BOT Chain quick guide.
      // Override with TESTNET_RPC_URL in .env if needed.
      url: process.env.TESTNET_RPC_URL || "https://rpc.bohr.life",
      chainId: 968,
      accounts,
    },
  },
  etherscan: {
    // Only needed if the explorer exposes an Etherscan-compatible API (not stated in the guide).
    apiKey: { botMainnet: process.env.BOTSCAN_API_KEY || "no-key", botTestnet: process.env.BOTSCAN_API_KEY || "no-key" },
    customChains: [
      {
        network: "botMainnet",
        chainId: 677,
        urls: {
          apiURL: process.env.BOTSCAN_API_URL || "https://scan.botchain.ai/api",
          browserURL: "https://scan.botchain.ai",
        },
      },
    ],
  },
};
