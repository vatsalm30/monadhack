import { useEffect, useState } from "react";
import { API_URL } from "../lib/env";

interface Props {
  /** The URI recorded onchain. May be dead: it was frozen at duel creation and cannot be edited. */
  uri: string;
  /** The sha256 of the file, also onchain. This is what makes a dead URI recoverable. */
  hash: string;
  alt: string;
  className?: string;
}

/**
 * An artwork that survives its own URL.
 *
 * `uriA`/`uriB` are written into the contract at creation and can never be changed, so a duel posted
 * against a localhost address, a hostname that later moved, or a server whose disk was wiped would
 * otherwise lose its artwork permanently.
 *
 * But uploads are content-addressed — the file is stored as `<sha256>.<ext>` — and that same sha256
 * sits onchain next to the dead URL as `hashA`/`hashB`. So the artwork is findable from the chain
 * alone: ask the server we are configured against for `/uploads/<hash>` and it serves the file no
 * matter which host originally handed out the URL.
 *
 * Order: the recorded URI, then the current server by hash, then a placeholder that still shows the
 * hash so the file can be traced by hand.
 */
export function DuelImage({ uri, hash, alt, className }: Props): JSX.Element {
  const clean = hash.replace(/^0x/, "").toLowerCase();
  const byHash = API_URL === "" || !/^[0-9a-f]{64}$/.test(clean) ? null : `${API_URL}/uploads/${clean}`;

  // The recorded URI is tried first; byHash is the recovery step; null means both failed.
  const sources: (string | null)[] = uri === "" ? [byHash] : [uri, byHash];
  const [step, setStep] = useState(0);

  // A different duel (or a repaired URL) starts the chain over.
  useEffect(() => setStep(0), [uri, clean]);

  const current = sources[step] ?? null;

  if (current === null) {
    return (
      <div className={`art-missing ${className ?? ""}`} role="img" aria-label={`${alt} (image unavailable)`}>
        <span className="tiny">Artwork unavailable</span>
        <code className="tiny mono">{clean.slice(0, 12)}…</code>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      className={className ?? ""}
      loading="lazy"
      decoding="async"
      onError={() => setStep((previous) => previous + 1)}
    />
  );
}
