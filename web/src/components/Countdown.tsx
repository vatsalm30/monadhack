import { useEffect, useState } from "react";
import { countdown } from "../lib/format";
import { PHASE_LABEL, nowSeconds, phaseOf, secondsLeft } from "../lib/phase";
import type { Duel } from "../lib/types";

/** Live phase pill. Re-renders once a second only while the duel still has a clock. */
export function PhaseBadge({ duel }: { duel: Duel }): JSX.Element {
  const [now, setNow] = useState(nowSeconds);
  const phase = phaseOf(duel, now);
  const left = secondsLeft(duel, now);

  useEffect(() => {
    if (left === null) return;
    const timer = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(timer);
  }, [left === null]);

  const tone = phase === "COMMIT" ? "pill-live" : phase === "REVEAL" ? "pill-a" : "pill-done";

  return (
    <span className={`pill ${tone}`}>
      {PHASE_LABEL[phase]}
      {left === null ? "" : ` · ${countdown(left)}`}
    </span>
  );
}
