/** Hash routing: no server rewrites needed, and every screen is linkable. */
import { useEffect, useState } from "react";
import { isRoom, type Room } from "./env";

export type Route =
  | { name: "feed"; room: Room }
  | { name: "duel"; id: string }
  | { name: "create" }
  | { name: "leaderboard"; room: Room | null }
  | { name: "profile"; address: string | null };

export const paths = {
  feed: (room: Room): string => `#/r/${room}`,
  duel: (id: string): string => `#/d/${id}`,
  create: (): string => "#/create",
  leaderboard: (room?: Room): string => (room ? `#/leaderboard/${room}` : "#/leaderboard"),
  profile: (address?: string): string => (address ? `#/u/${address}` : "#/me"),
};

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [head, tail] = parts;

  if (head === "d" && tail) return { name: "duel", id: tail };
  if (head === "create") return { name: "create" };
  if (head === "leaderboard") return { name: "leaderboard", room: tail && isRoom(tail) ? tail : null };
  if (head === "me") return { name: "profile", address: null };
  if (head === "u" && tail) return { name: "profile", address: tail.toLowerCase() };
  if (head === "r" && tail && isRoom(tail)) return { name: "feed", room: tail };
  return { name: "feed", room: "purdue" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export const go = (path: string): void => {
  location.hash = path.startsWith("#") ? path.slice(1) : path;
};
