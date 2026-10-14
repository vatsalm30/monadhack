import { useEffect, useState } from "react";
import { clearError, signOut, touch, useAccount } from "./lib/account";
import { USING_MOCK } from "./lib/data";
import { CHAIN_READY, ROOMS } from "./lib/env";
import { shortAddress } from "./lib/format";
import { paths, useRoute } from "./lib/router";
import { Logo } from "./components/Logo";
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
      <main className="onboard-page">
        <div className="stack" style={{ justifyItems: "center", width: "100%" }}>
          <Logo />
          <Onboard />
          <button type="button" className="btn btn-ghost" onClick={() => setBrowsing(true)}>
            Look around first
          </button>
        </div>
      </main>
    );
  }

  const activeRoom = route.name === "feed" ? route.room : null;

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div className="top-row">
            <a className="brand" href={paths.feed("purdue")} aria-label="Pairwise home">
              <Logo />
            </a>
            <nav className="nav" aria-label="Main">
              <a href={paths.feed("purdue")} aria-current={route.name === "feed" || route.name === "duel" ? "page" : undefined}>
                Markets
              </a>
              <a href={paths.leaderboard()} aria-current={route.name === "leaderboard" ? "page" : undefined}>
                Leaderboard
              </a>
              <a href={paths.create()} aria-current={route.name === "create" ? "page" : undefined}>
                Post a duel
              </a>
            </nav>
            <div className="top-actions">
              {signedIn ? (
                <>
                  <a className="who mono" href={paths.profile()} aria-current={route.name === "profile" ? "page" : undefined}>
                    {shortAddress(account.address ?? "")}
                  </a>
                  <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => setBrowsing(false)}>
                    Log in
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setBrowsing(false)}>
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
          <nav className="cats" aria-label="Rooms">
            {ROOMS.map((slug) => (
              <a key={slug} href={paths.feed(slug)} aria-current={activeRoom === slug ? "page" : undefined} className="cap">
                {slug}
              </a>
            ))}
            <a href={paths.leaderboard()} aria-current={route.name === "leaderboard" ? "page" : undefined}>
              Top tastemakers
            </a>
          </nav>
        </div>
      </header>

      {USING_MOCK || !CHAIN_READY ? (
        <p className="demo-bar">
          Showing demo markets. Set <code>VITE_ENVIO_URL</code> and <code>VITE_CONTRACT</code> to trade on Monad
          testnet.
        </p>
      ) : null}

      <main className="shell" style={USING_MOCK || !CHAIN_READY ? { paddingTop: 4 } : undefined}>
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

          {route.name === "feed" ? <Feed room={route.room} /> : null}
          {route.name === "duel" ? <DuelScreen id={route.id} /> : null}
          {route.name === "create" ? <Create /> : null}
          {route.name === "leaderboard" ? <LeaderboardScreen room={route.room} /> : null}
          {route.name === "profile" ? <Profile address={route.address} /> : null}

          <footer className="footer">
            <span>Pairwise: taste markets for creators on Monad testnet.</span>
            <span>Passkey accounts by Mera. Markets indexed by Envio. Insights by Hunyuan.</span>
          </footer>
        </div>
      </main>
    </>
  );
}
