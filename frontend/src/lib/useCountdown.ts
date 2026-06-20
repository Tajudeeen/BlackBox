"use client";

import { useEffect, useState } from "react";

export type Countdown = {
  totalSeconds: number;
  isPast: boolean;
  label: string;
};

function formatCountdown(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const days = Math.floor(abs / 86_400);
  const hours = Math.floor((abs % 86_400) / 3_600);
  const minutes = Math.floor((abs % 3_600) / 60);
  const seconds = Math.floor(abs % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Live countdown to a unix-seconds timestamp, ticking once per second. */
export function useCountdown(closingTimeSeconds: number): Countdown {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const totalSeconds = closingTimeSeconds - now;
  const isPast = totalSeconds <= 0;
  const label = isPast ? `Closed ${formatCountdown(totalSeconds)} ago` : `Closes in ${formatCountdown(totalSeconds)}`;

  return { totalSeconds, isPast, label };
}
