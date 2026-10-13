import { useEffect, useState } from "react";
import { clearError, signOut, touch, useAccount } from "./lib/account";
import { USING_MOCK } from "./lib/data";
import { CHAIN_READY } from "./lib/env";
import { shortAddress } from "./lib/format";
import { paths, useRoute } from "./lib/router";
import { Create } from "./screens/Create";
import { DuelScreen } from "./screens/DuelScreen";
import { Feed } from "./screens/Feed";
import { LeaderboardScreen } from "./screens/LeaderboardScreen";
import { Onboard } from "./screens/Onboard";
import { Profile } from "./screens/Profile";

export function App(): JSX.Element {
  const account = useAccount();
  const route = useRoute();
  const [browsing, setBrowsing] = useState(false);
  const signedIn = account.status === "signed-in";

  // Any interaction pushes back the 15-minute idle timeout.
  useEffect(() => {
    if (!signedIn) return;
    const bump = (): void => touch();
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [signedIn]);

  if (!signedIn && !browsing) {
    return (
      <main className="shell">
        <Onboard />
        <p className="center" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setBrowsing(true)}>
            Look around first
          </button>
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href={paths.feed("purdue")}>
            <span className="brand-mark" aria-hidden="true" />
            Pairwise
          </a>
          <nav className="nav">
            <a href={paths.feed("purdue")} aria-current={route.name === "feed" ? "page" : undefined}>
              Feed
            </a>
            <a href={paths.leaderboard()} aria-current={route.name === "leaderboard" ? "page" : undefined}>
              Leaders
            </a>
            <a href={paths.profile()} aria-current={route.name === "profile" ? "page" : undefined}>
              {signedIn ? shortAddress(account.address ?? "") : "Me"}
            </a>
            {signedIn ? (
              <button type="button" className="btn btn-ghost small" onClick={() => signOut()}>
                Sign out
              </button>
            ) : (
              <button type="button" className="btn btn-primary small" onClick={() => setBrowsing(false)}>
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="shell" style={{ paddingTop: 18 }}>
        <div className="stack">
          {account.notice ? (
            <p className="alert alert-ok" role="status" onClick={clearError}>
              {account.notice}
            </p>
          ) : null}
          {account.error ? (
            <p className="alert alert-bad" role="alert" onClick={clearError}>
              {account.error}
            </p>
          ) : null}
          {USING_MOCK || !CHAIN_READY ? (
            <p className="note">
              Demo data. Set <code>VITE_ENVIO_URL</code> and <code>VITE_CONTRACT</code> to run against
              Monad testnet.
            </p>
          ) : null}

          {route.name === "feed" ? <Feed room={route.room} /> : null}
          {route.name === "duel" ? <DuelScreen id={route.id} /> : null}
          {route.name === "create" ? <Create /> : null}
          {route.name === "leaderboard" ? <LeaderboardScreen room={route.room} /> : null}
          {route.name === "profile" ? <Profile address={route.address} /> : null}

          <footer className="footer">
            <span>Pairwise · taste markets for creators on Monad</span>
            <span>
              Accounts are passkeys (Mera) · feed from Envio · moderation and insights from Hunyuan
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}
