import { formatEther } from "viem";

/** Wei to a short MON string: trims trailing zeros, keeps at most 4 decimals. */
export function mon(wei: bigint, maxDecimals = 4): string {
  const raw = formatEther(wei);
  const [whole = "0", frac = ""] = raw.split(".");
  if (frac === "") return whole;
  const cut = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return cut === "" ? whole : `${whole}.${cut}`;
}

export const monWithUnit = (wei: bigint, maxDecimals = 4): string => `${mon(wei, maxDecimals)} MON`;

export function shortAddress(address: string): string {
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** `2:05`, `1h 04m`, `3d 2h`. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 86_400) {
    const d = Math.floor(s / 86_400);
    return `${d}d ${Math.floor((s % 86_400) / 3600)}h`;
  }
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    return `${h}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** `4 minutes ago`, `2 days ago`. */
export function timeAgo(unixSeconds: number, now = Math.floor(Date.now() / 1000)): string {
  const d = Math.max(0, now - unixSeconds);
  if (d < 60) return "just now";
  const units: [number, string][] = [
    [86_400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (d >= size) {
      const n = Math.floor(d / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** `1.86x`, or a dash when there is no price yet. */
export const multiple = (value: number | null): string => (value === null ? "—" : `${value.toFixed(2)}x`);
