import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "../lib/account";
import * as actions from "../lib/actions";
import { describeTxError } from "../lib/chain";
import { monWithUnit, percent } from "../lib/format";
import { claimable, payoutIfAdded, repIfPredictedNow } from "../lib/payout";
import { chanceOf } from "./Outcomes";
import { nowSeconds, phaseOf } from "../lib/phase";
import type { Duel, Position, Side } from "../lib/types";

interface Props {
  duel: Duel;
  position: Position | null;
  /** Refetches the duel and my position after a successful write. */
  onDone: () => void;
}

const AMOUNTS = ["0.05", "0.1", "0.25", "0.5"] as const;

type Mode = "predict" | "vote";

export function ActionPanel({ duel, position, onDone }: Props): JSX.Element {
  const account = useAccount();
  const me = account.address?.toLowerCase() ?? null;
  const phase = phaseOf(duel);
  const isCreator = me !== null && me === duel.creator.toLowerCase();

  const [mode, setMode] = useState<Mode>("predict");
  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState<string>("0.1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<Side | null>(null);

  // A predictor cannot vote and a voter cannot predict, so lock the tab to whatever they already did.
  useEffect(() => {
    if (position?.committed) setMode("vote");
    else if ((position?.stake ?? 0n) > 0n) setMode("predict");
  }, [position?.committed, position?.stake]);

  useEffect(() => {
    if (phase !== "REVEAL" || !position?.committed || position.revealed) return;
    let live = true;
    void actions
      .recoverCommittedSide(duel.id)
      .then((found) => {
        if (live) setRecovered(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [phase, duel.id, position?.committed, position?.revealed]);

  async function run(label: string, work: () => Promise<void>, success: string): Promise<void> {
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      await work();
      setDone(success);
      onDone();
    } catch (caught) {
      setError(describeTxError(caught));
    } finally {
      setBusy(null);
    }
  }

  if (account.status !== "signed-in") {
    return (
      <div className="card card-pad panel">
        <h3>Make your call</h3>
        <div className="choice">
          <button type="button" className="btn" disabled>
            A · {percent(chanceOf(duel, "A"))}
          </button>
          <button type="button" className="btn" disabled>
            B · {percent(chanceOf(duel, "B"))}
          </button>
        </div>
        <p className="muted small">Log in with your passkey to predict, vote or claim. No wallet needed.</p>
      </div>
    );
  }

  const feedback = (
    <>
      {error ? (
        <p className="alert alert-bad" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="alert alert-ok" role="status">
          {done}
        </p>
      ) : null}
    </>
  );

  // ---- commit phase ----
  if (phase === "COMMIT") {
    if (isCreator) {
      return (
        <div className="card card-pad panel">
          <h3>Your duel</h3>
          <p className="note">
            Creators cannot predict or vote on their own duel. You earn 5% of the pool when it settles.
          </p>
          {feedback}
        </div>
      );
    }

    const staked = position?.stake ?? 0n;
    const lockedSide = position?.side ?? null;
    const sealed = position?.committed === true;
    const canVote = staked === 0n;
    const canPredict = !sealed;
    const rep = repIfPredictedNow(duel, nowSeconds());

    return (
      <div className="card card-pad panel">
        <div className="row" role="tablist" aria-label="What to do">
          <button
            type="button"
            role="tab"
            className="chip"
            aria-pressed={mode === "predict"}
            aria-selected={mode === "predict"}
            disabled={!canPredict}
            onClick={() => setMode("predict")}
          >
            Predict
          </button>
          <button
            type="button"
            role="tab"
            className="chip"
            aria-pressed={mode === "vote"}
            aria-selected={mode === "vote"}
            disabled={!canVote}
            onClick={() => setMode("vote")}
          >
            Vote
          </button>
        </div>

        <p className="note">
          Predict which side the crowd picks and stake MON on it, or vote blind and shape the result.
          One or the other, never both.
        </p>

        {mode === "predict" ? (
          <>
            {lockedSide ? (
              <p className="small muted">
                You have {monWithUnit(staked)} on side {lockedSide}. Adding more keeps the same side:
                hedging is blocked.
              </p>
            ) : null}
            <div className="choice">
              <button
                type="button"
                className={`btn ${side === "A" || lockedSide === "A" ? "btn-a" : ""}`}
                disabled={lockedSide === "B"}
                aria-pressed={side === "A" || lockedSide === "A"}
                onClick={() => setSide("A")}
              >
                A · {percent(chanceOf(duel, "A"))}
              </button>
              <button
                type="button"
                className={`btn ${side === "B" || lockedSide === "B" ? "btn-b" : ""}`}
                disabled={lockedSide === "A"}
                aria-pressed={side === "B" || lockedSide === "B"}
                onClick={() => setSide("B")}
              >
                B · {percent(chanceOf(duel, "B"))}
              </button>
            </div>

            <div className="field">
              <label htmlFor="amount">Stake in MON</label>
              <input
                id="amount"
                className="input mono"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <div className="amount-row">
                {AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="chip"
                    aria-pressed={amount === value}
                    onClick={() => setAmount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const chosen = lockedSide ?? side;
              let wei = 0n;
              try {
                wei = parseEther(amount.trim() as `${number}`);
              } catch {
                wei = 0n;
              }
              if (!chosen || wei <= 0n) return null;
              return (
                <div className="payout">
                  <div className="payout-row">
                    <span className="muted">If {chosen} wins, you get</span>
                    <span className="payout-win">{monWithUnit(payoutIfAdded(duel, chosen, wei, staked), 3)}</span>
                  </div>
                  <div className="payout-row tiny muted">
                    <span>Payout moves as others predict. 7% goes to the creator and voters.</span>
                  </div>
                </div>
              );
            })()}

            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={busy !== null || (side === null && lockedSide === null)}
              onClick={() => {
                const chosen = lockedSide ?? side;
                if (!chosen) return;
                let wei: bigint;
                try {
                  wei = parseEther(amount.trim() as `${number}`);
                } catch {
                  setError("Enter an amount like 0.25.");
                  return;
                }
                void run("predict", () => actions.predict(duel.id, chosen, wei), `Prediction placed on ${chosen}.`);
              }}
            >
              {busy === "predict" ? "Placing…" : lockedSide ?? side ? `Predict ${lockedSide ?? side}` : "Pick a side"}
            </button>
            <p className="tiny muted">Calling now earns about {rep} taste rep if you are right. Earlier calls earn more.</p>
          </>
        ) : (
          <>
            {sealed ? (
              <p className="small muted">
                Your ballot is sealed. Come back in the reveal window and Pairwise will reveal it from
                your passkey.
              </p>
            ) : (
              <>
                <div className="choice">
                  <button
                    type="button"
                    className={`btn ${side === "A" ? "btn-a" : ""}`}
                    aria-pressed={side === "A"}
                    onClick={() => setSide("A")}
                  >
                    Vote A
                  </button>
                  <button
                    type="button"
                    className={`btn ${side === "B" ? "btn-b" : ""}`}
                    aria-pressed={side === "B"}
                    onClick={() => setSide("B")}
                  >
                    Vote B
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={busy !== null || side === null}
                  onClick={() => {
                    if (!side) return;
                    void run("vote", () => actions.commitVote(duel.id, side), "Ballot sealed. Reveal it after voting closes.");
                  }}
                >
                  {busy === "vote" ? "Sealing…" : "Seal my vote"}
                </button>
                <p className="tiny muted">
                  Nobody sees your choice until you reveal, and revealed voters split 2% of the pool.
                </p>
              </>
            )}
          </>
        )}
        {feedback}
      </div>
    );
  }

  // ---- reveal phase ----
  if (phase === "REVEAL") {
    if (position?.revealed) {
      return (
        <div className="card card-pad panel">
          <h3>Vote revealed</h3>
          <p className="small muted">
            You revealed side {position.revealed}. Claim your share of the voter reward once this settles.
          </p>
          {feedback}
        </div>
      );
    }
    if (!position?.committed) {
      return (
        <div className="card card-pad panel">
          <h3>Voting is closed</h3>
          <p className="small muted">Ballots are being revealed. Settling opens when the window ends.</p>
          {feedback}
        </div>
      );
    }
    return (
      <div className="card card-pad panel">
        <h3>Reveal your vote</h3>
        <p className="note">
          Your salt is derived from your passkey, so nothing was stored: this works on any device,
          even a browser you have never used.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          disabled={busy !== null}
          onClick={() => {
            const chosen = recovered;
            if (!chosen) {
              setError("Could not recover your ballot. Make sure you are signed in with the same passkey you voted with.");
              return;
            }
            void run("reveal", () => actions.revealVote(duel.id, chosen), `Vote revealed for ${chosen}.`);
          }}
        >
          {busy === "reveal" ? "Revealing…" : recovered ? `Reveal my vote (${recovered})` : "Recovering ballot…"}
        </button>
        {feedback}
      </div>
    );
  }

  // ---- ready to settle ----
  if (phase === "ENDED") {
    return (
      <div className="card card-pad panel">
        <h3>Ready to settle</h3>
        <p className="small muted">
          Anyone can settle. Votes decide the winner; a tie or too few reveals refunds every stake.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          disabled={busy !== null}
          onClick={() => void run("settle", () => actions.settle(duel.id), "Duel settled.")}
        >
          {busy === "settle" ? "Settling…" : "Settle this duel"}
        </button>
        {feedback}
      </div>
    );
  }

  // ---- settled ----
  const owed = claimable(duel, position);
  const canClaimStake = owed.winnings > 0n && position?.claimed !== true;
  const canClaimVoter = owed.voterReward > 0n && position?.voterRewardClaimed !== true;
  const canClaimCreator = isCreator && owed.creatorShare > 0n;
  const nothing = !canClaimStake && !canClaimVoter && !canClaimCreator;

  return (
    <div className="card card-pad panel">
      <h3>{duel.outcome === "REFUND" ? "Refunded" : `Side ${duel.outcome} won`}</h3>
      <p className="small muted">
        {duel.outcome === "REFUND"
          ? "A tie or too few reveals, so every stake goes back."
          : `${duel.votesA} votes for A, ${duel.votesB} for B. Winners split the pool minus 7%.`}
      </p>

      {canClaimStake ? (
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          disabled={busy !== null}
          onClick={() => void run("claim", () => actions.claim(duel.id), "Claimed.")}
        >
          {busy === "claim"
            ? "Claiming…"
            : `${owed.isRefund ? "Claim refund" : "Claim winnings"} · ${monWithUnit(owed.winnings)}`}
        </button>
      ) : null}

      {canClaimVoter ? (
        <button
          type="button"
          className="btn btn-block"
          disabled={busy !== null}
          onClick={() => void run("voter", () => actions.claimVoterReward(duel.id), "Voter reward claimed.")}
        >
          {busy === "voter" ? "Claiming…" : `Claim voter reward · ${monWithUnit(owed.voterReward)}`}
        </button>
      ) : null}

      {canClaimCreator ? (
        <button
          type="button"
          className="btn btn-block"
          disabled={busy !== null}
          onClick={() => void run("creator", () => actions.claimCreator(duel.id), "Creator share claimed.")}
        >
          {busy === "creator" ? "Claiming…" : `Claim creator share · ${monWithUnit(owed.creatorShare)}`}
        </button>
      ) : null}

      {nothing ? <p className="small muted">Nothing to claim here.</p> : null}
      {feedback}
    </div>
  );
}
