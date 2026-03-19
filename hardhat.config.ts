import { HardhatUserConfig, subtask } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Override the solc build task to use the locally bundled solc (no network needed)
subtask("compile:solidity:solc:get-build").setAction(
  async ({ solcVersion }: { quiet: boolean; solcVersion: string }) => {
    // Use the local bundled solcjs from the solc npm package
    const solcPath = path.resolve(
      __dirname,
      "node_modules/solc/soljson.js"
    );
    return {
      version: solcVersion,
      longVersion: `${solcVersion}+commit.8a97fa7a`,
      compilerPath: solcPath,
      isSolcJs: true,
    };
  }
);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    // Note: Chainlink contracts use ^0.8.19, compatible with 0.8.26
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
