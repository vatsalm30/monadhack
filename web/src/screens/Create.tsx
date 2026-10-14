import { useState } from "react";
import * as actions from "../lib/actions";
import { describeTxError } from "../lib/chain";
import { uploadPair } from "../lib/data";
import { API_URL, CHAIN_READY, ROOMS, type Room } from "../lib/env";
import { compress, hashFile, type Prepared } from "../lib/image";
import { go, paths } from "../lib/router";

const DURATIONS = [
  { label: "5 minutes (demo)", seconds: 300 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86_400 },
] as const;

interface Slot {
  prepared: Prepared | null;
  error: string | null;
}

const empty: Slot = { prepared: null, error: null };

export function Create(): JSX.Element {
  const [a, setA] = useState<Slot>(empty);
  const [b, setB] = useState<Slot>(empty);
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState<Room>("purdue");
  const [seconds, setSeconds] = useState<number>(300);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(file: File | undefined, set: (slot: Slot) => void): Promise<void> {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      set({ prepared: null, error: "Use a JPEG, PNG or WebP." });
      return;
    }
    if (file.size > 4 * 1024 * 1024 * 4) {
      set({ prepared: null, error: "That file is enormous. Export it smaller and try again." });
      return;
    }
    try {
      set({ prepared: await compress(file), error: null });
    } catch (caught) {
      set({ prepared: null, error: caught instanceof Error ? caught.message : "Could not read that image." });
    }
  }

  async function post(): Promise<void> {
    if (!a.prepared || !b.prepared) {
      setError("Pick both artworks first.");
      return;
    }
    if (title.trim() === "") {
      setError("Give the duel a title.");
      return;
    }
    // The image URL is written into the contract and can never be edited, so a data URI must never
    // reach a real transaction: it would be hundreds of KB of calldata on a chain that bills the
    // declared gas limit, and it is unreadable to anyone but this browser.
    if (CHAIN_READY && API_URL === "") {
      setError("No upload server is configured, so this duel cannot be posted onchain. Set VITE_API_URL and reload.");
      return;
    }

    setError(null);
    try {
      setBusy("upload");
      let uploaded: { uriA: string; uriB: string; hashA: `0x${string}`; hashB: `0x${string}` };
      if (API_URL === "") {
        // Mock mode only: keep the images local so the flow still works end to end.
        const [hashA, hashB] = await Promise.all([hashFile(a.prepared.file), hashFile(b.prepared.file)]);
        uploaded = { uriA: a.prepared.preview, uriB: b.prepared.preview, hashA, hashB };
      } else {
        uploaded = await uploadPair(a.prepared.file, b.prepared.file);
      }
      if (uploaded.hashA === uploaded.hashB) {
        setError("Those two files are identical. Pick two different pieces.");
        return;
      }

      setBusy("post");
      const id = await actions.createDuel({
        room,
        title: title.trim(),
        uriA: uploaded.uriA,
        uriB: uploaded.uriB,
        hashA: uploaded.hashA,
        hashB: uploaded.hashB,
        commitDuration: seconds,
      });
      go(id === "" ? paths.feed(room) : paths.duel(id));
    } catch (caught) {
      setError(describeTxError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack narrow">
      <div className="stack-sm">
        <h1>Post a duel</h1>
        <p className="small muted">
          Two versions of one idea. The crowd votes, predictors stake on the outcome, and you keep 5%
          of the pool.
        </p>
      </div>

      <div className="drops">
        {([
          ["A", a, setA] as const,
          ["B", b, setB] as const,
        ]).map(([side, slot, set]) => (
          <div key={side} className="stack-sm">
            <label className="drop" data-side={side} data-filled={slot.prepared !== null}>
              {slot.prepared ? (
                <img src={slot.prepared.preview} alt={`Side ${side} preview`} />
              ) : (
                <span className="small muted">
                  <strong>Side {side}</strong>
                  <br />
                  Tap to choose an image
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`Artwork for side ${side}`}
                onChange={(event) => void take(event.target.files?.[0], set)}
              />
            </label>
            {slot.error ? <p className="tiny alert alert-bad">{slot.error}</p> : null}
          </div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          className="input"
          placeholder="e.g. Risograph cover, warm or cool"
          maxLength={80}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="room">Room</label>
        <select id="room" className="select" value={room} onChange={(event) => setRoom(event.target.value as Room)}>
          {ROOMS.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="duration">How long predictions stay open</label>
        <select
          id="duration"
          className="select"
          value={seconds}
          onChange={(event) => setSeconds(Number(event.target.value))}
        >
          {DURATIONS.map((option) => (
            <option key={option.seconds} value={option.seconds}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="tiny muted">Voters then get a 3 minute window to reveal before anyone can settle.</p>
      </div>

      {error ? (
        <p className="alert alert-bad" role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null} onClick={() => void post()}>
        {busy === "upload" ? "Checking images…" : busy === "post" ? "Posting…" : "Post duel"}
      </button>
      <p className="tiny muted">
        Uploads are screened before they go up. Images are resized to 1600px and re-encoded here, so
        posting works on a phone.
      </p>
    </div>
  );
}
