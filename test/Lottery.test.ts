import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Lottery, VRFCoordinatorV2_5Mock } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const TICKET_PRICE = ethers.parseEther("0.01");
const INTERVAL = 3600; // 1 hour
const KEY_HASH =
  "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc";

describe("Lottery", function () {
  let lottery: Lottery;
  let vrfCoordinator: VRFCoordinatorV2_5Mock;
  let deployer: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let subscriptionId: bigint;

  beforeEach(async function () {
    [deployer, player1, player2] = await ethers.getSigners();

    // 部署 Mock VRF Coordinator (使用小额费用以便测试)
    // baseFee: 0.1 LINK (in Juels = 1e17), gasPriceLink: 1e9, weiPerUnitLink: 4e15
    const MockVRF = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    vrfCoordinator = (await MockVRF.deploy(
      100_000,   // baseFee: 0.0000000001 LINK (in Juels, very small for testing)
      1_000_000, // gasPriceLink: 1 microGwei
      4_000_000_000_000_000n // weiPerUnitLink: 0.004 ETH
    )) as VRFCoordinatorV2_5Mock;
    await vrfCoordinator.waitForDeployment();

    // 创建并充值 Subscription，从事件中获取真实的 subscriptionId
    const tx = await vrfCoordinator.createSubscription();
    const receipt = await tx.wait();
    // 从 SubscriptionCreated 事件获取 subscriptionId
    const subEvent = receipt?.logs
      .map((log) => {
        try {
          return vrfCoordinator.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "SubscriptionCreated");
    subscriptionId = subEvent?.args.subId ?? BigInt(1);

    await vrfCoordinator.fundSubscription(
      subscriptionId,
      ethers.parseEther("10")
    );

    // 部署 Lottery
    const Lottery = await ethers.getContractFactory("Lottery");
    lottery = (await Lottery.deploy(
      await vrfCoordinator.getAddress(),
      subscriptionId,
      KEY_HASH,
      TICKET_PRICE,
      INTERVAL
    )) as Lottery;
    await lottery.waitForDeployment();

    // 将 Lottery 加入 VRF Consumer 白名单
    await vrfCoordinator.addConsumer(
      subscriptionId,
      await lottery.getAddress()
    );
  });

  // ─── 部署测试 ────────────────────────────────────────────────
  describe("Deployment", function () {
    it("Should set the correct ticket price", async function () {
      expect(await lottery.getTicketPrice()).to.equal(TICKET_PRICE);
    });

    it("Should start in OPEN state", async function () {
      expect(await lottery.getLotteryState()).to.equal(0); // LotteryState.OPEN
    });

    it("Should start at round 1", async function () {
      expect(await lottery.getRoundNumber()).to.equal(1);
    });

    it("Should set correct owner", async function () {
      expect(await lottery.getOwner()).to.equal(deployer.address);
    });
  });

  // ─── 购票测试 ────────────────────────────────────────────────
  describe("enterLottery", function () {
    it("Should allow entering with exact ticket price", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      expect(await lottery.getNumberOfPlayers()).to.equal(1);
      expect(await lottery.getPlayer(0)).to.equal(player1.address);
    });

    it("Should allow entering with more than ticket price", async function () {
      await lottery
        .connect(player1)
        .enterLottery({ value: ethers.parseEther("0.05") });
      expect(await lottery.getNumberOfPlayers()).to.equal(1);
    });

    it("Should revert if not enough ETH", async function () {
      await expect(
        lottery
          .connect(player1)
          .enterLottery({ value: ethers.parseEther("0.001") })
      ).to.be.revertedWithCustomError(lottery, "Lottery__NotEnoughETH");
    });

    it("Should emit TicketPurchased event", async function () {
      await expect(
        lottery.connect(player1).enterLottery({ value: TICKET_PRICE })
      )
        .to.emit(lottery, "TicketPurchased")
        .withArgs(player1.address, 1);
    });

    it("Should accumulate prize pool", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await lottery.connect(player2).enterLottery({ value: TICKET_PRICE });
      expect(await lottery.getPrizePool()).to.equal(TICKET_PRICE * 2n);
    });

    it("Should revert when lottery is not open", async function () {
      // 购票并触发开奖流程
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);
      await lottery.performUpkeep("0x");

      // 此时状态为 CALCULATING，再购票应 revert
      await expect(
        lottery.connect(player2).enterLottery({ value: TICKET_PRICE })
      ).to.be.revertedWithCustomError(lottery, "Lottery__NotOpen");
    });
  });

  // ─── checkUpkeep 测试 ────────────────────────────────────────
  describe("checkUpkeep", function () {
    it("Should return false if no players", async function () {
      await time.increase(INTERVAL + 1);
      const [upkeepNeeded] = await lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
    });

    it("Should return false if interval not passed", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      const [upkeepNeeded] = await lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
    });

    it("Should return true when conditions are met", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);
      const [upkeepNeeded] = await lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.true;
    });
  });

  // ─── performUpkeep 测试 ──────────────────────────────────────
  describe("performUpkeep", function () {
    it("Should revert if upkeep not needed", async function () {
      await expect(lottery.performUpkeep("0x")).to.be.revertedWithCustomError(
        lottery,
        "Lottery__UpkeepNotNeeded"
      );
    });

    it("Should change state to CALCULATING", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);
      await lottery.performUpkeep("0x");
      expect(await lottery.getLotteryState()).to.equal(1); // CALCULATING
    });

    it("Should emit WinnerRequested event", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);
      await expect(lottery.performUpkeep("0x")).to.emit(
        lottery,
        "WinnerRequested"
      );
    });
  });

  // ─── 开奖（VRF 回调）测试 ────────────────────────────────────
  describe("fulfillRandomWords (End-to-End)", function () {
    it("Should pick winner and distribute prize correctly", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await lottery.connect(player2).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);

      const totalPool = await lottery.getPrizePool();
      const expectedWinnerPrize = (totalPool * 90n) / 100n;
      const expectedOwnerFee = (totalPool * 5n) / 100n;

      // 触发开奖
      const tx = await lottery.performUpkeep("0x");
      const receipt = await tx.wait();

      // 从事件获取 requestId
      const requestedEvent = receipt?.logs.find((log) => {
        try {
          const parsed = lottery.interface.parseLog(log as any);
          return parsed?.name === "WinnerRequested";
        } catch {
          return false;
        }
      });
      expect(requestedEvent).to.not.be.undefined;
      const parsedEvent = lottery.interface.parseLog(requestedEvent as any);
      const requestId = parsedEvent?.args[0];

      // 记录开奖前余额
      const deployerBalanceBefore = await ethers.provider.getBalance(
        deployer.address
      );
      const player1BalanceBefore = await ethers.provider.getBalance(
        player1.address
      );
      const player2BalanceBefore = await ethers.provider.getBalance(
        player2.address
      );

      // Mock VRF 回调（随机数 = 0，选第一个玩家）
      await vrfCoordinator.fulfillRandomWords(
        requestId,
        await lottery.getAddress()
      );

      // 验证状态已重置
      expect(await lottery.getLotteryState()).to.equal(0); // OPEN
      expect(await lottery.getNumberOfPlayers()).to.equal(0);
      expect(await lottery.getRoundNumber()).to.equal(2);

      // 验证中奖者获得奖金
      const winner = await lottery.getRecentWinner();
      expect([player1.address, player2.address]).to.include(winner);

      const winnerBalanceAfter = await ethers.provider.getBalance(winner);
      let winnerBalanceBefore =
        winner === player1.address ? player1BalanceBefore : player2BalanceBefore;
      expect(winnerBalanceAfter - winnerBalanceBefore).to.equal(
        expectedWinnerPrize
      );

      // 验证项目方收到手续费
      const deployerBalanceAfter = await ethers.provider.getBalance(
        deployer.address
      );
      expect(deployerBalanceAfter - deployerBalanceBefore).to.be.closeTo(
        expectedOwnerFee,
        ethers.parseEther("0.001") // 允许少量 gas 误差
      );
    });

    it("Should start new round with rollover amount", async function () {
      await lottery.connect(player1).enterLottery({ value: TICKET_PRICE });
      await time.increase(INTERVAL + 1);

      const tx = await lottery.performUpkeep("0x");
      const receipt = await tx.wait();
      const requestedEvent = receipt?.logs.find((log) => {
        try {
          return lottery.interface.parseLog(log as any)?.name === "WinnerRequested";
        } catch { return false; }
      });
      const requestId = lottery.interface.parseLog(requestedEvent as any)?.args[0];

      await vrfCoordinator.fulfillRandomWords(
        requestId,
        await lottery.getAddress()
      );

      // 验证有滚动奖池留在合约中（3% rollover + 2% VRF 缓冲 = 5% 留在合约）
      const rollover = await lottery.getRolloverAmount();
      expect(rollover).to.be.gt(0);
      // prizePool = rollover(3%) + VRF buffer(2%), so prizePool >= rollover
      expect(await lottery.getPrizePool()).to.be.gte(rollover);
    });
  });
});
