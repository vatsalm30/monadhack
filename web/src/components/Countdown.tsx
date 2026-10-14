import { useEffect, useState } from "react";
import { countdown } from "../lib/format";
import { nowSeconds, phaseOf, secondsLeft } from "../lib/phase";
import type { Duel, Phase } from "../lib/types";

const SHORT: Record<Phase, string> = {
  COMMIT: "Open",
  REVEAL: "Revealing",
  ENDED: "Ready to settle",
  SETTLED: "Settled",
};

/** Live phase label. Re-renders once a second only while the duel still has a clock. */
export function PhaseBadge({ duel, compact = false }: { duel: Duel; compact?: boolean }): JSX.Element {
  const [now, setNow] = useState(nowSeconds);
  const phase = phaseOf(duel, now);
  const left = secondsLeft(duel, now);

  useEffect(() => {
    if (left === null) return;
    const timer = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(timer);
  }, [left === null]);

  if (compact) {
    return <span className="tiny muted mono">{left === null ? SHORT[phase] : countdown(left)}</span>;
  }

  const tone = phase === "COMMIT" ? "pill-live" : phase === "REVEAL" ? "pill-a" : "pill-done";
  const label =
    phase === "SETTLED"
      ? duel.outcome === "REFUND"
        ? "Refunded"
        : `Settled · ${duel.outcome} won`
      : SHORT[phase];

  return (
    <span className={`pill ${tone} mono`}>
      {label}
      {left === null ? "" : ` · ${countdown(left)} left`}
    </span>
  );
}
