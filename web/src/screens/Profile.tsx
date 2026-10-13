import { InsightPanel } from "../components/InsightPanel";
import { useAccount } from "../lib/account";
import { getDuelsByCreator, getPositions, getUser } from "../lib/data";
import { monWithUnit, shortAddress } from "../lib/format";
import { paths } from "../lib/router";
import { useAsync } from "../lib/useAsync";

/** Someone's taste record: rep, earnings, open positions, their duels and the insights on them. */
export function Profile({ address }: { address: string | null }): JSX.Element {
  const account = useAccount();
  const who = (address ?? account.address ?? "").toLowerCase();
  const isMe = account.address !== null && who === account.address.toLowerCase();

  const userState = useAsync(() => (who === "" ? Promise.resolve(null) : getUser(who)), [who]);
  const positionsState = useAsync(() => (who === "" ? Promise.resolve([]) : getPositions(who)), [who]);
  const duelsState = useAsync(() => (who === "" ? Promise.resolve([]) : getDuelsByCreator(who)), [who]);

  if (who === "") {
    return (
      <div className="card card-pad stack-sm">
        <h2>No profile</h2>
        <p className="small muted">Sign in to see your own record.</p>
      </div>
    );
  }

  const stats = userState.data;
  const positions = positionsState.data ?? [];
  const duels = duelsState.data ?? [];
  const settledMine = duels.filter((duel) => duel.outcome === "A" || duel.outcome === "B");
  const accuracy = stats && stats.predictions > 0 ? Math.round((stats.correctCalls / stats.predictions) * 100) : null;

  return (
    <div className="stack">
      <div className="stack-sm">
        <h1>{isMe ? "Your record" : "Taste record"}</h1>
        <p className="small muted mono">{shortAddress(who)}</p>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value mono">{stats?.tasteRep ?? 0}</div>
          <div className="tiny muted">taste rep</div>
          <div className="rep-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, ((stats?.tasteRep ?? 0) / 1000) * 100)}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-value mono">{monWithUnit(stats?.earned ?? 0n)}</div>
          <div className="tiny muted">profit from calls</div>
        </div>
        <div className="stat">
          <div className="stat-value mono">{monWithUnit((stats?.creatorEarned ?? 0n) + (stats?.voterEarned ?? 0n))}</div>
          <div className="tiny muted">creator + voter share</div>
        </div>
        <div className="stat">
          <div className="stat-value mono">{accuracy === null ? "—" : `${accuracy}%`}</div>
          <div className="tiny muted">
            {stats?.correctCalls ?? 0} of {stats?.predictions ?? 0} calls
          </div>
        </div>
      </div>

      <div className="card card-pad stack-sm">
        <h3>Positions</h3>
        {positions.length === 0 ? (
          <p className="small muted">No positions yet.</p>
        ) : (
          <ul className="list">
            {positions.map((position) => (
              <li key={position.id}>
                <span className="small">
                  <a href={paths.duel(position.duelId)}>Duel #{position.duelId}</a>
                  <br />
                  <span className="tiny muted">
                    {position.side ? `${monWithUnit(position.stake)} on ${position.side}` : "voted"}
                    {position.committed && !position.revealed ? " · ballot sealed" : ""}
                    {position.revealed ? ` · revealed ${position.revealed}` : ""}
                    {position.claimed ? " · claimed" : ""}
                  </span>
                </span>
                <a className="small" href={paths.duel(position.duelId)}>
                  open
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card card-pad stack-sm">
        <h3>Duels posted</h3>
        {duels.length === 0 ? (
          <p className="small muted">None yet.</p>
        ) : (
          <ul className="list">
            {duels.map((duel) => (
              <li key={duel.id}>
                <span className="small">
                  <a href={paths.duel(duel.id)}>{duel.title}</a>
                  <br />
                  <span className="tiny muted">
                    {duel.room} · {monWithUnit(duel.poolA + duel.poolB)} pool ·{" "}
                    {duel.outcome === "OPEN" ? "running" : duel.outcome === "REFUND" ? "refunded" : `${duel.outcome} won`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {settledMine.length > 0 ? (
        <div className="stack">
          <h2>What the crowd told you</h2>
          {settledMine.map((duel) => (
            <InsightPanel key={duel.id} duelId={duel.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
