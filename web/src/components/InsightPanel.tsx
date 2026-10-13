import { getInsight } from "../lib/data";
import { useAsync } from "../lib/useAsync";

/**
 * Post-duel read from Hunyuan vision: not "B won 12-7", but why it won and what to do next. This is
 * the part a creator actually comes back for.
 */
export function InsightPanel({ duelId }: { duelId: string }): JSX.Element | null {
  const { data, loading } = useAsync(() => getInsight(duelId), [duelId]);

  if (loading) return <div className="skeleton" style={{ height: 120 }} aria-hidden="true" />;
  if (!data) return null;

  return (
    <div className="card card-pad stack-sm">
      <div className="spread">
        <h3>Why {data.winner} won</h3>
        <span className="pill">Hunyuan vision</span>
      </div>
      <p>{data.why}</p>
      {data.tips.length > 0 ? (
        <>
          <p className="small muted">For the next piece</p>
          <ul className="list">
            {data.tips.map((tip) => (
              <li key={tip}>
                <span className="small">{tip}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
