import { multiple, percent } from "../lib/format";
import { multipleFor } from "../lib/payout";
import { poolSplit } from "../lib/phase";
import type { Duel, Side } from "../lib/types";
import { DuelImage } from "./DuelImage";

/** Share of the pool on a side: the market's implied chance that side wins. */
export const chanceOf = (duel: Duel, side: Side): number => (side === "A" ? poolSplit(duel) : 1 - poolSplit(duel));

/** The side the market currently favours, or null at an even split. */
export function leader(duel: Duel): Side | null {
  if (duel.poolA === duel.poolB) return null;
  return duel.poolA > duel.poolB ? "A" : "B";
}

interface RowProps {
  duel: Duel;
  side: Side;
  /** Show the artwork thumbnail at the start of the row. */
  thumb?: boolean;
}

/** One market outcome: artwork, side, what 1 MON pays, and the odds pill. */
export function OutcomeRow({ duel, side, thumb = true }: RowProps): JSX.Element {
  const settled = duel.outcome === "A" || duel.outcome === "B";
  const won = settled && duel.outcome === side;
  return (
    <div className="outcome">
      {thumb ? (
        <span className="outcome-thumb" data-side={side}>
          <DuelImage
            uri={side === "A" ? duel.uriA : duel.uriB}
            hash={side === "A" ? duel.hashA : duel.hashB}
            alt={`${duel.title}, side ${side}`}
          />
        </span>
      ) : null}
      <span className="outcome-name">
        Side {side}
        {won ? <span className="tiny muted"> · won</span> : null}
      </span>
      <span className="outcome-pays">{settled ? "" : `Pays ${multiple(multipleFor(duel, side))}`}</span>
      <span className={`odds odds-${side.toLowerCase()}`}>{percent(chanceOf(duel, side))}</span>
    </div>
  );
}

/** Pool split as a slim two-colour meter. */
export function SplitBar({ duel }: { duel: Duel }): JSX.Element {
  return (
    <div
      className="split-bar"
      style={{ ["--split" as string]: `${(poolSplit(duel) * 100).toFixed(2)}%` }}
      role="img"
      aria-label={`A ${percent(poolSplit(duel))}, B ${percent(1 - poolSplit(duel))}`}
    >
      <span />
    </div>
  );
}
