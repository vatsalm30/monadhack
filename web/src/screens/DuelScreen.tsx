import { ActionPanel } from "../components/ActionPanel";
import { ActivityList } from "../components/ActivityList";
import { PhaseBadge } from "../components/Countdown";
import { InsightPanel } from "../components/InsightPanel";
import { Seam } from "../components/Seam";
import { useAccount } from "../lib/account";
import { getActivity, getDuel, getMyPosition } from "../lib/data";
import { CHAIN_READY, CONTRACT, EXPLORER, isRoom } from "../lib/env";
import { monWithUnit, percent, shortAddress } from "../lib/format";
import { paths } from "../lib/router";
import { phaseOf, poolSplit, voteSplit } from "../lib/phase";
import { useAsync } from "../lib/useAsync";

export function DuelScreen({ id }: { id: string }): JSX.Element {
  const account = useAccount();
  const me = account.address ?? null;
  const duelState = useAsync(() => getDuel(id), [id]);
  const positionState = useAsync(() => (me ? getMyPosition(id, me) : Promise.resolve(null)), [id, me]);
  const activityState = useAsync(() => getActivity(id), [id]);

  const refresh = (): void => {
    duelState.reload();
    positionState.reload();
    activityState.reload();
  };

  if (duelState.loading) return <div className="skeleton" style={{ height: 420 }} aria-label="Loading duel" />;

  const duel = duelState.data;
  if (!duel) {
    return (
      <div className="card card-pad stack-sm">
        <h2>Duel not found</h2>
        <p className="small muted">It may still be indexing. Try again in a moment.</p>
        <a className="btn" href={paths.feed("purdue")}>
          Back to the feed
        </a>
      </div>
    );
  }

  const settled = duel.outcome === "A" || duel.outcome === "B";
  const reveals = duel.votesA + duel.votesB;
  const split = poolSplit(duel);

  return (
    <div className="stack">
      <div className="spread">
        <div className="stack-sm">
          <h1>{duel.title}</h1>
          <p className="small muted">
            <a href={paths.feed(isRoom(duel.room) ? duel.room : "open")}>{duel.room}</a> · posted by{" "}
            <a href={paths.profile(duel.creator)} className="mono">
              {shortAddress(duel.creator)}
            </a>
          </p>
        </div>
        <PhaseBadge duel={duel} />
      </div>

      <div className="card">
        <Seam duel={duel} withFooter showWinner />
      </div>

      <ActionPanel duel={duel} position={positionState.data} onDone={refresh} />

      {settled ? <InsightPanel duelId={duel.id} /> : null}

      <div className="card card-pad stack-sm">
        <h3>Where it stands</h3>
        <ul className="list">
          <li>
            <span className="small muted">Pool</span>
            <span className="small mono">{monWithUnit(duel.poolA + duel.poolB)}</span>
          </li>
          <li>
            <span className="small muted">Split</span>
            <span className="small mono">
              A {percent(split)} · B {100 - Math.round(split * 100)}%
            </span>
          </li>
          <li>
            <span className="small muted">Predictors</span>
            <span className="small mono">{duel.predictors}</span>
          </li>
          <li>
            <span className="small muted">Ballots</span>
            <span className="small mono">
              {duel.committedVotes} sealed{reveals > 0 ? `, ${reveals} revealed` : ""}
            </span>
          </li>
          {reveals > 0 ? (
            <li>
              <span className="small muted">Votes</span>
              <span className="small mono">
                A {duel.votesA} · B {duel.votesB} ({percent(voteSplit(duel))} for A)
              </span>
            </li>
          ) : null}
        </ul>
        {phaseOf(duel) === "COMMIT" ? (
          <p className="tiny muted">Votes stay hidden until the reveal window, so the pool is a real guess.</p>
        ) : null}
      </div>

      <div className="card card-pad stack-sm">
        <h3>Activity</h3>
        <ActivityList items={activityState.data ?? []} />
      </div>

      {CHAIN_READY ? (
        <p className="tiny muted">
          <a href={`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noreferrer">
            Duel #{duel.id} onchain
          </a>
        </p>
      ) : null}
    </div>
  );
}
