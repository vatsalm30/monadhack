import { monWithUnit, shortAddress, timeAgo } from "../lib/format";
import type { ActivityItem } from "../lib/types";

const LABEL: Record<ActivityItem["kind"], string> = {
  CREATED: "posted the duel",
  PREDICTED: "predicted",
  VOTE_COMMITTED: "sealed a vote",
  VOTE_REVEALED: "revealed",
  SETTLED: "settled it",
  CLAIMED: "claimed winnings",
  VOTER_REWARD: "claimed the voter reward",
  CREATOR_PAID: "took the creator share",
};

export function ActivityList({ items }: { items: ActivityItem[] }): JSX.Element {
  if (items.length === 0) {
    return <p className="small muted">Nothing yet. Be first.</p>;
  }

  return (
    <ul className="list">
      {items.map((item) => (
        <li key={item.id}>
          <span className="small">
            <strong className="mono">{shortAddress(item.user)}</strong> {LABEL[item.kind]}
            {item.side ? ` ${item.side}` : ""}
            {item.amount > 0n ? ` for ${monWithUnit(item.amount)}` : ""}
          </span>
          <span className="tiny muted">{timeAgo(item.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}
