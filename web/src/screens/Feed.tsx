import { DuelCard } from "../components/DuelCard";
import { getFeed } from "../lib/data";
import { ROOMS, type Room } from "../lib/env";
import { paths } from "../lib/router";
import { useAsync } from "../lib/useAsync";

const BLURB: Record<Room, string> = {
  purdue: "Purdue studios and student work.",
  lafayette: "Greater Lafayette, anything local.",
  open: "Open room: post from anywhere.",
};

export function Feed({ room }: { room: Room }): JSX.Element {
  const { data, loading, error } = useAsync(() => getFeed(room), [room]);

  return (
    <div className="stack">
      <div className="spread">
        <div className="stack-sm">
          <h1>Duels</h1>
          <p className="small muted">{BLURB[room]}</p>
        </div>
        <a className="btn btn-primary" href={paths.create()}>
          Post a duel
        </a>
      </div>

      <div className="tabs" role="tablist" aria-label="Rooms">
        {ROOMS.map((slug) => (
          <a
            key={slug}
            className="tab"
            role="tab"
            href={paths.feed(slug)}
            aria-selected={slug === room}
            aria-current={slug === room ? "page" : undefined}
          >
            {slug}
          </a>
        ))}
      </div>

      {error ? <p className="alert alert-bad">{error}</p> : null}

      {loading ? (
        <div className="feed-grid">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="card card-pad stack-sm">
          <h3>No duels in {room} yet</h3>
          <p className="small muted">Post the first one and the room gets its first market.</p>
          <a className="btn btn-primary" href={paths.create()}>
            Post a duel
          </a>
        </div>
      ) : (
        <div className="feed-grid">
          {data?.map((duel) => (
            <DuelCard key={duel.id} duel={duel} />
          ))}
        </div>
      )}
    </div>
  );
}
