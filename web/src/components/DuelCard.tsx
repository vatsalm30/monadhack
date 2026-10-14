import { monWithUnit } from "../lib/format";
import { paths } from "../lib/router";
import type { Duel } from "../lib/types";
import { PhaseBadge } from "./Countdown";
import { OutcomeRow } from "./Outcomes";
import { Seam } from "./Seam";

/** A market card: the pair as a tiny seam, the title, both outcomes with odds, and the pool. */
export function DuelCard({ duel }: { duel: Duel }): JSX.Element {
  return (
    <a className="card duel-card" href={paths.duel(duel.id)}>
      <div className="duel-card-head">
        <div className="mini-seam">
          <Seam duel={duel} bare />
        </div>
        <h3>{duel.title}</h3>
      </div>
      <div className="outcomes">
        <OutcomeRow duel={duel} side="A" thumb={false} />
        <OutcomeRow duel={duel} side="B" thumb={false} />
      </div>
      <div className="duel-card-foot">
        <span className="mono">{monWithUnit(duel.poolA + duel.poolB)} pool</span>
        <PhaseBadge duel={duel} />
      </div>
    </a>
  );
}
