import { monWithUnit, percent } from "../lib/format";
import { DuelImage } from "./DuelImage";
import { poolSplit } from "../lib/phase";
import type { Duel } from "../lib/types";

interface SeamProps {
  duel: Duel;
  /** Shows the pool numbers under the artwork. */
  withFooter?: boolean;
  /** Dims the losing side once a duel has settled. */
  showWinner?: boolean;
  /** Thumbnail mode: no A/B tags. */
  bare?: boolean;
}

/**
 * The signature visual. Both artworks sit side by side and the seam between them is positioned at
 * the pool split, so the market *is* the layout: money on A pushes the seam right and gives A more
 * of the frame. The CSS transition means a landed prediction slides the seam rather than jumping.
 */
export function Seam({ duel, withFooter = false, showWinner = false, bare = false }: SeamProps): JSX.Element {
  const split = poolSplit(duel);
  const total = duel.poolA + duel.poolB;
  const settled = duel.outcome === "A" || duel.outcome === "B";

  return (
    <div>
      <div
        className="seam"
        style={{ ["--split" as string]: `${(split * 100).toFixed(2)}%` }}
        role="img"
        aria-label={`Side A holds ${percent(split)} of the pool, side B holds ${percent(1 - split)}.`}
      >
        <div className="seam-side seam-side-a">
          <DuelImage uri={duel.uriA} hash={duel.hashA} alt={`${duel.title}, side A`} />
        </div>
        <div className="seam-side seam-side-b">
          <DuelImage uri={duel.uriB} hash={duel.hashB} alt={`${duel.title}, side B`} />
        </div>
        <div className="seam-rule" aria-hidden="true" />
        {bare ? null : (
          <>
            <span className="seam-tag seam-tag-a" aria-hidden="true">
              A
            </span>
            <span className="seam-tag seam-tag-b" aria-hidden="true">
              B
            </span>
          </>
        )}
        {showWinner && settled ? (
          <div className="seam-win">
            <span>{duel.outcome} won</span>
          </div>
        ) : null}
        {showWinner && duel.outcome === "REFUND" ? (
          <div className="seam-win">
            <span>Refunded</span>
          </div>
        ) : null}
      </div>

      {withFooter ? (
        <div className="seam-foot">
          <div className="stack-sm">
            <strong className="mono" style={{ color: "var(--a)" }}>
              {monWithUnit(duel.poolA)}
            </strong>
            <span className="tiny muted">on A · {percent(split)}</span>
          </div>
          <span className="tiny muted mono">{monWithUnit(total)} pool</span>
          <div className="stack-sm b-col">
            <strong className="mono" style={{ color: "var(--b)" }}>
              {monWithUnit(duel.poolB)}
            </strong>
            <span className="tiny muted">on B · {percent(1 - split)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
