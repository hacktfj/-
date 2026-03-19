import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { LOTTERY_ABI } from "../lib/lotteryABI";
import { LOTTERY_CONTRACT_ADDRESS } from "../config/wagmi";

// 状态枚举
export enum LotteryState {
  OPEN = 0,
  CALCULATING = 1,
}

// 批量读取合约状态
export function useLotteryInfo() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getTicketPrice" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getLotteryState" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getNumberOfPlayers" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getPrizePool" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getRecentWinner" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getRoundNumber" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getLastTimestamp" },
      { address: LOTTERY_CONTRACT_ADDRESS, abi: LOTTERY_ABI, functionName: "getInterval" },
    ],
    query: { refetchInterval: 10_000 }, // 每 10 秒自动刷新
  });

  const [ticketPrice, lotteryState, numPlayers, prizePool, recentWinner, roundNumber, lastTimestamp, interval] =
    data?.map((d) => d.result) ?? [];

  return {
    ticketPrice: ticketPrice as bigint | undefined,
    ticketPriceFormatted: ticketPrice ? formatEther(ticketPrice as bigint) : "0",
    lotteryState: lotteryState as LotteryState | undefined,
    isOpen: lotteryState === LotteryState.OPEN,
    numPlayers: numPlayers as bigint | undefined,
    prizePool: prizePool as bigint | undefined,
    prizePoolFormatted: prizePool ? formatEther(prizePool as bigint) : "0",
    recentWinner: recentWinner as `0x${string}` | undefined,
    roundNumber: roundNumber as bigint | undefined,
    lastTimestamp: lastTimestamp as bigint | undefined,
    interval: interval as bigint | undefined,
    isLoading,
    refetch,
  };
}

// 购票
export function useBuyTicket() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buyTicket = (ticketPrice: bigint) => {
    writeContract({
      address: LOTTERY_CONTRACT_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: "enterLottery",
      value: ticketPrice,
    });
  };

  return {
    buyTicket,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

// 手动触发开奖（任意人均可调用）
export function usePerformUpkeep() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const triggerDraw = () => {
    writeContract({
      address: LOTTERY_CONTRACT_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: "performUpkeep",
      args: ["0x"],
    });
  };

  return { triggerDraw, hash, isPending, isConfirming, isSuccess };
}
