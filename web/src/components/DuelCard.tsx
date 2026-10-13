import { monWithUnit } from "../lib/format";
import { paths } from "../lib/router";
import type { Duel } from "../lib/types";
import { PhaseBadge } from "./Countdown";
import { Seam } from "./Seam";

export function DuelCard({ duel }: { duel: Duel }): JSX.Element {
  return (
    <a className="card duel-card" href={paths.duel(duel.id)}>
      <Seam duel={duel} showWinner />
      <div className="card-pad stack-sm">
        <div className="spread">
          <h3>{duel.title}</h3>
          <PhaseBadge duel={duel} />
        </div>
        <p className="small muted mono">
          {monWithUnit(duel.poolA + duel.poolB)} pool · {duel.predictors} predicting ·{" "}
          {duel.votesA + duel.votesB > 0
            ? `${duel.votesA + duel.votesB} votes in`
            : `${duel.committedVotes} ballots sealed`}
        </p>
      </div>
    </a>
  );
}
