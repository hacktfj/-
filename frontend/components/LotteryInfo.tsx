"use client";

import { useLotteryInfo, LotteryState } from "../hooks/useLottery";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card text-center">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

export function LotteryInfo() {
  const { prizePoolFormatted, numPlayers, roundNumber, lotteryState, isLoading } =
    useLotteryInfo();

  const stateLabel =
    lotteryState === LotteryState.OPEN ? (
      <span className="text-green-400">开放购票</span>
    ) : (
      <span className="text-yellow-400">开奖中...</span>
    );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="当前奖池" value={`${prizePoolFormatted} ETH`} />
      <Stat label="参与人数" value={`${numPlayers?.toString() ?? "0"} 人`} />
      <Stat label="当前期数" value={`第 ${roundNumber?.toString() ?? "1"} 期`} />
      <Stat label="彩票状态" value={stateLabel} />
    </div>
  );
}
