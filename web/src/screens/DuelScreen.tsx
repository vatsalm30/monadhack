import { ActionPanel } from "../components/ActionPanel";
import { ActivityList } from "../components/ActivityList";
import { PhaseBadge } from "../components/Countdown";
import { InsightPanel } from "../components/InsightPanel";
import { OutcomeRow, chanceOf, leader } from "../components/Outcomes";
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
  const lead = settled ? (duel.outcome as "A" | "B") : leader(duel);
  const roomSlug = isRoom(duel.room) ? duel.room : "open";

  return (
    <div className="split-layout">
      <div className="stack" style={{ gap: 20 }}>
        <div className="market-head">
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href={paths.feed(roomSlug)}>{duel.room}</a>
            <span aria-hidden="true">/</span>
            <span>Duel #{duel.id}</span>
          </nav>
          <h1>{duel.title}</h1>
          <div className="spread">
            <div className="chance">
              <span className="odds-big">{settled ? `${duel.outcome} won` : lead ? percent(chanceOf(duel, lead)) : "50%"}</span>
              <span className="chance-label">
                {settled
                  ? `${duel.votesA} to ${duel.votesB} in revealed votes`
                  : duel.outcome === "REFUND"
                    ? "refunded"
                    : lead
                      ? `chance the crowd picks ${lead}`
                      : "even split so far"}
              </span>
            </div>
            <PhaseBadge duel={duel} />
          </div>
          <p className="small muted">
            Posted by{" "}
            <a href={paths.profile(duel.creator)} className="mono">
              {shortAddress(duel.creator)}
            </a>{" "}
            · {monWithUnit(duel.poolA + duel.poolB)} pool · {duel.predictors} predicting
          </p>
        </div>

        <div className="card">
          <Seam duel={duel} withFooter showWinner />
        </div>

        <section className="card card-pad outcome-table" aria-label="Outcomes">
          <div className="outcome-head">
            <span />
            <span>Outcome</span>
            <span>{settled ? "" : "1 MON pays"}</span>
            <span>Chance</span>
          </div>
          <div className="outcomes">
            <OutcomeRow duel={duel} side="A" />
            <OutcomeRow duel={duel} side="B" />
          </div>
        </section>

        {settled ? <InsightPanel duelId={duel.id} /> : null}

        <section className="card card-pad stack-sm">
          <h3>Rules</h3>
          <ul className="list">
            <li>
              <span className="small muted">Split</span>
              <span className="small mono">
                A {percent(split)} · B {100 - Math.round(split * 100)}%
              </span>
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
            <li>
              <span className="small muted">Fees</span>
              <span className="small">5% to the creator, 2% to revealed voters</span>
            </li>
          </ul>
          <p className="tiny muted">
            Predictors stake on which side the crowd picks. A separate group votes blind and reveals after
            predictions close; the revealed majority settles the market. A tie or too few reveals refunds
            every stake.
          </p>
        </section>

        <section className="card card-pad stack-sm">
          <h3>Activity</h3>
          <ActivityList items={activityState.data ?? []} />
        </section>

        {CHAIN_READY ? (
          <p className="tiny muted">
            <a href={`${EXPLORER}/address/${CONTRACT}`} target="_blank" rel="noreferrer">
              Duel #{duel.id} onchain
            </a>
          </p>
        ) : null}
      </div>

      <aside className="rail-sticky stack">
        <ActionPanel duel={duel} position={positionState.data} onDone={refresh} />
        {phaseOf(duel) === "COMMIT" ? (
          <p className="tiny muted" style={{ padding: "0 4px" }}>
            Votes stay hidden until the reveal window, so the price is a real guess.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
