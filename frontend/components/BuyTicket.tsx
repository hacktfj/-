"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useLotteryInfo, useBuyTicket, LotteryState } from "../hooks/useLottery";
import { useState } from "react";

export function BuyTicket() {
  const { isConnected } = useAccount();
  const { ticketPrice, ticketPriceFormatted, lotteryState, isOpen, refetch } =
    useLotteryInfo();
  const { buyTicket, isPending, isConfirming, isSuccess, error } = useBuyTicket();
  const [bought, setBought] = useState(false);

  const handleBuy = async () => {
    if (!ticketPrice) return;
    setBought(false);
    buyTicket(ticketPrice);
  };

  // 购买成功后刷新数据
  if (isSuccess && !bought) {
    setBought(true);
    refetch();
  }

  const isDisabled = !isOpen || isPending || isConfirming || !ticketPrice;
  const buttonLabel = isPending
    ? "等待确认..."
    : isConfirming
    ? "链上确认中..."
    : `购买一张彩票 (${ticketPriceFormatted} ETH)`;

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">购买彩票</h2>
        <p className="text-gray-400 text-sm mt-1">
          每张 {ticketPriceFormatted} ETH · 开奖后自动分配奖金
        </p>
      </div>

      {/* 奖池说明 */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">中奖者获得</span>
          <span className="text-green-400 font-medium">90%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">下期滚动奖池</span>
          <span className="text-blue-400 font-medium">3%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">平台手续费</span>
          <span className="text-gray-300 font-medium">5%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">VRF 随机数费用</span>
          <span className="text-gray-300 font-medium">2%</span>
        </div>
      </div>

      {/* 状态提示 */}
      {lotteryState === LotteryState.CALCULATING && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3 text-yellow-300 text-sm">
          正在开奖，请稍候...本期购票已截止
        </div>
      )}

      {isSuccess && bought && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-3 text-green-300 text-sm">
          购票成功！祝您中奖！
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
          交易失败：{error.message.split("(")[0]}
        </div>
      )}

      {/* 按钮区 */}
      {isConnected ? (
        <button
          className="btn-primary w-full"
          onClick={handleBuy}
          disabled={isDisabled}
        >
          {buttonLabel}
        </button>
      ) : (
        <div className="flex justify-center">
          <ConnectButton label="连接钱包购票" />
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        智能合约自动执行 · 结果链上可验证 · 由 Chainlink VRF 保证公平
      </p>
    </div>
  );
}
