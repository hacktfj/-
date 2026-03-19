// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title Lottery
 * @notice 去中心化彩票合约，使用 Chainlink VRF v2.5 提供可验证随机数
 *
 * 奖池分配：
 *   90% → 中奖者
 *    5% → 项目方（owner）
 *    3% → 下一期滚动奖池
 *    2% → 保留作为 VRF 费用缓冲
 *
 * 状态机：
 *   OPEN → CALCULATING → OPEN（新一期）
 */
contract Lottery is VRFConsumerBaseV2Plus {
    // ─── 错误定义 ───────────────────────────────────────────────
    error Lottery__NotEnoughETH();
    error Lottery__NotOpen();
    error Lottery__UpkeepNotNeeded(uint256 balance, uint256 numPlayers, uint8 state);
    error Lottery__TransferFailed();
    error Lottery__OnlyOwner();

    // ─── 类型 ────────────────────────────────────────────────────
    enum LotteryState {
        OPEN,
        CALCULATING
    }

    // ─── Chainlink VRF 参数 ─────────────────────────────────────
    // Sepolia 测试网配置
    // VRF Coordinator: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1b
    // Key Hash (500 gwei): 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;
    uint32 private constant CALLBACK_GAS_LIMIT = 500_000;

    uint256 private immutable i_subscriptionId;
    bytes32 private immutable i_keyHash;

    // ─── 彩票参数 ────────────────────────────────────────────────
    uint256 private immutable i_ticketPrice;   // 每张票的价格（ETH）
    uint256 private immutable i_interval;       // 每期最短时间间隔（秒）
    address private immutable i_owner;

    // ─── 状态变量 ────────────────────────────────────────────────
    address payable[] private s_players;
    uint256 private s_lastTimestamp;
    address private s_recentWinner;
    LotteryState private s_lotteryState;
    uint256 private s_rolloverAmount;    // 上期滚动奖池
    uint256 private s_roundNumber;

    // ─── 事件 ────────────────────────────────────────────────────
    event TicketPurchased(address indexed player, uint256 roundNumber);
    event WinnerRequested(uint256 indexed requestId, uint256 roundNumber);
    event WinnerPicked(address indexed winner, uint256 prize, uint256 roundNumber);
    event RoundStarted(uint256 roundNumber, uint256 rolloverAmount);

    // ─── 构造函数 ────────────────────────────────────────────────
    constructor(
        address vrfCoordinator,
        uint256 subscriptionId,
        bytes32 keyHash,
        uint256 ticketPrice,
        uint256 interval
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        i_subscriptionId = subscriptionId;
        i_keyHash = keyHash;
        i_ticketPrice = ticketPrice;
        i_interval = interval;
        i_owner = msg.sender;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp;
        s_roundNumber = 1;
    }

    // ─── 购票 ────────────────────────────────────────────────────
    /**
     * @notice 购买彩票，每次购买一张
     * @dev 发送的 ETH 必须等于 ticketPrice
     */
    function enterLottery() external payable {
        if (msg.value < i_ticketPrice) revert Lottery__NotEnoughETH();
        if (s_lotteryState != LotteryState.OPEN) revert Lottery__NotOpen();

        s_players.push(payable(msg.sender));
        emit TicketPurchased(msg.sender, s_roundNumber);
    }

    // ─── Chainlink Automation 接口 ───────────────────────────────
    /**
     * @notice 检查是否满足开奖条件
     * @return upkeepNeeded 是否需要执行开奖
     */
    function checkUpkeep(
        bytes memory /* checkData */
    ) public view returns (bool upkeepNeeded, bytes memory /* performData */) {
        bool isOpen = s_lotteryState == LotteryState.OPEN;
        bool timePassed = (block.timestamp - s_lastTimestamp) >= i_interval;
        bool hasPlayers = s_players.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
    }

    /**
     * @notice 触发开奖（可由 Chainlink Automation 或任意人调用）
     */
    function performUpkeep(bytes calldata /* performData */) external {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Lottery__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint8(s_lotteryState)
            );
        }

        s_lotteryState = LotteryState.CALCULATING;

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: i_keyHash,
                subId: i_subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit: CALLBACK_GAS_LIMIT,
                numWords: NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );

        emit WinnerRequested(requestId, s_roundNumber);
    }

    // ─── VRF 回调 ────────────────────────────────────────────────
    /**
     * @notice Chainlink VRF 回调，接收随机数并分配奖金
     */
    function fulfillRandomWords(
        uint256 /* requestId */,
        uint256[] calldata randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable winner = s_players[indexOfWinner];
        s_recentWinner = winner;

        uint256 totalBalance = address(this).balance;

        // 奖池分配
        uint256 winnerPrize = (totalBalance * 90) / 100;   // 90%
        uint256 ownerFee = (totalBalance * 5) / 100;        // 5%
        uint256 rollover = (totalBalance * 3) / 100;        // 3%（自动留在合约）
        // 剩余 2% 留在合约作为 VRF 费用缓冲

        uint256 currentRound = s_roundNumber;

        // 重置状态（先改状态防止重入）
        s_players = new address payable[](0);
        s_lastTimestamp = block.timestamp;
        s_lotteryState = LotteryState.OPEN;
        s_rolloverAmount = rollover;
        s_roundNumber++;

        emit WinnerPicked(winner, winnerPrize, currentRound);
        emit RoundStarted(s_roundNumber, rollover);

        // 转账
        (bool successWinner, ) = winner.call{value: winnerPrize}("");
        if (!successWinner) revert Lottery__TransferFailed();

        (bool successOwner, ) = payable(i_owner).call{value: ownerFee}("");
        if (!successOwner) revert Lottery__TransferFailed();
    }

    // ─── 视图函数 ────────────────────────────────────────────────
    function getTicketPrice() external view returns (uint256) {
        return i_ticketPrice;
    }

    function getLotteryState() external view returns (LotteryState) {
        return s_lotteryState;
    }

    function getPlayer(uint256 index) external view returns (address) {
        return s_players[index];
    }

    function getNumberOfPlayers() external view returns (uint256) {
        return s_players.length;
    }

    function getRecentWinner() external view returns (address) {
        return s_recentWinner;
    }

    function getLastTimestamp() external view returns (uint256) {
        return s_lastTimestamp;
    }

    function getInterval() external view returns (uint256) {
        return i_interval;
    }

    function getPrizePool() external view returns (uint256) {
        return address(this).balance;
    }

    function getRoundNumber() external view returns (uint256) {
        return s_roundNumber;
    }

    function getRolloverAmount() external view returns (uint256) {
        return s_rolloverAmount;
    }

    function getOwner() external view returns (address) {
        return i_owner;
    }
}
