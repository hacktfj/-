"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LotteryInfo } from "../components/LotteryInfo";
import { BuyTicket } from "../components/BuyTicket";
import { RecentWinner } from "../components/RecentWinner";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎰</span>
            <div>
              <h1 className="text-lg font-bold text-white">链上彩票</h1>
              <p className="text-xs text-gray-400">Sepolia Testnet</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-6 text-center bg-gradient-to-b from-indigo-950/30 to-transparent">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
          透明 · 公平 · 链上可验证
        </h2>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          智能合约自动执行，Chainlink VRF 保证随机数真实性，没有庄家可以作弊
        </p>
      </section>

      {/* Main Content */}
      <section className="max-w-5xl mx-auto px-6 pb-16 space-y-8">
        {/* 彩票统计 */}
        <LotteryInfo />

        {/* 购票 + 中奖记录 */}
        <div className="grid md:grid-cols-2 gap-6">
          <BuyTicket />
          <div className="space-y-6">
            <RecentWinner />
            {/* 规则说明 */}
            <div className="card space-y-3 text-sm text-gray-400">
              <h3 className="text-white font-semibold">游戏规则</h3>
              <ul className="space-y-1 list-disc list-inside">
                <li>每张彩票 0.01 ETH</li>
                <li>每隔 1 小时自动开奖一次</li>
                <li>随机抽取一名参与者为中奖者</li>
                <li>奖金由智能合约自动发放，无需人工操作</li>
                <li>随机数由 Chainlink VRF 链上生成，公开可验证</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs pt-4">
          合约地址：
          <a
            href={`https://sepolia.etherscan.io/address/${process.env.NEXT_PUBLIC_LOTTERY_CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-400 font-mono"
          >
            {process.env.NEXT_PUBLIC_LOTTERY_CONTRACT_ADDRESS || "待部署"}
          </a>
        </p>
      </section>
    </main>
  );
}
