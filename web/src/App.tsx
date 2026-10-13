import { useEffect, useState } from "react";
import { getFeed, USING_MOCK } from "./lib/data";
import { monWithUnit } from "./lib/format";
import { PHASE_LABEL, phaseOf } from "./lib/phase";
import type { Duel } from "./lib/types";

/** Placeholder shell: step 4 replaces this with the router and screens. */
export function App(): JSX.Element {
  const [duels, setDuels] = useState<Duel[]>([]);

  useEffect(() => {
    void getFeed("purdue").then(setDuels);
  }, []);

  return (
    <main>
      <h1>Pairwise</h1>
      <p>{USING_MOCK ? "Mock data" : "Live indexer"}</p>
      <ul>
        {duels.map((duel) => (
          <li key={duel.id}>
            {duel.title} — {PHASE_LABEL[phaseOf(duel)]} — {monWithUnit(duel.poolA + duel.poolB)}
          </li>
        ))}
      </ul>
    </main>
  );
}
