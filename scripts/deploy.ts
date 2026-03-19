import { ethers, network, run } from "hardhat";

// ─── Sepolia 测试网 Chainlink VRF 配置 ──────────────────────────
const SEPOLIA_VRF_COORDINATOR = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1b";
const SEPOLIA_KEY_HASH =
  "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

// ─── Hardhat 本地网络 Mock 地址（hardhat test 时使用）────────────
const MOCK_VRF_COORDINATOR = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MOCK_KEY_HASH =
  "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc";

const TICKET_PRICE = ethers.parseEther("0.01");  // 0.01 ETH 每张票
const INTERVAL = 3600; // 1 小时开一次奖（秒）

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Lottery with account:", deployer.address);
  console.log("Network:", network.name);

  let vrfCoordinator: string;
  let keyHash: string;
  let subscriptionId: bigint;

  if (network.name === "hardhat" || network.name === "localhost") {
    // 本地测试：部署 Mock VRF Coordinator
    console.log("\nDeploying Mock VRF Coordinator...");
    const MockVRF = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    const mockVRF = await MockVRF.deploy(
      ethers.parseEther("0.1"),  // baseFee
      1e9,                        // gasPriceLink
      4e15                        // weiPerUnitLink
    );
    await mockVRF.waitForDeployment();
    vrfCoordinator = await mockVRF.getAddress();
    keyHash = MOCK_KEY_HASH;
    console.log("Mock VRF Coordinator:", vrfCoordinator);

    // 创建 Subscription
    const tx = await mockVRF.createSubscription();
    const receipt = await tx.wait();
    subscriptionId = BigInt(1);
    console.log("Subscription ID:", subscriptionId);

    // 充值 LINK
    await mockVRF.fundSubscription(subscriptionId, ethers.parseEther("10"));
    console.log("Funded subscription with 10 LINK");
  } else if (network.name === "sepolia") {
    vrfCoordinator = SEPOLIA_VRF_COORDINATOR;
    keyHash = SEPOLIA_KEY_HASH;
    const subId = process.env.VRF_SUBSCRIPTION_ID;
    if (!subId || subId === "0") {
      throw new Error(
        "请先在 https://vrf.chain.link/ 创建 Subscription 并填入 .env VRF_SUBSCRIPTION_ID"
      );
    }
    subscriptionId = BigInt(subId);
  } else {
    throw new Error(`不支持的网络: ${network.name}`);
  }

  // ─── 部署 Lottery 合约 ──────────────────────────────────────
  console.log("\nDeploying Lottery contract...");
  const Lottery = await ethers.getContractFactory("Lottery");
  const lottery = await Lottery.deploy(
    vrfCoordinator,
    subscriptionId,
    keyHash,
    TICKET_PRICE,
    INTERVAL
  );
  await lottery.waitForDeployment();
  const lotteryAddress = await lottery.getAddress();
  console.log("Lottery deployed to:", lotteryAddress);

  // Sepolia：将合约添加到 VRF Subscription 白名单
  if (network.name === "hardhat" || network.name === "localhost") {
    const mockVRF = await ethers.getContractAt(
      "VRFCoordinatorV2_5Mock",
      vrfCoordinator
    );
    await mockVRF.addConsumer(subscriptionId, lotteryAddress);
    console.log("Added lottery as VRF consumer");
  } else {
    console.log("\n⚠️  手动操作提示：");
    console.log(
      `请到 https://vrf.chain.link/sepolia/${subscriptionId} 将合约地址添加为 Consumer：`
    );
    console.log(`合约地址: ${lotteryAddress}`);
  }

  // 等待区块确认（Sepolia 需要用于 Etherscan 验证）
  if (network.name === "sepolia") {
    console.log("\nWaiting for 5 block confirmations...");
    await lottery.deploymentTransaction()?.wait(5);

    console.log("\nVerifying contract on Etherscan...");
    await run("verify:verify", {
      address: lotteryAddress,
      constructorArguments: [
        vrfCoordinator,
        subscriptionId,
        keyHash,
        TICKET_PRICE,
        INTERVAL,
      ],
    });
    console.log("Contract verified on Etherscan!");
  }

  console.log("\n✅ 部署完成！");
  console.log("合约地址:", lotteryAddress);
  console.log("票价:", ethers.formatEther(TICKET_PRICE), "ETH");
  console.log("开奖间隔:", INTERVAL, "秒");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
