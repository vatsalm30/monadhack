import { getLeaderboard } from "../lib/data";
import { ROOMS, type Room } from "../lib/env";
import { monWithUnit, shortAddress } from "../lib/format";
import { paths } from "../lib/router";
import { useAsync } from "../lib/useAsync";
import type { LeaderboardRow } from "../lib/types";

function Table({
  rows,
  caption,
  value,
  note,
}: {
  rows: LeaderboardRow[];
  caption: string;
  value: (row: LeaderboardRow) => string;
  note: (row: LeaderboardRow) => string;
}): JSX.Element {
  return (
    <div className="card card-pad stack-sm">
      <h3>{caption}</h3>
      {rows.length === 0 ? (
        <p className="small muted">Nobody here yet.</p>
      ) : (
        <ul className="list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="small">
                <span className="muted mono">{row.rank}.</span>{" "}
                <a className="mono" href={paths.profile(row.id)}>
                  {shortAddress(row.id)}
                </a>
                <br />
                <span className="tiny muted">{note(row)}</span>
              </span>
              <strong className="mono small">{value(row)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
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
          all rooms
        </a>
        {ROOMS.map((slug) => (
          <a key={slug} className="tab" role="tab" href={paths.leaderboard(slug)} aria-selected={room === slug}>
            {slug}
          </a>
        ))}
      </div>

      {error ? <p className="alert alert-bad">{error}</p> : null}
      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : (
        <>
          <Table
            caption="Top tastemakers"
            rows={data?.tastemakers ?? []}
            value={(row) => `${row.tasteRep} rep`}
            note={(row) =>
              `${row.correctCalls}/${row.predictions} calls right · ${monWithUnit(row.earned)} profit`
            }
          />
          <Table
            caption="Top creators"
            rows={data?.creators ?? []}
            value={(row) => monWithUnit(row.creatorEarned)}
            note={(row) => `${row.duelsCreated} duel${row.duelsCreated === 1 ? "" : "s"} posted`}
          />
        </>
      )}
    </div>
  );
}
