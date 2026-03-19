"use client";

import { useLotteryInfo } from "../hooks/useLottery";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function RecentWinner() {
  const { recentWinner, roundNumber } = useLotteryInfo();

  const hasWinner = recentWinner && recentWinner !== ZERO_ADDRESS;

  return (
    <div className="card">
      <h2 className="text-xl font-bold text-white mb-4">上期中奖</h2>
      {hasWinner ? (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-2xl">
            🏆
          </div>
          <div>
            <p className="text-gray-400 text-sm">第 {Number(roundNumber ?? 1n) - 1} 期中奖地址</p>
            <a
              href={`https://sepolia.etherscan.io/address/${recentWinner}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 font-mono hover:underline"
            >
              {shortenAddress(recentWinner)}
            </a>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">暂无开奖记录，成为第一期中奖者吧！</p>
      )}
    </div>
  );
}
