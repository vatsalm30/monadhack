import { useState } from "react";
import { clearError, createAccount, forgetKnown, signIn, useAccount } from "../lib/account";

/** One decision, two buttons. Everything else about accounts is deliberately unexplained. */
export function Onboard(): JSX.Element {
  const account = useAccount();
  const [label, setLabel] = useState("");
  const working = account.status === "working";

  return (
    <div className="onboard">
      <div className="stack-sm">
        <h1>Two artworks. One crowd. Your call.</h1>
        <p className="muted">
          Predict which piece the crowd picks, earn the pool and build taste rep. Creators earn from
          every duel they post.
        </p>
      </div>

      <div className="card" aria-hidden="true">
        <div className="seam" style={{ ["--split" as string]: "62%" }}>
          <div className="seam-side seam-side-a" style={{ background: "var(--a)" }} />
          <div className="seam-side seam-side-b" style={{ background: "var(--b)" }} />
          <div className="seam-rule" />
          <span className="seam-tag seam-tag-a">A</span>
          <span className="seam-tag seam-tag-b">B</span>
        </div>
      </div>

      {account.error ? (
        <p className="alert alert-bad" role="alert">
          {account.error}
        </p>
      ) : null}

      <div className="stack">
        <div className="field">
          <label htmlFor="label">Name for your passkey</label>
          <input
            id="label"
            className="input"
            placeholder="e.g. purdue studio"
            value={label}
            autoComplete="username"
            onChange={(event) => {
              setLabel(event.target.value);
              clearError();
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={working}
          onClick={() => void createAccount(label)}
        >
          {working ? "Waiting for your passkey…" : "Create account with passkey"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={working} onClick={() => void signIn()}>
          Sign in
        </button>
        {account.known ? (
          <button type="button" className="btn btn-ghost btn-block small" onClick={forgetKnown}>
            Use a different passkey on this device
          </button>
        ) : null}
      </div>

      <p className="tiny muted">
        No wallet, no seed phrase. Your account is a passkey: Face ID, Touch ID or your device PIN.
      </p>
    </div>
  );
}
