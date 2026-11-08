"use client";

import { useEffect, useState } from "react";

export function useLiveNow(enabled: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return enabled ? now : null;
}
