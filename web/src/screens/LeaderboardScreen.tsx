import { getLeaderboard } from "../lib/data";
import { ROOMS, type Room } from "../lib/env";
import { monWithUnit, shortAddress } from "../lib/format";
import { paths } from "../lib/router";
import { useAsync } from "../lib/useAsync";
import type { LeaderboardRow } from "../lib/types";

interface Column {
  label: string;
  value: (row: LeaderboardRow) => string;
  num?: boolean;
}

function Table({ rows, caption, columns }: { rows: LeaderboardRow[]; caption: string; columns: Column[] }): JSX.Element {
  return (
    <section className="card card-pad stack-sm">
      <h2>{caption}</h2>
      {rows.length === 0 ? (
        <p className="small muted">Nobody here yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              {columns.map((c) => (
                <th key={c.label} className={c.num ? "num" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="rank">{row.rank}</span>
                  <a className="mono" href={paths.profile(row.id)}>
                    {shortAddress(row.id)}
                  </a>
                </td>
                {columns.map((c) => (
                  <td key={c.label} className={c.num ? "num" : undefined}>
                    {c.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function LeaderboardScreen({ room }: { room: Room | null }): JSX.Element {
  const { data, loading, error } = useAsync(() => getLeaderboard(room ?? undefined), [room]);

  return (
    <div className="stack">
      <div className="stack-sm">
        <h1>Leaderboard</h1>
        <p className="small muted">
          Taste rep rewards being right early, not staking the most. Creator earnings are the 5% share
          of every duel they posted.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Rooms">
        <a className="tab" role="tab" href={paths.leaderboard()} aria-selected={room === null}>
          All rooms
        </a>
        {ROOMS.map((slug) => (
          <a key={slug} className="tab cap" role="tab" href={paths.leaderboard(slug)} aria-selected={room === slug}>
            {slug}
          </a>
        ))}
      </div>

      {error ? <p className="alert alert-bad">{error}</p> : null}
      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : (
        <>
          <div className="board" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))" }}>
            <Table
              caption="Top tastemakers"
              rows={data?.tastemakers ?? []}
              columns={[
                { label: "Calls right", value: (r) => `${r.correctCalls} of ${r.predictions}`, num: true },
                { label: "Profit", value: (r) => monWithUnit(r.earned, 2), num: true },
                { label: "Taste rep", value: (r) => String(r.tasteRep), num: true },
              ]}
            />
            <Table
              caption="Top creators"
              rows={data?.creators ?? []}
              columns={[
                { label: "Duels", value: (r) => String(r.duelsCreated), num: true },
                { label: "Earned", value: (r) => monWithUnit(r.creatorEarned, 2), num: true },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
