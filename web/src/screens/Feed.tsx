import { useState } from "react";
import { PhaseBadge } from "../components/Countdown";
import { DuelCard } from "../components/DuelCard";
import { OutcomeRow, SplitBar, chanceOf, leader } from "../components/Outcomes";
import { Seam } from "../components/Seam";
import { getFeed, getLeaderboard } from "../lib/data";
import { ROOMS, type Room } from "../lib/env";
import { monWithUnit, percent, shortAddress } from "../lib/format";
import { phaseOf } from "../lib/phase";
import { paths } from "../lib/router";
import type { Duel } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const BLURB: Record<Room, string> = {
  purdue: "Purdue studios and student work.",
  lafayette: "Greater Lafayette, anything local.",
  open: "Post from anywhere.",
};

const total = (d: Duel): bigint => d.poolA + d.poolB;

/** Open duels first, biggest pool first: what deserves the top slot. */
function featuredOrder(duels: Duel[]): Duel[] {
  const live = duels.filter((d) => d.outcome === "OPEN");
  const pool = live.length > 0 ? live : duels;
  return [...pool].sort((a, b) => (total(b) > total(a) ? 1 : total(b) < total(a) ? -1 : 0));
}

function Featured({ duels }: { duels: Duel[] }): JSX.Element | null {
  const [index, setIndex] = useState(0);
  if (duels.length === 0) return null;
  const duel = duels[index % duels.length]!;
  const lead = leader(duel);

  return (
    <article className="card hero">
      <div className="hero-body">
        <div className="hero-meta">
          <PhaseBadge duel={duel} />
          {duels.length > 1 ? (
            <span className="hero-nav">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous featured duel"
                onClick={() => setIndex((i) => (i - 1 + duels.length) % duels.length)}
              >
                ‹
              </button>
              <span className="tiny mono">
                {(index % duels.length) + 1} of {duels.length}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next featured duel"
                onClick={() => setIndex((i) => (i + 1) % duels.length)}
              >
                ›
              </button>
            </span>
          ) : null}
        </div>

        <a href={paths.duel(duel.id)} style={{ textDecoration: "none" }}>
          <h1>{duel.title}</h1>
        </a>

        <div className="chance">
          <span className="odds-big">{lead ? percent(chanceOf(duel, lead)) : "50%"}</span>
          <span className="chance-label">{lead ? `chance the crowd picks ${lead}` : "even split so far"}</span>
        </div>

        <div className="outcomes">
          <OutcomeRow duel={duel} side="A" />
          <OutcomeRow duel={duel} side="B" />
        </div>

        <SplitBar duel={duel} />

        <div className="hero-foot">
          <span className="mono">{monWithUnit(total(duel))} pool</span>
          <span>
            {duel.predictors} predicting · {duel.committedVotes} sealed votes
          </span>
        </div>

        <a className="btn btn-primary btn-lg" href={paths.duel(duel.id)}>
          {phaseOf(duel) === "COMMIT" ? "Make your call" : "View market"}
        </a>
      </div>
      <a className="hero-art" href={paths.duel(duel.id)} aria-label={`Open ${duel.title}`}>
        <Seam duel={duel} showWinner />
      </a>
    </article>
  );
}

function ClosingSoon(): JSX.Element {
  const { data } = useAsync(async () => (await Promise.all(ROOMS.map((r) => getFeed(r)))).flat(), []);
  const soon = (data ?? [])
    .filter((d) => phaseOf(d) === "COMMIT")
    .sort((a, b) => a.commitEnd - b.commitEnd)
    .slice(0, 5);

  return (
    <section className="card rail-card" aria-labelledby="closing">
      <h2 id="closing">Closing soon</h2>
      {soon.length === 0 ? (
        <p className="small muted" style={{ padding: "8px 0 14px" }}>
          No open markets right now.
        </p>
      ) : (
        <ul className="rail-list">
          {soon.map((d) => {
            const lead = leader(d) ?? "A";
            return (
              <li key={d.id}>
                <a className="rail-item" href={paths.duel(d.id)}>
                  <span>
                    <span className="rail-title">{d.title}</span>
                    <br />
                    <span className="rail-sub">
                      <span className="cap">{d.room}</span> · side {lead} leads
                    </span>
                  </span>
                  <span className="rail-num">
                    {percent(chanceOf(d, lead))}
                    <br />
                    <PhaseBadge duel={d} compact />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TopTastemakers(): JSX.Element {
  const { data } = useAsync(() => getLeaderboard(), []);
  const rows = (data?.tastemakers ?? []).slice(0, 5);

  return (
    <section className="card rail-card" aria-labelledby="tastemakers">
      <div className="section-title">
        <h2 id="tastemakers">Top tastemakers</h2>
        <a className="small muted" href={paths.leaderboard()}>
          See all
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="small muted" style={{ padding: "8px 0 14px" }}>
          No calls settled yet.
        </p>
      ) : (
        <ul className="rail-list">
          {rows.map((row) => (
            <li key={row.id}>
              <a className="rail-item" href={paths.profile(row.id)}>
                <span>
                  <span className="rank">{row.rank}</span>
                  <span className="rail-title mono">{shortAddress(row.id)}</span>
                  <br />
                  <span className="rail-sub">
                    {row.correctCalls} of {row.predictions} calls right
                  </span>
                </span>
                <span className="rail-num">{row.tasteRep} rep</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Feed({ room }: { room: Room }): JSX.Element {
  const { data, loading, error } = useAsync(() => getFeed(room), [room]);
  const duels = data ?? [];

  return (
    <div className="board">
      <div className="stack" style={{ gap: 22 }}>
        {error ? <p className="alert alert-bad">{error}</p> : null}

        {loading ? (
          <div className="skeleton" style={{ height: 420 }} />
        ) : duels.length === 0 ? (
          <div className="card card-pad stack-sm">
            <h2>No duels in {room} yet</h2>
            <p className="small muted">Post the first one and the room gets its first market.</p>
            <div>
              <a className="btn btn-primary" href={paths.create()}>
                Post a duel
              </a>
            </div>
          </div>
        ) : (
          <>
            <Featured key={room} duels={featuredOrder(duels)} />
            <div className="feed-head">
              <div className="stack-sm">
                <h2>
                  All <span className="cap">{room}</span> duels
                </h2>
                <p className="small muted">{BLURB[room]}</p>
              </div>
              <a className="btn" href={paths.create()}>
                Post a duel
              </a>
            </div>
            <div className="feed-grid">
              {duels.map((duel) => (
                <DuelCard key={duel.id} duel={duel} />
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="rail">
        <ClosingSoon />
        <TopTastemakers />
      </aside>
    </div>
  );
}
